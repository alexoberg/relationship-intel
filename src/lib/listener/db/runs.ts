// ============================================
// LISTENER RUNS DATABASE OPERATIONS
// ============================================

import { createAdminClient } from '@/lib/supabase/admin';
import { ListenerRun, ListenerRunStatus } from '../types';

// ============================================
// CREATE/UPDATE OPERATIONS
// ============================================

/**
 * Start a new listener run
 */
export async function startRun(
  sourceType: string,
  runType: 'scheduled' | 'manual' | 'backfill' = 'scheduled',
  cursorData?: Record<string, unknown>
): Promise<string> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('listener_runs')
    .insert({
      source_type: sourceType,
      run_type: runType,
      status: 'running',
      cursor_data: cursorData || {},
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

/**
 * Update run progress
 */
export async function updateRunProgress(
  runId: string,
  updates: {
    itemsScanned?: number;
    discoveriesCreated?: number;
    duplicatesSkipped?: number;
    autoPromoted?: number;
    errorsCount?: number;
    cursorData?: Record<string, unknown>;
  }
): Promise<void> {
  const supabase = createAdminClient();

  const updateData: Record<string, unknown> = {};

  if (updates.itemsScanned !== undefined) updateData.items_scanned = updates.itemsScanned;
  if (updates.discoveriesCreated !== undefined) updateData.discoveries_created = updates.discoveriesCreated;
  if (updates.duplicatesSkipped !== undefined) updateData.duplicates_skipped = updates.duplicatesSkipped;
  if (updates.autoPromoted !== undefined) updateData.auto_promoted = updates.autoPromoted;
  if (updates.errorsCount !== undefined) updateData.errors_count = updates.errorsCount;
  if (updates.cursorData !== undefined) updateData.cursor_data = updates.cursorData;

  const { error } = await supabase
    .from('listener_runs')
    .update(updateData)
    .eq('id', runId);

  if (error) {
    console.error('Failed to update run progress:', error);
  }
}

/**
 * Complete a listener run
 */
export async function completeRun(
  runId: string,
  status: 'completed' | 'failed' | 'partial',
  stats: {
    itemsScanned: number;
    discoveriesCreated: number;
    duplicatesSkipped: number;
    autoPromoted: number;
    errorsCount: number;
    errorDetails?: Array<{ message: string; timestamp: string }>;
    cursorData?: Record<string, unknown>;
  }
): Promise<void> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('listener_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      items_scanned: stats.itemsScanned,
      discoveries_created: stats.discoveriesCreated,
      duplicates_skipped: stats.duplicatesSkipped,
      auto_promoted: stats.autoPromoted,
      errors_count: stats.errorsCount,
      error_details: stats.errorDetails || [],
      cursor_data: stats.cursorData || {},
    })
    .eq('id', runId);

  if (error) {
    console.error('Failed to complete run:', error);
    throw error;
  }
}

/**
 * Add error to run
 */
export async function addRunError(runId: string, message: string): Promise<void> {
  const supabase = createAdminClient();

  // Get current errors
  const { data: run } = await supabase
    .from('listener_runs')
    .select('error_details, errors_count')
    .eq('id', runId)
    .single();

  const currentErrors = (run?.error_details as Array<{ message: string; timestamp: string }>) || [];
  const newErrors = [
    ...currentErrors,
    { message, timestamp: new Date().toISOString() },
  ].slice(-50); // Keep last 50 errors

  const { error } = await supabase
    .from('listener_runs')
    .update({
      error_details: newErrors,
      errors_count: (run?.errors_count || 0) + 1,
    })
    .eq('id', runId);

  if (error) {
    console.error('Failed to add run error:', error);
  }
}

// ============================================
// READ OPERATIONS
// ============================================

/**
 * Get a run by ID
 */
export async function getRun(id: string): Promise<ListenerRun | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('listener_runs')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data as ListenerRun;
}

/**
 * List recent runs
 */
export async function listRuns(params?: {
  sourceType?: string;
  status?: ListenerRunStatus;
  limit?: number;
  offset?: number;
}): Promise<{ runs: ListenerRun[]; total: number }> {
  const supabase = createAdminClient();

  let query = supabase
    .from('listener_runs')
    .select('*', { count: 'exact' })
    .order('started_at', { ascending: false });

  if (params?.sourceType) {
    query = query.eq('source_type', params.sourceType);
  }

  if (params?.status) {
    query = query.eq('status', params.status);
  }

  const limit = params?.limit || 20;
  const offset = params?.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    runs: (data || []) as ListenerRun[],
    total: count || 0,
  };
}

/**
 * Get the last successful run for a source type
 */
export async function getLastSuccessfulRun(
  sourceType: string
): Promise<ListenerRun | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('listener_runs')
    .select('*')
    .eq('source_type', sourceType)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data as ListenerRun;
}

/**
 * Get cursor data from last run (for resuming)
 */
export async function getLastCursor(
  sourceType: string
): Promise<Record<string, unknown> | null> {
  const lastRun = await getLastSuccessfulRun(sourceType);
  if (!lastRun) return null;
  return lastRun.cursor_data;
}

// ============================================
// STATS
// ============================================

/**
 * Get run statistics
 */
export async function getRunStats(): Promise<{
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  totalItemsScanned: number;
  totalDiscoveriesCreated: number;
  last24hRuns: number;
  bySource: Record<string, { runs: number; discoveries: number }>;
}> {
  const supabase = createAdminClient();

  const { data: runs, error } = await supabase
    .from('listener_runs')
    .select('source_type, status, items_scanned, discoveries_created, started_at');

  if (error) throw error;

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const bySource: Record<string, { runs: number; discoveries: number }> = {};
  let successfulRuns = 0;
  let failedRuns = 0;
  let totalItemsScanned = 0;
  let totalDiscoveriesCreated = 0;
  let last24hRuns = 0;

  for (const run of runs || []) {
    if (run.status === 'completed') successfulRuns++;
    if (run.status === 'failed') failedRuns++;

    totalItemsScanned += run.items_scanned || 0;
    totalDiscoveriesCreated += run.discoveries_created || 0;

    if (new Date(run.started_at) >= oneDayAgo) last24hRuns++;

    if (!bySource[run.source_type]) {
      bySource[run.source_type] = { runs: 0, discoveries: 0 };
    }
    bySource[run.source_type].runs++;
    bySource[run.source_type].discoveries += run.discoveries_created || 0;
  }

  return {
    totalRuns: runs?.length || 0,
    successfulRuns,
    failedRuns,
    totalItemsScanned,
    totalDiscoveriesCreated,
    last24hRuns,
    bySource,
  };
}
