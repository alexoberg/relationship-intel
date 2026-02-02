// ============================================
// KEYWORD MATCHER
// ============================================
// Matches text against configured keywords

import { createAdminClient } from '@/lib/supabase/admin';
import {
  ListenerKeyword,
  KeywordMatch,
  MatchResult,
  KeywordCategory,
} from './types';
import { HelixProduct } from '../helix-sales';

// ============================================
// KEYWORD CACHE
// ============================================

let keywordCache: ListenerKeyword[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Load active keywords from database (with caching)
 */
export async function loadKeywords(): Promise<ListenerKeyword[]> {
  const now = Date.now();

  // Return cached if valid
  if (keywordCache && now - cacheTimestamp < CACHE_TTL) {
    return keywordCache;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('listener_keywords')
    .select('*')
    .eq('is_active', true)
    .order('weight', { ascending: false });

  if (error) {
    console.error('Failed to load keywords:', error);
    // Return cached even if stale, better than nothing
    if (keywordCache) return keywordCache;
    throw error;
  }

  keywordCache = data as ListenerKeyword[];
  cacheTimestamp = now;

  return keywordCache;
}

/**
 * Clear the keyword cache (useful after updates)
 */
export function clearKeywordCache(): void {
  keywordCache = null;
  cacheTimestamp = 0;
}

// ============================================
// MATCHING LOGIC
// ============================================

/**
 * Match text against keywords
 * Returns all matches with their positions and scores
 */
export function matchKeywords(
  text: string,
  keywords: ListenerKeyword[]
): MatchResult {
  const matches: KeywordMatch[] = [];
  const textLower = text.toLowerCase();

  for (const kw of keywords) {
    const keywordLower = kw.keyword.toLowerCase();

    // Find all occurrences
    let position = textLower.indexOf(keywordLower);
    while (position !== -1) {
      // Check word boundaries to avoid partial matches
      const beforeChar = position > 0 ? textLower[position - 1] : ' ';
      const afterChar =
        position + keywordLower.length < textLower.length
          ? textLower[position + keywordLower.length]
          : ' ';

      // Allow matches at word boundaries (space, punctuation, start/end)
      const isWordBoundary = (char: string) =>
        /[\s.,;:!?'"()\[\]{}<>\/\\-]/.test(char);

      if (isWordBoundary(beforeChar) && isWordBoundary(afterChar)) {
        matches.push({
          keyword: kw.keyword,
          category: kw.category as KeywordCategory,
          weight: kw.weight,
          helixProducts: kw.helix_products as HelixProduct[],
          matchedText: text.slice(position, position + keywordLower.length),
          position,
        });
      }

      // Find next occurrence
      position = textLower.indexOf(keywordLower, position + 1);
    }
  }

  // Calculate total score (sum of weights, but dedupe same keyword)
  const uniqueKeywords = new Map<string, KeywordMatch>();
  for (const match of matches) {
    const existing = uniqueKeywords.get(match.keyword);
    if (!existing || match.weight > existing.weight) {
      uniqueKeywords.set(match.keyword, match);
    }
  }

  const totalScore = Array.from(uniqueKeywords.values()).reduce(
    (sum, m) => sum + m.weight,
    0
  );

  // Collect unique categories
  const categories = [...new Set(matches.map(m => m.category))];

  // Collect unique Helix products
  const suggestedHelixProducts = [
    ...new Set(matches.flatMap(m => m.helixProducts)),
  ] as HelixProduct[];

  return {
    matches,
    totalScore,
    categories,
    suggestedHelixProducts,
  };
}

/**
 * Match text and load keywords automatically
 */
export async function matchText(text: string): Promise<MatchResult> {
  const keywords = await loadKeywords();
  return matchKeywords(text, keywords);
}

/**
 * Quick check if text contains any keywords (for filtering)
 */
export async function containsKeywords(text: string): Promise<boolean> {
  const keywords = await loadKeywords();
  const textLower = text.toLowerCase();

  for (const kw of keywords) {
    if (textLower.includes(kw.keyword.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Extract the most relevant context around a keyword match
 */
export function extractMatchContext(
  text: string,
  match: KeywordMatch,
  chars: number = 150
): string {
  const start = Math.max(0, match.position - chars);
  const end = Math.min(text.length, match.position + match.keyword.length + chars);

  let context = text.slice(start, end);

  // Clean up whitespace and HTML
  context = context
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();

  // Add ellipsis if truncated
  if (start > 0) context = '...' + context;
  if (end < text.length) context = context + '...';

  return context;
}

/**
 * Get the best match context (highest weight keyword)
 */
export function getBestMatchContext(
  text: string,
  matches: KeywordMatch[],
  chars: number = 150
): string {
  if (matches.length === 0) return '';

  // Sort by weight descending, take first
  const sorted = [...matches].sort((a, b) => b.weight - a.weight);
  return extractMatchContext(text, sorted[0], chars);
}

/**
 * Get the primary category from matches
 */
export function getPrimaryCategory(
  matches: KeywordMatch[]
): KeywordCategory | null {
  if (matches.length === 0) return null;

  // Weight the categories
  const categoryWeights = new Map<KeywordCategory, number>();

  for (const match of matches) {
    const current = categoryWeights.get(match.category) || 0;
    categoryWeights.set(match.category, current + match.weight);
  }

  // Find highest weighted category
  let maxWeight = 0;
  let primaryCategory: KeywordCategory | null = null;

  for (const [category, weight] of categoryWeights) {
    if (weight > maxWeight) {
      maxWeight = weight;
      primaryCategory = category;
    }
  }

  return primaryCategory;
}
