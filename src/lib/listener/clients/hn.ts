// ============================================
// HACKER NEWS CLIENT
// ============================================
// Uses official HN API: https://github.com/HackerNews/API

import { HNItem, HNScanResult, HNUser, HNUserCompanyInfo } from '../types';
import { extractDomainFromUrl, isCompanyDomain, normalizeDomain, domainToCompanyName } from '../domain-extractor';
import {
  BoundedCache,
  instrumentedFetch,
  logger,
  metrics,
  timeAsync,
  processWithConcurrency,
} from '../instrumentation';

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';

// Bounded LRU cache for user profiles (max 2000 entries, 10 min TTL)
const userCache = new BoundedCache<HNUser | null>(2000, 10 * 60 * 1000);

// Bounded cache for items (max 5000 entries, 5 min TTL)
const itemCache = new BoundedCache<HNItem | null>(5000, 5 * 60 * 1000);

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Fetch a single item by ID with caching
 */
export async function fetchItem(id: number): Promise<HNItem | null> {
  const cacheKey = `item:${id}`;

  // Check cache first
  const cached = itemCache.get(cacheKey);
  if (cached !== null) {
    return cached;
  }

  try {
    const response = await instrumentedFetch(`${HN_API_BASE}/item/${id}.json`, {
      timeout: 8000,
      retries: 1,
    });

    if (!response.ok) {
      itemCache.set(cacheKey, null);
      return null;
    }

    const item = await response.json();
    if (!item || item.deleted || item.dead) {
      itemCache.set(cacheKey, null);
      return null;
    }

    const hnItem = item as HNItem;
    itemCache.set(cacheKey, hnItem);
    metrics.increment('hn_items_fetched');

    return hnItem;
  } catch (error) {
    logger.error(`Failed to fetch HN item ${id}`, error);
    metrics.increment('hn_item_fetch_errors');
    return null;
  }
}

/**
 * Fetch multiple items in parallel with rate limiting
 */
export async function fetchItems(
  ids: number[],
  concurrency: number = 10
): Promise<HNItem[]> {
  if (ids.length === 0) return [];

  const { result: results, durationMs } = await timeAsync(
    `fetchItems(${ids.length})`,
    async () => processWithConcurrency(ids, fetchItem, concurrency),
    { count: ids.length }
  );

  const items = results.filter((item): item is HNItem => item !== null);

  logger.debug(`Fetched ${items.length}/${ids.length} items`, {
    operation: 'fetchItems',
    durationMs,
    requested: ids.length,
    received: items.length,
  });

  return items;
}

/**
 * Generic helper to fetch story ID lists
 */
