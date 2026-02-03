// ============================================
// PROFILE ENRICHMENT
// ============================================
// Utilities for enriching HN profiles with LinkedIn and other data
// Attempts to connect HN users to their professional profiles

import { HNUser, HNUserCompanyInfo } from './types';
import { extractCompanyFromProfile, extractSocialProfiles } from './clients/hn';

/**
 * Try to find LinkedIn profile URL from various sources
 */
export async function findLinkedInProfile(
  user: HNUser,
  companyInfo: HNUserCompanyInfo
): Promise<string | null> {
  // 1. Check if LinkedIn URL is already in the about field
  if (companyInfo.linkedinUrl) {
    return companyInfo.linkedinUrl;
  }

  // 2. Check if we extracted it from the profile
  if (user.about) {
    const socialProfiles = extractSocialProfiles(user.about);
    if (socialProfiles.linkedinUrl) {
      return socialProfiles.linkedinUrl;
    }
  }

  // 3. Could extend to search LinkedIn API if available
  // For now, return null if not found directly
  return null;
}

/**
 * Try to find GitHub profile from HN user
 */
export async function findGitHubProfile(
  user: HNUser,
  companyInfo: HNUserCompanyInfo
): Promise<string | null> {
  if (companyInfo.githubUsername) {
    return `https://github.com/${companyInfo.githubUsername}`;
  }

  if (user.about) {
    const socialProfiles = extractSocialProfiles(user.about);
    if (socialProfiles.githubUsername) {
      return `https://github.com/${socialProfiles.githubUsername}`;
    }
  }

  return null;
}

/**
 * Calculate user credibility score based on karma and account age
 * Returns a multiplier between 0.5 and 1.2
 */
export function calculateUserCredibility(user: HNUser): number {
  let score = 1.0;

  // Karma boost
  if (user.karma >= 10000) score += 0.15;
  else if (user.karma >= 5000) score += 0.1;
  else if (user.karma >= 1000) score += 0.05;
  else if (user.karma < 100) score -= 0.1;
  else if (user.karma < 50) score -= 0.2;

  // Account age boost (if created timestamp available)
  if (user.created) {
    const accountAgeYears = (Date.now() - user.created * 1000) / (365 * 24 * 60 * 60 * 1000);
    if (accountAgeYears >= 10) score += 0.1;
    else if (accountAgeYears >= 5) score += 0.05;
    else if (accountAgeYears < 1) score -= 0.1;
  }

  // Clamp between 0.5 and 1.2
  return Math.max(0.5, Math.min(1.2, score));
}

/**
 * Enrich company info with additional data from social profiles
 */
export async function enrichCompanyInfo(
  user: HNUser,
  baseInfo: HNUserCompanyInfo
): Promise<HNUserCompanyInfo> {
  const enriched = { ...baseInfo };

  // Add LinkedIn URL if found
  const linkedinUrl = await findLinkedInProfile(user, baseInfo);
  if (linkedinUrl) {
    enriched.linkedinUrl = linkedinUrl;
  }

  // Add GitHub username if found
  const githubProfile = await findGitHubProfile(user, baseInfo);
  if (githubProfile) {
    enriched.githubUsername = githubProfile.split('/').pop() || null;
  }

  // Add Twitter handle if found and not already set
  if (!enriched.twitterHandle && user.about) {
    const socialProfiles = extractSocialProfiles(user.about);
    if (socialProfiles.twitterHandle) {
      enriched.twitterHandle = socialProfiles.twitterHandle;
    }
  }

  return enriched;
}

/**
 * Score a profile-based discovery
 * Combines story relevance, profile quality, and user credibility
 */
