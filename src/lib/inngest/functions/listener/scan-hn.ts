// ============================================
// LISTENER: SCAN HACKER NEWS
// ============================================
// Inngest function to scan HN for potential Helix clients

import { inngest } from '../../client';
import {
  fetchFrontPage,
  fetchAskHN,
  fetchShowHN,
  getItemUrl,
  getItemText,
  timestampToDate,
} from '@/lib/listener/clients/hn';
import {
  extractDomainsFromSource,
  domainToCompanyName,
} from '@/lib/listener/domain-extractor';
import { matchText, getBestMatchContext, getPrimaryCategory } from '@/lib/listener/keyword-matcher';
import { scoreDiscovery } from '@/lib/listener/confidence-scorer';
import { createDiscovery } from '@/lib/listener/db/discoveries';
import { startRun, completeRun, addRunError, getLastCursor } from '@/lib/listener/db/runs';
import { DiscoveryCandidate, HNItem } from '@/lib/listener/types';

/**
 * Process a single HN item and create discoveries if relevant
 */
async function processHNItem(
  item: HNItem,
  teamId: string,
  sourceType: 'hn_post' | 'hn_comment'
): Promise<{ created: number; duplicates: number; errors: number }> {
  const results = { created: 0, duplicates: 0, errors: 0 };

  // Get text content from item
  const text = getItemText(item);
  if (!text || text.length < 20) return results;

  // Check for keyword matches
  const matchResult = await matchText(text);
  if (matchResult.matches.length === 0) return results;

  // Extract domains from the item
  const domains = extractDomainsFromSource(item.url, item.title, item.text);
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
      includeComments = false,
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
      errorDetails: [] as Array<{ message: string; timestamp: string }>,
    };

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

      // Process items in batches
      const batchSize = 10;
      for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);

        const batchResults = await step.run(`process-batch-${i}`, async () => {
          const results = { created: 0, duplicates: 0, errors: 0 };

          for (const item of batch) {
            try {
              const itemResults = await processHNItem(item, teamId, 'hn_post');
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

      // Complete run successfully
      await step.run('complete-run', async () => {
        await completeRun(runId, 'completed', {
          itemsScanned: stats.itemsScanned,
          discoveriesCreated: stats.discoveriesCreated,
          duplicatesSkipped: stats.duplicatesSkipped,
          autoPromoted: stats.autoPromoted,
          errorsCount: stats.errorsCount,
          errorDetails: stats.errorDetails,
          cursorData: { lastScanAt: new Date().toISOString() },
        });
      });

      return {
        status: 'completed',
        runId,
        ...stats,
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
