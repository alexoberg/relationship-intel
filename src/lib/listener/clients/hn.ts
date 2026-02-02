// ============================================
// HACKER NEWS CLIENT
// ============================================
// Uses official HN API: https://github.com/HackerNews/API

import { HNItem, HNScanResult, HNUser, HNUserCompanyInfo } from '../types';
import { extractDomainFromUrl, isCompanyDomain, normalizeDomain, domainToCompanyName } from '../domain-extractor';

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';

// Cache for user profiles to avoid re-fetching
const userCache = new Map<string, HNUser | null>();
const USER_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const userCacheTimestamps = new Map<string, number>();

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Fetch a single item by ID
 */
export async function fetchItem(id: number): Promise<HNItem | null> {
  try {
    const response = await fetch(`${HN_API_BASE}/item/${id}.json`);
    if (!response.ok) return null;

    const item = await response.json();
    if (!item || item.deleted || item.dead) return null;

    return item as HNItem;
  } catch (error) {
    console.error(`Failed to fetch HN item ${id}:`, error);
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
  const items: HNItem[] = [];

  // Process in batches to avoid overwhelming the API
  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(id => fetchItem(id)));

    for (const item of results) {
      if (item) items.push(item);
    }

    // Small delay between batches
    if (i + concurrency < ids.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return items;
}

/**
 * Fetch top story IDs (front page)
 */
export async function fetchTopStoryIds(limit: number = 100): Promise<number[]> {
  try {
    const response = await fetch(`${HN_API_BASE}/topstories.json`);
    if (!response.ok) throw new Error('Failed to fetch top stories');

    const ids = await response.json();
    return ids.slice(0, limit);
  } catch (error) {
    console.error('Failed to fetch top story IDs:', error);
    return [];
  }
}

/**
 * Fetch new story IDs
 */
export async function fetchNewStoryIds(limit: number = 100): Promise<number[]> {
  try {
    const response = await fetch(`${HN_API_BASE}/newstories.json`);
    if (!response.ok) throw new Error('Failed to fetch new stories');

    const ids = await response.json();
    return ids.slice(0, limit);
  } catch (error) {
    console.error('Failed to fetch new story IDs:', error);
    return [];
  }
}

/**
 * Fetch Ask HN story IDs
 */
export async function fetchAskHNIds(limit: number = 50): Promise<number[]> {
  try {
    const response = await fetch(`${HN_API_BASE}/askstories.json`);
    if (!response.ok) throw new Error('Failed to fetch Ask HN');

    const ids = await response.json();
    return ids.slice(0, limit);
  } catch (error) {
    console.error('Failed to fetch Ask HN IDs:', error);
    return [];
  }
}

/**
 * Fetch Show HN story IDs
 */
export async function fetchShowHNIds(limit: number = 50): Promise<number[]> {
  try {
    const response = await fetch(`${HN_API_BASE}/showstories.json`);
    if (!response.ok) throw new Error('Failed to fetch Show HN');

    const ids = await response.json();
    return ids.slice(0, limit);
  } catch (error) {
    console.error('Failed to fetch Show HN IDs:', error);
    return [];
  }
}

/**
 * Fetch max item ID (for tracking new items)
 */
export async function fetchMaxItemId(): Promise<number> {
  try {
    const response = await fetch(`${HN_API_BASE}/maxitem.json`);
    if (!response.ok) throw new Error('Failed to fetch max item');

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch max item ID:', error);
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
 * Fetch a HN user profile by username
 */
export async function fetchUser(username: string): Promise<HNUser | null> {
  // Check cache first
  const cacheTime = userCacheTimestamps.get(username);
  if (cacheTime && Date.now() - cacheTime < USER_CACHE_TTL) {
    return userCache.get(username) || null;
  }

  try {
    const response = await fetch(`${HN_API_BASE}/user/${username}.json`);
    if (!response.ok) {
      userCache.set(username, null);
      userCacheTimestamps.set(username, Date.now());
      return null;
    }

    const user = await response.json();
    if (!user) {
      userCache.set(username, null);
      userCacheTimestamps.set(username, Date.now());
      return null;
    }

    userCache.set(username, user as HNUser);
    userCacheTimestamps.set(username, Date.now());
    return user as HNUser;
  } catch (error) {
    console.error(`Failed to fetch HN user ${username}:`, error);
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
  const users = new Map<string, HNUser>();
  const uniqueUsernames = [...new Set(usernames)];

  for (let i = 0; i < uniqueUsernames.length; i += concurrency) {
    const batch = uniqueUsernames.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(u => fetchUser(u)));

    for (let j = 0; j < batch.length; j++) {
      if (results[j]) {
        users.set(batch[j], results[j]!);
      }
    }

    // Small delay between batches
    if (i + concurrency < uniqueUsernames.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return users;
}

/**
 * Extract company information from a HN user's "about" field
 *
 * HN users often put:
 * - Company URL: "https://mycompany.com"
 * - Email: "john@company.com"
 * - Work info: "I work at Stripe" or "Founder of Acme Inc"
 * - Twitter/LinkedIn with company context
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

  // 1. Look for URLs in about (highest confidence)
  const urlRegex = /https?:\/\/[^\s<>"']+/gi;
  const urls = about.match(urlRegex) || [];

  for (const url of urls) {
    const domain = extractDomainFromUrl(url);
    if (domain && isCompanyDomain(domain)) {
      result.companyDomain = domain;
      result.companyName = domainToCompanyName(domain);
      result.confidence = 0.9;
      result.source = 'about_url';
      return result;
    }
  }

  // 2. Look for email addresses
  const emailRegex = /[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  let emailMatch;
  while ((emailMatch = emailRegex.exec(cleanAbout)) !== null) {
    const domain = normalizeDomain(emailMatch[1]);
    // Skip common email providers
    const skipDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
                        'icloud.com', 'protonmail.com', 'fastmail.com', 'hey.com',
                        'me.com', 'mac.com', 'live.com', 'msn.com', 'aol.com'];
    if (domain && !skipDomains.includes(domain) && isCompanyDomain(domain)) {
      result.companyDomain = domain;
      result.companyName = domainToCompanyName(domain);
      result.confidence = 0.85;
      result.source = 'email_domain';
      return result;
    }
  }

  // 3. Look for work patterns like "I work at X" or "Founder of X" or "Engineer at X"
  const workPatterns = [
    /(?:work(?:ing)?|employed)\s+(?:at|for|with)\s+([A-Z][A-Za-z0-9\s&.-]+?)(?:[,.\s]|$)/i,
    /(?:founder|co-founder|ceo|cto|vp|director|engineer|developer|designer)\s+(?:at|of|@)\s+([A-Z][A-Za-z0-9\s&.-]+?)(?:[,.\s]|$)/i,
    /(?:building|built|created?)\s+([A-Z][A-Za-z0-9\s&.-]+?)(?:[,.\s]|$)/i,
    /@([A-Za-z][A-Za-z0-9_-]+)\s/,  // Twitter handle might be company
  ];

  for (const pattern of workPatterns) {
    const match = cleanAbout.match(pattern);
    if (match && match[1]) {
      const companyName = match[1].trim();
      // Skip if it's a common phrase or too short
      if (companyName.length > 2 && !['the', 'a', 'an', 'my', 'our'].includes(companyName.toLowerCase())) {
        result.companyName = companyName;
        result.confidence = 0.6;
        result.source = 'about_text';
        // Try to guess domain
        const guessedDomain = companyName.toLowerCase()
          .replace(/\s+/g, '')
          .replace(/[^a-z0-9]/g, '') + '.com';
        result.companyDomain = guessedDomain;
        return result;
      }
    }
  }

  // 4. Look for standalone domain mentions
  const domainRegex = /\b([a-zA-Z0-9][-a-zA-Z0-9]*\.)+(?:com|org|net|io|co|ai|app|dev|tech)\b/gi;
  const domainMentions = cleanAbout.match(domainRegex) || [];

  for (const mention of domainMentions) {
    const domain = normalizeDomain(mention);
    if (domain && isCompanyDomain(domain)) {
      result.companyDomain = domain;
      result.companyName = domainToCompanyName(domain);
      result.confidence = 0.7;
      result.source = 'about_text';
      return result;
    }
  }

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
