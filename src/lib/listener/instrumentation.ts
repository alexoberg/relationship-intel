// ============================================
// LISTENER INSTRUMENTATION
// ============================================
// Utilities for logging, timing, and metrics

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  runId?: string;
  source?: string;
  operation?: string;
  [key: string]: unknown;
}

interface TimingResult<T> {
  result: T;
  durationMs: number;
}

// ============================================
// STRUCTURED LOGGING
// ============================================

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LOG_LEVEL: LogLevel = (process.env.LISTENER_LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[MIN_LOG_LEVEL];
}

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [LISTENER] [${level.toUpperCase()}]`;

  if (context && Object.keys(context).length > 0) {
    const contextStr = Object.entries(context)
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' ');
    return `${prefix} ${message} | ${contextStr}`;
  }

  return `${prefix} ${message}`;
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (shouldLog('debug')) {
      console.log(formatLog('debug', message, context));
    }
  },

  info(message: string, context?: LogContext): void {
    if (shouldLog('info')) {
      console.log(formatLog('info', message, context));
    }
  },

  warn(message: string, context?: LogContext): void {
    if (shouldLog('warn')) {
      console.warn(formatLog('warn', message, context));
    }
  },

  error(message: string, error?: Error | unknown, context?: LogContext): void {
    if (shouldLog('error')) {
      const errorContext = error instanceof Error
        ? { ...context, error: error.message, stack: error.stack?.split('\n')[1]?.trim() }
        : { ...context, error: String(error) };
      console.error(formatLog('error', message, errorContext));
    }
  },
};

// ============================================
// PERFORMANCE TIMING
// ============================================

/**
 * Time an async operation and return both result and duration
 */
export async function timeAsync<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: LogContext
): Promise<TimingResult<T>> {
  const start = performance.now();

  try {
    const result = await fn();
    const durationMs = Math.round(performance.now() - start);

    logger.debug(`${operation} completed`, { ...context, durationMs });

    return { result, durationMs };
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    logger.error(`${operation} failed`, error, { ...context, durationMs });
    throw error;
  }
}

/**
 * Time a sync operation
 */
export function timeSync<T>(
  operation: string,
  fn: () => T,
  context?: LogContext
): TimingResult<T> {
  const start = performance.now();

  try {
    const result = fn();
    const durationMs = Math.round(performance.now() - start);

    logger.debug(`${operation} completed`, { ...context, durationMs });

    return { result, durationMs };
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    logger.error(`${operation} failed`, error, { ...context, durationMs });
    throw error;
  }
}

// ============================================
// METRICS COLLECTION
// ============================================

interface MetricValue {
  count: number;
  total: number;
  min: number;
  max: number;
  lastValue: number;
  lastUpdated: number;
}

class MetricsCollector {
  private metrics = new Map<string, MetricValue>();
  private counters = new Map<string, number>();

  /**
   * Record a timing/value metric
   */
  record(name: string, value: number): void {
    const existing = this.metrics.get(name);

    if (existing) {
      this.metrics.set(name, {
        count: existing.count + 1,
        total: existing.total + value,
        min: Math.min(existing.min, value),
        max: Math.max(existing.max, value),
        lastValue: value,
        lastUpdated: Date.now(),
      });
    } else {
      this.metrics.set(name, {
        count: 1,
        total: value,
        min: value,
        max: value,
        lastValue: value,
        lastUpdated: Date.now(),
      });
    }
  }

  /**
   * Increment a counter
   */
  increment(name: string, amount: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + amount);
  }

  /**
   * Get metric stats
   */
  getMetric(name: string): (MetricValue & { avg: number }) | null {
    const metric = this.metrics.get(name);
    if (!metric) return null;

    return {
      ...metric,
      avg: metric.count > 0 ? metric.total / metric.count : 0,
    };
  }

  /**
   * Get counter value
   */
  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  /**
   * Get all metrics summary
   */
  getSummary(): {
    metrics: Record<string, MetricValue & { avg: number }>;
    counters: Record<string, number>;
  } {
    const metricsSummary: Record<string, MetricValue & { avg: number }> = {};
    for (const [name, value] of this.metrics) {
      metricsSummary[name] = {
        ...value,
        avg: value.count > 0 ? Math.round(value.total / value.count) : 0,
      };
    }

    return {
      metrics: metricsSummary,
      counters: Object.fromEntries(this.counters),
    };
  }

  /**
   * Reset all metrics (useful at start of each run)
   */
  reset(): void {
    this.metrics.clear();
    this.counters.clear();
  }
}

// Singleton instance for the listener module
export const metrics = new MetricsCollector();

// ============================================
// FETCH WITH TIMEOUT AND RETRY
// ============================================

interface FetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * Fetch with timeout, retry, and instrumentation
 */
export async function instrumentedFetch(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const {
    timeout = 10000,
    retries = 2,
    retryDelay = 500,
    ...fetchOptions
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const start = performance.now();

      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal,
      });

      const durationMs = Math.round(performance.now() - start);
      metrics.record('fetch_duration_ms', durationMs);
      metrics.increment('fetch_requests');

      if (response.ok) {
        metrics.increment('fetch_success');
      } else {
        metrics.increment('fetch_errors');
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (lastError.name === 'AbortError') {
        metrics.increment('fetch_timeouts');
        logger.warn('Fetch timeout', { url, timeout, attempt });
      } else {
        metrics.increment('fetch_errors');
        logger.warn('Fetch failed', { url, attempt, error: lastError.message });
      }

      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error(`Fetch failed after ${retries + 1} attempts`);
}

// ============================================
// BOUNDED CACHE
// ============================================

interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

/**
 * LRU cache with TTL and size limits
 */
export class BoundedCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize: number = 1000, ttlMs: number = 10 * 60 * 1000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      metrics.increment('cache_miss');
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      metrics.increment('cache_expired');
      return null;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    metrics.increment('cache_hit');
    return entry.value;
  }

  set(key: string, value: T): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        metrics.increment('cache_eviction');
      }
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// ============================================
// BATCH PROCESSING
// ============================================

/**
 * Process items in batches with concurrency control
 */
export async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options: {
    batchSize?: number;
    delayBetweenBatches?: number;
    onBatchComplete?: (results: R[], batchIndex: number) => void;
  } = {}
): Promise<R[]> {
  const { batchSize = 10, delayBetweenBatches = 100, onBatchComplete } = options;
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize);

    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    if (onBatchComplete) {
      onBatchComplete(batchResults, batchIndex);
    }

    // Delay between batches (except for last batch)
    if (i + batchSize < items.length && delayBetweenBatches > 0) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
    }
  }

  return results;
}

/**
 * Process items with controlled concurrency (not batched, but limited parallel)
 */
export async function processWithConcurrency<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 5
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await processor(items[currentIndex]);
    }
  }

  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);

  return results;
}
