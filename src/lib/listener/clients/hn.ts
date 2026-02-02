// ============================================
// HACKER NEWS CLIENT
// ============================================
// Uses official HN API: https://github.com/HackerNews/API

import { HNItem, HNScanResult } from '../types';

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';

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
