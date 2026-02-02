// ============================================
// LISTENER SERVICE
// ============================================
// Main exports for the listener intelligence engine

// Types
export * from './types';

// Domain extraction
export {
  extractDomainFromUrl,
  extractDomainsFromText,
  extractDomainsFromSource,
  normalizeDomain,
  isCompanyDomain,
  domainToCompanyName,
} from './domain-extractor';

// Keyword matching
export {
  loadKeywords,
  clearKeywordCache,
  matchKeywords,
  matchText,
  containsKeywords,
  extractMatchContext,
  getBestMatchContext,
  getPrimaryCategory,
} from './keyword-matcher';

// Confidence scoring
export {
  SOURCE_RELIABILITY,
  calculateKeywordScore,
  calculateSourceReliability,
  calculateDomainQuality,
  calculateRecencyScore,
  calculateContextRelevance,
  calculateConfidence,
  scoreDiscovery,
  shouldAutoPromote,
  getConfidenceLevel,
} from './confidence-scorer';

// HN client
export {
  fetchItem,
  fetchItems,
  fetchFrontPage,
  fetchAskHN,
  fetchShowHN,
  fetchRecentItems,
  fetchStoryComments,
  getItemUrl,
  timestampToDate,
  getItemText,
} from './clients/hn';

// RSS client
export {
  DEFAULT_FEEDS,
  fetchFeed,
  fetchAllFeeds,
  fetchRecentArticles,
  getArticleText,
  getArticleUrl,
} from './clients/rss';

// Database operations
export {
  createDiscovery,
  createDiscoveries,
  getDiscovery,
  listDiscoveries,
  checkDomainExists,
  updateDiscoveryStatus,
  promoteDiscovery,
  dismissDiscovery,
  getDiscoveryStats,
} from './db/discoveries';

export {
  startRun,
  updateRunProgress,
  completeRun,
  addRunError,
  getRun,
  listRuns,
  getLastSuccessfulRun,
  getLastCursor,
  getRunStats,
} from './db/runs';

export {
  getActiveKeywords,
  getAllKeywords,
  getKeyword,
  getKeywordsByCategory,
  addKeyword,
  updateKeyword,
  toggleKeyword,
  deleteKeyword,
  bulkAddKeywords,
  updateCategoryWeights,
  getKeywordStats,
} from './db/keywords';