async function fetchStoryIds(endpoint: string, limit: number, label: string): Promise<number[]> {
  try {
    const response = await instrumentedFetch(`${HN_API_BASE}/${endpoint}.json`, {
      timeout: 10000,
      retries: 2,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${label}`);
    }

    const ids = await response.json();
    const result = ids.slice(0, limit);

    logger.debug(`Fetched ${label}`, { count: result.length, limit });
    metrics.increment(`hn_${label.toLowerCase().replace(/\s+/g, '_')}_fetched`);

    return result;
  } catch (error) {
    logger.error(`Failed to fetch ${label}`, error);
    metrics.increment('hn_story_list_errors');
    return [];
  }
}

/**
 * Fetch top story IDs (front page)
 */
export async function fetchTopStoryIds(limit: number = 100): Promise<number[]> {
  return fetchStoryIds('topstories', limit, 'top stories');
}

/**
 * Fetch new story IDs
 */
export async function fetchNewStoryIds(limit: number = 100): Promise<number[]> {
  return fetchStoryIds('newstories', limit, 'new stories');
}

/**
 * Fetch Ask HN story IDs
 */
export async function fetchAskHNIds(limit: number = 50): Promise<number[]> {
  return fetchStoryIds('askstories', limit, 'Ask HN');
}

/**
 * Fetch Show HN story IDs
 */
export async function fetchShowHNIds(limit: number = 50): Promise<number[]> {
  return fetchStoryIds('showstories', limit, 'Show HN');
}

/**
 * Fetch max item ID (for tracking new items)
 */
export async function fetchMaxItemId(): Promise<number> {
  try {
    const response = await instrumentedFetch(`${HN_API_BASE}/maxitem.json`, {
      timeout: 5000,
      retries: 1,
    });

    if (!response.ok) {
      throw new Error('Failed to fetch max item');
    }

    return await response.json();
  } catch (error) {
    logger.error('Failed to fetch max item ID', error);
    return 0;
  }
}

// ============================================
// HIGH-LEVEL SCAN FUNCTIONS
// ============================================

/**
 * Fetch front page stories with full details
 */
export async function fetchFrontPage(limit: number = 100): Promise<HNScanResult> {
  const ids = await fetchTopStoryIds(limit);
  const items = await fetchItems(ids);

  return {
    items: items.filter(item => item.type === 'story'),
    scannedCount: ids.length,
    lastItemId: Math.max(...ids, 0),
  };
}

/**
 * Fetch Ask HN posts with full details
 */
export async function fetchAskHN(limit: number = 50): Promise<HNScanResult> {
  const ids = await fetchAskHNIds(limit);
  const items = await fetchItems(ids);

  return {
    items,
    scannedCount: ids.length,
    lastItemId: Math.max(...ids, 0),
  };
}

/**
 * Fetch Show HN posts with full details
 */
export async function fetchShowHN(limit: number = 50): Promise<HNScanResult> {
  const ids = await fetchShowHNIds(limit);
  const items = await fetchItems(ids);

  return {
    items,
    scannedCount: ids.length,
    lastItemId: Math.max(...ids, 0),
  };
}

/**
 * Fetch recent items (stories + comments) since a given ID
 * Useful for incremental scanning
 */
export async function fetchRecentItems(
  sinceId: number,
  limit: number = 200
): Promise<HNScanResult> {
  const maxId = await fetchMaxItemId();
  if (maxId === 0) {
    return { items: [], scannedCount: 0, lastItemId: sinceId };
  }

  // Calculate IDs to fetch (newest first)
  const startId = Math.max(sinceId + 1, maxId - limit + 1);
  const ids: number[] = [];

  for (let id = maxId; id >= startId && ids.length < limit; id--) {
    ids.push(id);
  }

  const items = await fetchItems(ids);

  return {
    items,
    scannedCount: ids.length,
    lastItemId: maxId,
  };
}

/**
 * Fetch comments for a story
 */
export async function fetchStoryComments(
  storyId: number,
  maxDepth: number = 2,
  maxComments: number = 50
): Promise<HNItem[]> {
  const story = await fetchItem(storyId);
  if (!story || !story.kids) return [];

  const comments: HNItem[] = [];
  const queue: Array<{ id: number; depth: number }> = story.kids.map(id => ({
    id,
    depth: 1,
  }));

  while (queue.length > 0 && comments.length < maxComments) {
    const batch = queue.splice(0, 10);
    const items = await fetchItems(batch.map(b => b.id));

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const depth = batch[i].depth;

      if (item && item.type === 'comment') {
        comments.push(item);

        // Add child comments if not too deep
        if (depth < maxDepth && item.kids) {
          for (const kidId of item.kids.slice(0, 5)) {
            queue.push({ id: kidId, depth: depth + 1 });
          }
        }
      }
    }
  }

  return comments;
}

// ============================================
// UTILITIES
// ============================================

/**
 * Get HN item URL
 */
export function getItemUrl(id: number): string {
  return `https://news.ycombinator.com/item?id=${id}`;
}

/**
 * Convert HN timestamp to Date
 */
export function timestampToDate(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

/**
 * Extract text content from HN item (combines title + text)
 */
export function getItemText(item: HNItem): string {
  const parts: string[] = [];

  if (item.title) parts.push(item.title);
  if (item.text) {
    // Strip HTML tags from text
    const cleanText = item.text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    parts.push(cleanText);
  }

  return parts.join('\n\n');
}

// ============================================
// USER PROFILE FUNCTIONS
// ============================================

/**
 * Fetch a HN user profile by username with caching
 */
export async function fetchUser(username: string): Promise<HNUser | null> {
  const cacheKey = `user:${username}`;

  // Check cache first (BoundedCache handles TTL)
  const cached = userCache.get(cacheKey);
  if (cached !== null) {
    return cached;
  }

  try {
    const response = await instrumentedFetch(`${HN_API_BASE}/user/${username}.json`, {
      timeout: 8000,
      retries: 1,
    });

    if (!response.ok) {
      userCache.set(cacheKey, null);
      return null;
    }

    const user = await response.json();
    if (!user) {
      userCache.set(cacheKey, null);
      return null;
    }

    userCache.set(cacheKey, user as HNUser);
    metrics.increment('hn_users_fetched');

    return user as HNUser;
  } catch (error) {
    logger.error(`Failed to fetch HN user ${username}`, error);
    metrics.increment('hn_user_fetch_errors');
    return null;
  }
}

/**
 * Fetch multiple users in parallel
 */
export async function fetchUsers(
  usernames: string[],
  concurrency: number = 5
): Promise<Map<string, HNUser>> {
  const uniqueUsernames = [...new Set(usernames)];
  if (uniqueUsernames.length === 0) return new Map();

  const { result: results, durationMs } = await timeAsync(
    `fetchUsers(${uniqueUsernames.length})`,
    async () => processWithConcurrency(
      uniqueUsernames,
      async (username) => ({ username, user: await fetchUser(username) }),
      concurrency
    ),
    { count: uniqueUsernames.length }
  );

  const users = new Map<string, HNUser>();
  for (const { username, user } of results) {
    if (user) {
      users.set(username, user);
    }
  }

  logger.debug(`Fetched ${users.size}/${uniqueUsernames.length} users`, {
    operation: 'fetchUsers',
    durationMs,
    requested: uniqueUsernames.length,
    received: users.size,
  });

  return users;
}

/**
 * Extract social profile links from HN about field
 */
export function extractSocialProfiles(about: string): {
  linkedinUrl: string | null;
  twitterHandle: string | null;
  githubUsername: string | null;
  personalWebsite: string | null;
} {
  const result = {
    linkedinUrl: null as string | null,
    twitterHandle: null as string | null,
    githubUsername: null as string | null,
    personalWebsite: null as string | null,
  };

  if (!about) return result;

  // LinkedIn URL patterns
  const linkedinPatterns = [
    /https?:\/\/(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9_-]+)\/?/i,
    /linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i,
  ];
  for (const pattern of linkedinPatterns) {
    const match = about.match(pattern);
    if (match) {
      result.linkedinUrl = `https://www.linkedin.com/in/${match[1]}`;
      break;
    }
  }

  // Twitter/X handle patterns
  const twitterPatterns = [
    /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/([a-zA-Z0-9_]+)\/?/i,
    /(?:twitter|x)\.com\/([a-zA-Z0-9_]+)/i,
    /(?:^|\s)@([a-zA-Z][a-zA-Z0-9_]{1,14})(?:\s|$|[,.])/,  // @handle in text
  ];
  for (const pattern of twitterPatterns) {
    const match = about.match(pattern);
    if (match && match[1].toLowerCase() !== 'mention') {
      result.twitterHandle = match[1];
      break;
    }
  }

  // GitHub username patterns
  const githubPatterns = [
    /https?:\/\/(?:www\.)?github\.com\/([a-zA-Z0-9_-]+)\/?(?![a-zA-Z])/i,
    /github\.com\/([a-zA-Z0-9_-]+)/i,
  ];
  for (const pattern of githubPatterns) {
    const match = about.match(pattern);
    if (match && !['pulls', 'issues', 'topics', 'trending', 'explore'].includes(match[1].toLowerCase())) {
      result.githubUsername = match[1];
      break;
    }
  }

  // Personal website (first non-social URL)
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  const urls = about.match(urlRegex) || [];
  for (const url of urls) {
    const lowerUrl = url.toLowerCase();
    if (!lowerUrl.includes('linkedin.com') &&
        !lowerUrl.includes('twitter.com') &&
        !lowerUrl.includes('x.com') &&
        !lowerUrl.includes('github.com') &&
        !lowerUrl.includes('news.ycombinator.com')) {
      result.personalWebsite = url;
      break;
    }
  }

  return result;
}

/**
 * Known company name to domain mappings for common tech companies
 */
const KNOWN_COMPANY_DOMAINS: Record<string, string> = {
  'google': 'google.com',
  'meta': 'meta.com',
  'facebook': 'meta.com',
  'amazon': 'amazon.com',
  'apple': 'apple.com',
  'microsoft': 'microsoft.com',
  'netflix': 'netflix.com',
  'stripe': 'stripe.com',
  'airbnb': 'airbnb.com',
  'uber': 'uber.com',
  'lyft': 'lyft.com',
  'dropbox': 'dropbox.com',
  'slack': 'slack.com',
  'salesforce': 'salesforce.com',
  'shopify': 'shopify.com',
  'square': 'squareup.com',
  'twitter': 'twitter.com',
  'x': 'x.com',
  'linkedin': 'linkedin.com',
  'github': 'github.com',
  'gitlab': 'gitlab.com',
  'cloudflare': 'cloudflare.com',
  'datadog': 'datadoghq.com',
  'snowflake': 'snowflake.com',
  'databricks': 'databricks.com',
  'palantir': 'palantir.com',
  'coinbase': 'coinbase.com',
  'robinhood': 'robinhood.com',
  'plaid': 'plaid.com',
  'figma': 'figma.com',
  'notion': 'notion.so',
  'vercel': 'vercel.com',
  'supabase': 'supabase.com',
  'anthropic': 'anthropic.com',
  'openai': 'openai.com',
  'nvidia': 'nvidia.com',
  'tesla': 'tesla.com',
  'spacex': 'spacex.com',
  'twitch': 'twitch.tv',
  'discord': 'discord.com',
  'roblox': 'roblox.com',
  'spotify': 'spotify.com',
  'instacart': 'instacart.com',
  'doordash': 'doordash.com',
  'bytedance': 'bytedance.com',
  'tiktok': 'tiktok.com',
};

/**
 * Extract company information from a HN user's "about" field
 *
 * HN users often put:
 * - Company URL: "https://mycompany.com"
 * - Email: "john@company.com"
 * - Work info: "I work at Stripe" or "Founder of Acme Inc"
 * - Twitter/LinkedIn with company context
 * - YC batch: "(YC S21)" or "Company (YC W22)"
 */
export function extractCompanyFromProfile(user: HNUser): HNUserCompanyInfo {
  const result: HNUserCompanyInfo = {
    username: user.id,
    companyDomain: null,
    companyName: null,
    confidence: 0,
    source: 'about_text',
    rawAbout: user.about || null,
  };

  if (!user.about) return result;

  const about = user.about;

  // Extract social profiles first
  const socialProfiles = extractSocialProfiles(about);
  result.linkedinUrl = socialProfiles.linkedinUrl;
  result.twitterHandle = socialProfiles.twitterHandle;
  result.githubUsername = socialProfiles.githubUsername;

  // Clean HTML and decode entities
  const cleanAbout = about
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  // Collect all signals for potential multi-signal boost
  const signals: Array<{ domain: string | null; name: string | null; confidence: number; source: HNUserCompanyInfo['source'] }> = [];

  // 1. Look for URLs in about (highest confidence)
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  const urls = about.match(urlRegex) || [];

  for (const url of urls) {
    // Skip social media URLs
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('linkedin.com') ||
        lowerUrl.includes('twitter.com') ||
        lowerUrl.includes('x.com/') ||
        lowerUrl.includes('github.com')) {
      continue;
    }

    const domain = extractDomainFromUrl(url);
    if (domain && isCompanyDomain(domain)) {
      signals.push({
        domain,
        name: domainToCompanyName(domain),
        confidence: 0.9,
        source: 'about_url',
      });
      break; // Only take first company URL
    }
  }

  // 2. Look for email addresses
  const emailRegex = /[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  let emailMatch;
  const skipEmailDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
                      'icloud.com', 'protonmail.com', 'fastmail.com', 'hey.com',
                      'me.com', 'mac.com', 'live.com', 'msn.com', 'aol.com',
                      'proton.me', 'tutanota.com', 'zoho.com'];
  while ((emailMatch = emailRegex.exec(cleanAbout)) !== null) {
    const domain = normalizeDomain(emailMatch[1]);
    if (domain && !skipEmailDomains.includes(domain) && isCompanyDomain(domain)) {
      signals.push({
        domain,
        name: domainToCompanyName(domain),
        confidence: 0.85,
        source: 'email_domain',
      });
      break;
    }
  }

  // 3. Enhanced work patterns
  const workPatterns = [
    // Original patterns
    { pattern: /(?:work(?:ing)?|employed)\s+(?:at|for|with)\s+([A-Z][A-Za-z0-9\s&.-]+?)(?:[,.\s]|$)/i, confidence: 0.6 },
    { pattern: /(?:founder|co-founder|ceo|cto|vp|director|engineer|developer|designer|pm|product\s*manager)\s+(?:at|of|@)\s+([A-Z][A-Za-z0-9\s&.-]+?)(?:[,.\s]|$)/i, confidence: 0.7 },
    { pattern: /(?:building|built|created?)\s+([A-Z][A-Za-z0-9\s&.-]+?)(?:[,.\s]|$)/i, confidence: 0.6 },

    // YC patterns (common on HN)
    { pattern: /\(YC\s*[A-Z]?\d{2}\)\s*[-–—]?\s*([A-Za-z0-9\s&.-]+?)(?:[,.\s]|$)/i, confidence: 0.8 },
    { pattern: /([A-Za-z0-9\s&.-]+?)\s*\(YC\s*[A-Z]?\d{2}\)/i, confidence: 0.8 },

    // Role-first patterns (e.g., "Stripe engineer", "Airbnb PM")
    { pattern: /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:engineer|developer|pm|designer|founder|ceo|cto)\b/i, confidence: 0.65 },

    // Team/company identifier
    { pattern: /\b(?:team|company)[:\s]+([A-Z][A-Za-z0-9\s&.-]+?)(?:[,.\s]|$)/i, confidence: 0.6 },

    // Previously at patterns (still valuable for network)
    { pattern: /(?:prev(?:iously)?|ex[-\s]?|former(?:ly)?)\s+(?:at|@)?\s*([A-Z][A-Za-z0-9\s&.-]+?)(?:[,.\s]|$)/i, confidence: 0.5 },

    // Startup/company possessive
    { pattern: /(?:my|our)\s+(?:startup|company)\s+([A-Z][A-Za-z0-9\s&.-]+?)(?:[,.\s]|$)/i, confidence: 0.65 },

    // Job title with company in parens
    { pattern: /(?:engineer|developer|pm|ceo|cto|founder|designer)[^(]*\(([A-Z][A-Za-z0-9\s&.-]+?)\)/i, confidence: 0.65 },
  ];

  const skipWords = ['the', 'a', 'an', 'my', 'our', 'things', 'stuff', 'something', 'software', 'web', 'mobile', 'apps'];

  for (const { pattern, confidence } of workPatterns) {
    const match = cleanAbout.match(pattern);
    if (match && match[1]) {
      let companyName = match[1].trim();
      // Clean up trailing punctuation
      companyName = companyName.replace(/[,.\s]+$/, '');

      if (companyName.length > 2 && !skipWords.includes(companyName.toLowerCase())) {
        // Check if it's a known company
        const knownDomain = KNOWN_COMPANY_DOMAINS[companyName.toLowerCase()];
        if (knownDomain) {
          signals.push({
            domain: knownDomain,
            name: companyName,
            confidence: Math.min(confidence + 0.15, 0.9), // Boost for known companies
            source: 'about_text',
          });
        } else {
          // Guess domain
          const guessedDomain = companyName.toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[^a-z0-9]/g, '') + '.com';
          signals.push({
            domain: guessedDomain,
            name: companyName,
            confidence,
            source: 'about_text',
          });
        }
        break;
      }
    }
  }

  // 4. Look for standalone domain mentions
  const domainRegex = /\b([a-zA-Z0-9][-a-zA-Z0-9]*\.)+(?:com|org|net|io|co|ai|app|dev|tech|so|tv)\b/gi;
  const domainMentions = cleanAbout.match(domainRegex) || [];
  const skipDomainMentions = ['github.com', 'linkedin.com', 'twitter.com', 'x.com', 'news.ycombinator.com', 'ycombinator.com'];

  for (const mention of domainMentions) {
    const domain = normalizeDomain(mention);
    if (domain && !skipDomainMentions.includes(domain) && isCompanyDomain(domain)) {
      signals.push({
        domain,
        name: domainToCompanyName(domain),
        confidence: 0.7,
        source: 'about_text',
      });
      break;
    }
  }

  // 5. Multi-signal aggregation
  if (signals.length === 0) {
    return result;
  }

  // If we have multiple signals pointing to the same domain, boost confidence
  const domainCounts = new Map<string, number>();
  for (const signal of signals) {
    if (signal.domain) {
      domainCounts.set(signal.domain, (domainCounts.get(signal.domain) || 0) + 1);
    }
  }

  // Find the best signal (highest confidence, with multi-signal boost)
  let bestSignal = signals[0];
  for (const signal of signals) {
    let adjustedConfidence = signal.confidence;
    if (signal.domain && domainCounts.get(signal.domain)! > 1) {
      // Multiple signals agree - boost confidence
      adjustedConfidence = Math.min(0.95, adjustedConfidence + 0.1);
    }

    if (adjustedConfidence > bestSignal.confidence) {
      bestSignal = { ...signal, confidence: adjustedConfidence };
    }
  }

  result.companyDomain = bestSignal.domain;
  result.companyName = bestSignal.name;
  result.confidence = bestSignal.confidence;
  result.source = bestSignal.source;

  return result;
}

/**
 * Get company info for commenters on a story
 * Returns a map of username -> company info
 */
export async function getCommenterCompanies(
  comments: HNItem[],
  maxUsers: number = 50
): Promise<Map<string, HNUserCompanyInfo>> {
  // Get unique usernames from comments
  const usernames = [...new Set(
    comments
      .filter(c => c.by)
      .map(c => c.by!)
  )].slice(0, maxUsers);

  // Fetch user profiles
  const users = await fetchUsers(usernames);

  // Extract company info from each profile
  const companyInfo = new Map<string, HNUserCompanyInfo>();

  for (const [username, user] of users) {
    const info = extractCompanyFromProfile(user);
    if (info.companyDomain || info.companyName) {
      companyInfo.set(username, info);
    }
  }

  return companyInfo;
}

/**
 * Get user profile URL
 */
export function getUserUrl(username: string): string {
  return `https://news.ycombinator.com/user?id=${username}`;
}

// ============================================
// CACHE MANAGEMENT
// ============================================

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  userCache: { size: number; maxSize: number };
  itemCache: { size: number; maxSize: number };
} {
  return {
    userCache: { size: userCache.size, maxSize: 2000 },
    itemCache: { size: itemCache.size, maxSize: 5000 },
  };
}

/**
 * Clear all caches (useful between scan runs)
 */
export function clearCaches(): void {
  userCache.clear();
  itemCache.clear();
  logger.info('HN caches cleared');
}
