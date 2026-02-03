// ============================================
// LISTENER SERVICE TYPES
// ============================================

import { HelixProduct } from '../helix-sales';

// ============================================
// DATABASE TYPES
// ============================================

export type ListenerSourceType =
  | 'hn_post'
  | 'hn_comment'
  | 'hn_profile'
  | 'news_article'
  | 'reddit_post'
  | 'reddit_comment'
  | 'twitter'
  | 'status_page'
  | 'github_issue'
  | 'list_analysis'
  | 'manual';

export type ListenerDiscoveryStatus =
  | 'new'
  | 'reviewing'
  | 'promoted'
  | 'dismissed'
  | 'duplicate';

export type ListenerRunStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'partial';

export type KeywordCategory =
  | 'pain_signal'
  | 'regulatory'
  | 'cost'
  | 'competitor';

export interface ListenerDiscovery {
  id: string;
  company_domain: string;
  company_name: string | null;
  source_type: ListenerSourceType;
  source_url: string;
  source_title: string | null;
  trigger_text: string;
  keywords_matched: string[];
  keyword_category: KeywordCategory | null;
  confidence_score: number;
  relevance_score: number;
  helix_products: HelixProduct[];
  status: ListenerDiscoveryStatus;
  promoted_prospect_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  enrichment_data: Record<string, unknown>;
  enriched_at: string | null;
  discovered_at: string;
  source_published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ListenerRun {
  id: string;
  source_type: string;
  run_type: 'scheduled' | 'manual' | 'backfill';
  started_at: string;
  completed_at: string | null;
  status: ListenerRunStatus;
  items_scanned: number;
  discoveries_created: number;
  duplicates_skipped: number;
  auto_promoted: number;
  errors_count: number;
  error_details: Array<{ message: string; timestamp: string }>;
  cursor_data: Record<string, unknown>;
  created_at: string;
}

export interface ListenerKeyword {
  id: string;
  keyword: string;
  category: KeywordCategory;
  weight: number;
  is_active: boolean;
  helix_products: HelixProduct[];
  created_at: string;
  updated_at: string;
}

// ============================================
// HACKER NEWS TYPES
// ============================================

export interface HNItem {
  id: number;
  type: 'story' | 'comment' | 'job' | 'poll' | 'pollopt';
  by?: string;
  time: number;
  text?: string;
  url?: string;
  title?: string;
  parent?: number;
  kids?: number[];
  score?: number;
  descendants?: number;
  deleted?: boolean;
  dead?: boolean;
}

export interface HNUser {
  id: string;        // username
  created: number;   // Unix timestamp
  karma: number;
  about?: string;    // Bio - may contain company info
  submitted?: number[]; // IDs of submitted items
}

export interface HNUserCompanyInfo {
  username: string;
  companyDomain: string | null;
  companyName: string | null;
  confidence: number;
  source: 'about_url' | 'about_text' | 'email_domain' | 'linkedin' | 'twitter' | 'github';
  rawAbout: string | null;
  linkedinUrl?: string | null;
  twitterHandle?: string | null;
  githubUsername?: string | null;
}

export interface HNScanResult {
  items: HNItem[];
  scannedCount: number;
  lastItemId: number;
}

// ============================================
// RSS TYPES
// ============================================

export interface RSSArticle {
  title: string;
  link: string;
  description?: string;
  content?: string;
  pubDate?: Date;
  author?: string;
  categories?: string[];
  guid?: string;
}

export interface RSSFeed {
  url: string;
  name: string;
  articles: RSSArticle[];
  lastFetched: Date;
}

export interface RSSFeedConfig {
  url: string;
  name: string;
  category?: string;
}

// ============================================
// PROCESSING TYPES
// ============================================

export interface ExtractedDomain {
  domain: string;
  source: 'url' | 'mention' | 'email';
  confidence: number;
  context: string;
}

export interface KeywordMatch {
  keyword: string;
  category: KeywordCategory;
  weight: number;
  helixProducts: HelixProduct[];
  matchedText: string;
  position: number;
}

export interface MatchResult {
  matches: KeywordMatch[];
  totalScore: number;
  categories: KeywordCategory[];
  suggestedHelixProducts: HelixProduct[];
}

export interface ConfidenceFactors {
  keywordScore: number;      // From keyword matches (0-40)
  sourceReliability: number; // HN front page > comment (0-20)
  domainQuality: number;     // Known company vs extracted (0-20)
  recency: number;           // How recent the source (0-10)
  contextRelevance: number;  // Is it about the company or just mentioned (0-10)
}

// ============================================
// DISCOVERY CREATION TYPES
// ============================================

export interface DiscoveryCandidate {
  companyDomain: string;
  companyName?: string;
  sourceType: ListenerSourceType;
  sourceUrl: string;
  sourceTitle?: string;
  triggerText: string;
  keywordsMatched: string[];
  keywordCategory?: KeywordCategory;
  confidenceScore: number;
  helixProducts: HelixProduct[];
  sourcePublishedAt?: Date;
}

export interface DiscoveryResult {
  success: boolean;
  discoveryId?: string;
  status: 'created' | 'duplicate' | 'auto_promoted' | 'error';
  prospectId?: string;
  error?: string;
}

// ============================================
// SCAN RESULT TYPES
// ============================================

export interface ScanResult {
  runId: string;
  sourceType: ListenerSourceType;
  itemsScanned: number;
  discoveriesCreated: number;
  duplicatesSkipped: number;
  autoPromoted: number;
  errors: Array<{ message: string; timestamp: string }>;
  duration: number;
}