export function scoreProfileDiscovery(params: {
  companyInfo: HNUserCompanyInfo;
  user: HNUser;
  storyRelevanceScore: number; // 0-100 from keyword matching
  hasLinkedIn: boolean;
  hasGitHub: boolean;
}): { score: number; factors: ProfileScoreFactors } {
  const factors: ProfileScoreFactors = {
    extractionConfidence: 0,
    userCredibility: 0,
    storyRelevance: 0,
    socialPresence: 0,
  };

  // 1. Extraction confidence (0-35)
  // Based on how the company was extracted
  factors.extractionConfidence = Math.round(params.companyInfo.confidence * 35);

  // 2. User credibility (0-25)
  const credibilityMultiplier = calculateUserCredibility(params.user);
  factors.userCredibility = Math.round((credibilityMultiplier - 0.5) / 0.7 * 25);

  // 3. Story relevance (0-25)
  // How relevant was the story they commented on
  factors.storyRelevance = Math.round(params.storyRelevanceScore * 0.25);

  // 4. Social presence (0-15)
  // Having LinkedIn/GitHub increases confidence
  if (params.hasLinkedIn) factors.socialPresence += 10;
  if (params.hasGitHub) factors.socialPresence += 5;

  const totalScore = Math.min(100,
    factors.extractionConfidence +
    factors.userCredibility +
    factors.storyRelevance +
    factors.socialPresence
  );

  return { score: totalScore, factors };
}

export interface ProfileScoreFactors {
  extractionConfidence: number;
  userCredibility: number;
  storyRelevance: number;
  socialPresence: number;
}

/**
 * Check if a profile extraction meets minimum quality threshold
 */
export function isQualityExtraction(
  companyInfo: HNUserCompanyInfo,
  user: HNUser,
  minConfidence: number = 0.5
): boolean {
  // Must have a company domain
  if (!companyInfo.companyDomain) return false;

  // Must meet minimum confidence
  if (companyInfo.confidence < minConfidence) return false;

  // Reject very low karma accounts (likely throwaway)
  if (user.karma < 10) return false;

  // Reject if domain looks like a personal site pattern
  const domain = companyInfo.companyDomain.toLowerCase();
  const personalPatterns = [
    /^[a-z]+\.[a-z]+$/, // single word domains like "john.com"
    /blog/, /portfolio/, /personal/,
  ];
  for (const pattern of personalPatterns) {
    if (pattern.test(domain)) {
      // But allow if high confidence (URL or email)
      if (companyInfo.confidence < 0.8) return false;
    }
  }

  return true;
}

/**
 * Estimate company info from GitHub profile
 * Can be used as a fallback or to validate HN profile extraction
 */
export async function extractCompanyFromGitHub(
  githubUsername: string
): Promise<{ company: string | null; domain: string | null } | null> {
  try {
    // Use GitHub API to get user profile
    const response = await fetch(`https://api.github.com/users/${githubUsername}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'RelationshipIntel/1.0',
      },
    });

    if (!response.ok) return null;

    const data = await response.json();

    // GitHub profiles often have company field
    if (data.company) {
      let company = data.company;
      // Clean up @ prefix if present
      if (company.startsWith('@')) {
        company = company.slice(1);
      }
      // Try to derive domain
      const domain = company.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '') + '.com';
      return { company, domain };
    }

    return null;
  } catch (error) {
    console.error(`Failed to fetch GitHub profile for ${githubUsername}:`, error);
    return null;
  }
}

/**
 * Cross-validate company info from multiple sources
 * Returns boosted confidence if sources agree
 */
export function crossValidateCompanyInfo(
  hnCompanyInfo: HNUserCompanyInfo,
  githubCompany: { company: string | null; domain: string | null } | null
): HNUserCompanyInfo {
  if (!githubCompany || !githubCompany.domain) {
    return hnCompanyInfo;
  }

  // Check if domains match or are similar
  const hnDomain = hnCompanyInfo.companyDomain?.toLowerCase();
  const ghDomain = githubCompany.domain.toLowerCase();

  if (hnDomain && (hnDomain === ghDomain || hnDomain.includes(ghDomain.split('.')[0]))) {
    // Domains match - boost confidence
    return {
      ...hnCompanyInfo,
      confidence: Math.min(0.95, hnCompanyInfo.confidence + 0.15),
    };
  }

  // If HN has no company but GitHub does, use GitHub
  if (!hnCompanyInfo.companyDomain && githubCompany.domain) {
    return {
      ...hnCompanyInfo,
      companyDomain: githubCompany.domain,
      companyName: githubCompany.company,
      confidence: 0.7, // Medium confidence for GitHub-only
      source: 'github',
    };
  }

  return hnCompanyInfo;
}
