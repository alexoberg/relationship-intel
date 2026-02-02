// ============================================
// LISTENER: SCAN HACKER NEWS
// ============================================
// Inngest function to scan HN for potential Helix clients

import { inngest } from '../../client';
import {
  fetchFrontPage,
  fetchAskHN,
  fetchShowHN,
  fetchStoryComments,
  getItemUrl,
  getItemText,
  getUserUrl,
  timestampToDate,
  fetchUser,
  extractCompanyFromProfile,
  getCommenterCompanies,
} from '@/lib/listener/clients/hn';
import {
  extractDomainsFromSource,
  domainToCompanyName,
  isCompanyDomain,
} from '@/lib/listener/domain-extractor';
import { matchText, getBestMatchContext, getPrimaryCategory } from '@/lib/listener/keyword-matcher';
import { scoreDiscovery } from '@/lib/listener/confidence-scorer';
import { createDiscovery } from '@/lib/listener/db/discoveries';
import { startRun, completeRun, addRunError, getLastCursor } from '@/lib/listener/db/runs';
import { DiscoveryCandidate, HNItem, HNUserCompanyInfo } from '@/lib/listener/types';

/**
 * Process a single HN item and create discoveries if relevant
 * Now also extracts company info from poster's profile when no domain found
 */
async function processHNItem(
  item: HNItem,
  teamId: string,
  sourceType: 'hn_post' | 'hn_comment',
  userCompanyCache?: Map<string, HNUserCompanyInfo>
): Promise<{ created: number; duplicates: number; errors: number }> {
  const results = { created: 0, duplicates: 0, errors: 0 };

  // Get text content from item
  const text = getItemText(item);
  if (!text || text.length < 20) return results;

  // Check for keyword matches
  const matchResult = await matchText(text);
  if (matchResult.matches.length === 0) return results;

  // Extract domains from the item content
  let domains = extractDomainsFromSource(item.url, item.title, item.text);

  // If no company domain found but we have a keyword match,
  // try to get company from the poster's profile
  if (domains.length === 0 && item.by) {
    let userCompanyInfo: HNUserCompanyInfo | undefined;

    // Check cache first
    if (userCompanyCache?.has(item.by)) {
      userCompanyInfo = userCompanyCache.get(item.by);
    } else {
      // Fetch user profile and extract company
      const user = await fetchUser(item.by);
      if (user) {
        userCompanyInfo = extractCompanyFromProfile(user);
        if (userCompanyCache && (userCompanyInfo.companyDomain || userCompanyInfo.companyName)) {
          userCompanyCache.set(item.by, userCompanyInfo);
        }
      }
    }

    // If we found company info from profile, add it as a domain
    if (userCompanyInfo?.companyDomain && isCompanyDomain(userCompanyInfo.companyDomain)) {
      domains = [{
        domain: userCompanyInfo.companyDomain,
        source: 'mention' as const,
        confidence: userCompanyInfo.confidence,
        context: `From HN user ${item.by}'s profile`,
      }];
    }
  }

  // Still no domains? Skip this item
  if (domains.length === 0) return results;

  // Create discoveries for each domain
  for (const domain of domains) {
    try {
      const triggerText = getBestMatchContext(text, matchResult.matches, 200);
      const publishedAt = item.time ? timestampToDate(item.time) : null;

      const { score } = scoreDiscovery({
        matches: matchResult.matches,
        sourceType,
        domainSource: domain.source,
        publishedAt,
        triggerText,
        companyDomain: domain.domain,
        sourceTitle: item.title,
      });

      const candidate: DiscoveryCandidate = {
        companyDomain: domain.domain,
        companyName: domainToCompanyName(domain.domain),
        sourceType,
        sourceUrl: getItemUrl(item.id),
        sourceTitle: item.title || undefined,
        triggerText,
        keywordsMatched: matchResult.matches.map(m => m.keyword),
        keywordCategory: getPrimaryCategory(matchResult.matches) || undefined,
        confidenceScore: score,
        helixProducts: matchResult.suggestedHelixProducts,
        sourcePublishedAt: publishedAt || undefined,
      };

      const result = await createDiscovery(candidate, teamId);

      if (result.success) {
        if (result.status === 'duplicate') {
          results.duplicates++;
        } else {
          results.created++;
        }
      } else {
        results.errors++;
      }
    } catch (error) {
      console.error(`Error processing domain ${domain.domain}:`, error);
      results.errors++;
    }
  }

  return results;
}

