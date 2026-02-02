// ============================================
// LISTENER INNGEST FUNCTIONS
// ============================================

export { scanHackerNews, functions as hnFunctions } from './scan-hn';
export { scanRSSFeeds, functions as rssFunctions } from './scan-rss';

// Aggregate all listener functions
import { functions as hnFunctions } from './scan-hn';
import { functions as rssFunctions } from './scan-rss';

export const functions = [...hnFunctions, ...rssFunctions];
