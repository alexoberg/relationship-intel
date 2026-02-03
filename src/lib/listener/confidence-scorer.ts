// ============================================
// CONFIDENCE SCORER
// ============================================
// Calculates confidence score (0-100) for discoveries

import { ConfidenceFactors, ListenerSourceType, KeywordMatch } from './types';

// ============================================
// SOURCE RELIABILITY SCORES
// ============================================

export const SOURCE_RELIABILITY: Record<ListenerSourceType, number> = {
  hn_post: 15,        // Front page story - high signal
  hn_comment: 8,      // Comment - lower signal, could be tangential
  hn_profile: 12,     // User profile - intentional company info, between post and comment
  news_article: 18,   // Tech news article - curated, reliable
  reddit_post: 12,    // Reddit post
  reddit_comment: 6,  // Reddit comment - lowest signal
  twitter: 10,        // Tweet
  status_page: 20,    // Status page incident - very high signal (direct pain)
  github_issue: 15,   // GitHub issue - technical discussion
  list_analysis: 12,  // Analyzed from a list
  manual: 10,         // Manually added
};

// ============================================
// SCORING FUNCTIONS
// ============================================

/**
 * Calculate keyword score from matches (0-40)
 * Based on sum of keyword weights, capped at 40
 */
export function calculateKeywordScore(matches: KeywordMatch[]): number {
  if (matches.length === 0) return 0;

  // Dedupe by keyword (take highest weight if same keyword matched multiple times)
  const uniqueMatches = new Map<string, number>();
  for (const match of matches) {
    const existing = uniqueMatches.get(match.keyword) || 0;
    if (match.weight > existing) {
      uniqueMatches.set(match.keyword, match.weight);
    }
  }

  // Sum weights
  const totalWeight = Array.from(uniqueMatches.values()).reduce((sum, w) => sum + w, 0);

  // Scale to 0-40 range
  // Assume max practical weight is ~15 (3 high-weight keywords)
  const scaled = Math.min(40, Math.round((totalWeight / 15) * 40));

  return scaled;
}

/**
 * Calculate source reliability score (0-20)
 */
export function calculateSourceReliability(sourceType: ListenerSourceType): number {
  return SOURCE_RELIABILITY[sourceType] || 10;
}

/**
 * Calculate domain quality score (0-20)
 * Higher for domains extracted from URLs vs text mentions
 */
export function calculateDomainQuality(
  domainSource: 'url' | 'mention' | 'email',
  isKnownCompany: boolean = false
): number {
  // Known companies get full score
  if (isKnownCompany) return 20;

  // Score based on extraction source
  switch (domainSource) {
    case 'url':
      return 18; // High confidence - explicit link
    case 'mention':
      return 12; // Medium - text mention
    case 'email':
      return 10; // Lower - just email domain
    default:
      return 10;
  }
}

/**
 * Calculate recency score (0-10)
 * Based on how recently the source was published
 */
export function calculateRecencyScore(publishedAt: Date | null): number {
  if (!publishedAt) return 5; // Unknown date, give medium score

  const now = new Date();
  const ageMs = now.getTime() - publishedAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours < 24) return 10;      // Last 24 hours
  if (ageHours < 72) return 8;       // Last 3 days
  if (ageHours < 168) return 6;      // Last week
  if (ageHours < 720) return 4;      // Last month
  return 2;                           // Older
}

/**
 * Calculate context relevance score (0-10)
 * Is the company the subject of discussion, or just mentioned?
 */
export function calculateContextRelevance(
  triggerText: string,
  companyDomain: string,
  sourceTitle?: string
): number {
  const domainParts = companyDomain.split('.');
  const companyName = domainParts[0].toLowerCase();
  const textLower = triggerText.toLowerCase();
  const titleLower = (sourceTitle || '').toLowerCase();

  let score = 5; // Base score

  // Company mentioned in title = high relevance
  if (titleLower.includes(companyName) || titleLower.includes(companyDomain)) {
    score += 3;
  }

  // Multiple mentions in text = higher relevance
  const mentionCount = (textLower.match(new RegExp(companyName, 'g')) || []).length;
  if (mentionCount >= 3) score += 2;
  else if (mentionCount >= 2) score += 1;

  return Math.min(10, score);
}

// ============================================
// MAIN SCORING FUNCTION
// ============================================

/**
 * Calculate overall confidence score (0-100)
 */
export function calculateConfidence(factors: ConfidenceFactors): number {
  const total =
    factors.keywordScore +
    factors.sourceReliability +
    factors.domainQuality +
    factors.recency +
    factors.contextRelevance;

  // Clamp to 0-100
  return Math.max(0, Math.min(100, total));
}

/**
 * Calculate confidence from raw inputs
 * Convenience function that combines all scoring
 */
export function scoreDiscovery(params: {
  matches: KeywordMatch[];
  sourceType: ListenerSourceType;
  domainSource: 'url' | 'mention' | 'email';
  publishedAt: Date | null;
  triggerText: string;
  companyDomain: string;
  sourceTitle?: string;
  isKnownCompany?: boolean;
}): { score: number; factors: ConfidenceFactors } {
  const factors: ConfidenceFactors = {
    keywordScore: calculateKeywordScore(params.matches),
    sourceReliability: calculateSourceReliability(params.sourceType),
    domainQuality: calculateDomainQuality(params.domainSource, params.isKnownCompany),
    recency: calculateRecencyScore(params.publishedAt),
    contextRelevance: calculateContextRelevance(
      params.triggerText,
      params.companyDomain,
      params.sourceTitle
    ),
  };

  return {
    score: calculateConfidence(factors),
    factors,
  };
}

/**
 * Check if a discovery should be auto-promoted
 */
export function shouldAutoPromote(confidenceScore: number): boolean {
  return confidenceScore >= 80;
}

/**
 * Get a human-readable confidence level
 */
export function getConfidenceLevel(score: number): 'low' | 'medium' | 'high' | 'very_high' {
  if (score >= 80) return 'very_high';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}