/**
 * Process comments on a relevant story to find companies from commenters
 */
async function processStoryComments(
  storyId: number,
  storyTitle: string,
  teamId: string,
  matchResult: Awaited<ReturnType<typeof matchText>>
): Promise<{ created: number; duplicates: number; errors: number; usersChecked: number }> {
  const results = { created: 0, duplicates: 0, errors: 0, usersChecked: 0 };

  // Fetch comments
  const comments = await fetchStoryComments(storyId, 2, 100);
  if (comments.length === 0) return results;

  // Get company info for all commenters
  const commenterCompanies = await getCommenterCompanies(comments, 50);
  results.usersChecked = commenterCompanies.size;

  // Create discoveries for each commenter's company
  for (const [username, companyInfo] of commenterCompanies) {
    if (!companyInfo.companyDomain || !isCompanyDomain(companyInfo.companyDomain)) {
      continue;
    }

    try {
      // Find a comment by this user to use as context
      const userComment = comments.find(c => c.by === username);
      const commentText = userComment ? getItemText(userComment) : '';

      const triggerText = `User ${username} from ${companyInfo.companyName || companyInfo.companyDomain} commented on "${storyTitle}": ${commentText.slice(0, 150)}...`;

      const { score } = scoreDiscovery({
        matches: matchResult.matches,
        sourceType: 'hn_comment',
        domainSource: 'mention',
        publishedAt: userComment?.time ? timestampToDate(userComment.time) : null,
        triggerText,
        companyDomain: companyInfo.companyDomain,
        sourceTitle: storyTitle,
      });

      // Adjust score based on profile confidence
      const adjustedScore = Math.round(score * companyInfo.confidence);

      const candidate: DiscoveryCandidate = {
        companyDomain: companyInfo.companyDomain,
        companyName: companyInfo.companyName || domainToCompanyName(companyInfo.companyDomain),
        sourceType: 'hn_comment',
        sourceUrl: getUserUrl(username),
        sourceTitle: `${username} commented on: ${storyTitle}`,
        triggerText,
        keywordsMatched: matchResult.matches.map(m => m.keyword),
        keywordCategory: getPrimaryCategory(matchResult.matches) || undefined,
        confidenceScore: adjustedScore,
        helixProducts: matchResult.suggestedHelixProducts,
        sourcePublishedAt: userComment?.time ? timestampToDate(userComment.time) : undefined,
      };

      const result = await createDiscovery(candidate, teamId);

      if (result.success) {
        if (result.status === 'duplicate') {
          results.duplicates++;
        } else {
          results.created++;
        }
      } else {
        results.errors++;
      }
    } catch (error) {
      console.error(`Error processing commenter ${username}:`, error);
      results.errors++;
    }
  }

  return results;
}

/**
 * Main HN scanning function
 */
export const scanHackerNews = inngest.createFunction(
  {
    id: 'listener-scan-hn',
    name: 'Listener: Scan Hacker News',
    concurrency: {
      limit: 1, // Only one HN scan at a time
    },
    retries: 2,
  },
  { event: 'listener/scan-hn' },
  async ({ event, step }) => {
    const {
      teamId,
      scanType = 'all',
      maxItems = 100,
      includeComments = true, // Now defaults to true - scan commenter profiles
      minScoreForComments = 3, // Only scan comments for high-relevance stories
    } = event.data;

    // Start tracking run
    const runId = await step.run('start-run', async () => {
      const cursor = await getLastCursor('hn');
      return await startRun('hn', 'scheduled', cursor || {});
    });

    const stats = {
      itemsScanned: 0,
      discoveriesCreated: 0,
      duplicatesSkipped: 0,
      autoPromoted: 0,
      errorsCount: 0,
      commenterProfilesChecked: 0,
      errorDetails: [] as Array<{ message: string; timestamp: string }>,
    };

    // Cache for user company info across items
    const userCompanyCache = new Map<string, HNUserCompanyInfo>();

    try {
      // Fetch HN items based on scan type
      const items: HNItem[] = [];

      if (scanType === 'front_page' || scanType === 'all') {
        const frontPage = await step.run('fetch-front-page', async () => {
          return await fetchFrontPage(maxItems);
        });
        items.push(...frontPage.items);
      }

      if (scanType === 'ask_hn' || scanType === 'all') {
        const askHN = await step.run('fetch-ask-hn', async () => {
          return await fetchAskHN(Math.min(50, maxItems));
        });
        items.push(...askHN.items);
      }

      if (scanType === 'show_hn' || scanType === 'all') {
        const showHN = await step.run('fetch-show-hn', async () => {
          return await fetchShowHN(Math.min(50, maxItems));
        });
        items.push(...showHN.items);
      }

      stats.itemsScanned = items.length;

      // Track which stories have high relevance (for comment scanning)
      const highRelevanceStories: Array<{ item: HNItem; matchResult: Awaited<ReturnType<typeof matchText>> }> = [];

      // Process items in batches
      const batchSize = 10;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);

        const batchResults = await step.run(`process-batch-${i}`, async () => {
          const results = { created: 0, duplicates: 0, errors: 0 };

          for (const item of batch) {
            try {
              // Check if this story is highly relevant (for later comment processing)
              const text = getItemText(item);
              if (text && text.length >= 20) {
                const matchResult = await matchText(text);
                if (matchResult.totalScore >= minScoreForComments) {
                  highRelevanceStories.push({ item, matchResult });
                }
              }

              const itemResults = await processHNItem(item, teamId, 'hn_post', userCompanyCache);
              results.created += itemResults.created;
              results.duplicates += itemResults.duplicates;
              results.errors += itemResults.errors;
            } catch (error) {
              console.error(`Error processing HN item ${item.id}:`, error);
              results.errors++;
            }
          }

          return results;
        });

        stats.discoveriesCreated += batchResults.created;
        stats.duplicatesSkipped += batchResults.duplicates;
        stats.errorsCount += batchResults.errors;
      }

      // Process comments from high-relevance stories to find company prospects
      if (includeComments && highRelevanceStories.length > 0) {
        // Limit to top 10 most relevant stories
        const topStories = highRelevanceStories
          .sort((a, b) => b.matchResult.totalScore - a.matchResult.totalScore)
          .slice(0, 10);

        for (let i = 0; i < topStories.length; i++) {
          const { item, matchResult } = topStories[i];

          const commentResults = await step.run(`process-comments-${item.id}`, async () => {
            return await processStoryComments(
              item.id,
              item.title || 'HN Story',
              teamId,
              matchResult
            );
          });

          stats.discoveriesCreated += commentResults.created;
          stats.duplicatesSkipped += commentResults.duplicates;
          stats.errorsCount += commentResults.errors;
          stats.commenterProfilesChecked += commentResults.usersChecked;
        }
      }

      // Complete run successfully
      await step.run('complete-run', async () => {
        await completeRun(runId, 'completed', {
          itemsScanned: stats.itemsScanned,
          discoveriesCreated: stats.discoveriesCreated,
          duplicatesSkipped: stats.duplicatesSkipped,
          autoPromoted: stats.autoPromoted,
          errorsCount: stats.errorsCount,
          commenterProfilesChecked: stats.commenterProfilesChecked,
          highRelevanceStoriesProcessed: highRelevanceStories.length,
          errorDetails: stats.errorDetails,
          cursorData: { lastScanAt: new Date().toISOString() },
        });
      });

      return {
        status: 'completed',
        runId,
        ...stats,
        highRelevanceStoriesProcessed: highRelevanceStories.length,
      };
    } catch (error) {
      // Log error and mark run as failed
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      stats.errorDetails.push({ message: errorMessage, timestamp: new Date().toISOString() });

      await step.run('fail-run', async () => {
        await addRunError(runId, errorMessage);
        await completeRun(runId, 'failed', {
          itemsScanned: stats.itemsScanned,
          discoveriesCreated: stats.discoveriesCreated,
          duplicatesSkipped: stats.duplicatesSkipped,
          autoPromoted: stats.autoPromoted,
          errorsCount: stats.errorsCount + 1,
          errorDetails: stats.errorDetails,
        });
      });

      throw error;
    }
  }
);

export const functions = [scanHackerNews];
