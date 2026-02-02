// ============================================
// LISTENER: SCAN RSS FEEDS
// ============================================
// Inngest function to scan tech news RSS feeds for potential Helix clients

import { inngest } from '../../client';
import {
  fetchRecentArticles,
  getArticleText,
  getArticleUrl,
  DEFAULT_FEEDS,
} from '@/lib/listener/clients/rss';
import {
  extractDomainsFromSource,
  domainToCompanyName,
} from '@/lib/listener/domain-extractor';
import { matchText, getBestMatchContext, getPrimaryCategory } from '@/lib/listener/keyword-matcher';
import { scoreDiscovery } from '@/lib/listener/confidence-scorer';
import { createDiscovery } from '@/lib/listener/db/discoveries';
import { startRun, completeRun, addRunError, getLastCursor } from '@/lib/listener/db/runs';
import { DiscoveryCandidate, RSSArticle } from '@/lib/listener/types';

/**
 * Process a single RSS article and create discoveries if relevant
 */
async function processArticle(
  article: RSSArticle & { feedName: string },
  teamId: string
): Promise<{ created: number; duplicates: number; errors: number }> {
  const results = { created: 0, duplicates: 0, errors: 0 };

  // Get text content from article
  const text = getArticleText(article);
  if (!text || text.length < 50) return results;

  // Check for keyword matches
  const matchResult = await matchText(text);
  if (matchResult.matches.length === 0) return results;

  // Extract domains from the article
  const domains = extractDomainsFromSource(
    article.link,
    article.title,
    article.description || article.content
  );
  if (domains.length === 0) return results;

  // Create discoveries for each domain
  for (const domain of domains) {
    try {
      const triggerText = getBestMatchContext(text, matchResult.matches, 200);

      const { score } = scoreDiscovery({
        matches: matchResult.matches,
        sourceType: 'news_article',
        domainSource: domain.source,
        publishedAt: article.pubDate || null,
        triggerText,
        companyDomain: domain.domain,
        sourceTitle: article.title,
      });

      const candidate: DiscoveryCandidate = {
        companyDomain: domain.domain,
        companyName: domainToCompanyName(domain.domain),
        sourceType: 'news_article',
        sourceUrl: getArticleUrl(article),
        sourceTitle: `[${article.feedName}] ${article.title}`,
        triggerText,
        keywordsMatched: matchResult.matches.map(m => m.keyword),
        keywordCategory: getPrimaryCategory(matchResult.matches) || undefined,
        confidenceScore: score,
        helixProducts: matchResult.suggestedHelixProducts,
        sourcePublishedAt: article.pubDate,
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
 * Main RSS scanning function
 */
export const scanRSSFeeds = inngest.createFunction(
  {
    id: 'listener-scan-rss',
    name: 'Listener: Scan RSS Feeds',
    concurrency: {
      limit: 1, // Only one RSS scan at a time
    },
    retries: 2,
  },
  { event: 'listener/scan-rss' },
  async ({ event, step }) => {
    const {
      teamId,
      feedUrls,
      maxArticles = 100,
      maxAgeHours = 48,
    } = event.data;

    // Start tracking run
    const runId = await step.run('start-run', async () => {
      const cursor = await getLastCursor('rss');
      return await startRun('rss', 'scheduled', cursor || {});
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
      // Fetch articles from RSS feeds
      const feedConfigs = feedUrls
        ? feedUrls.map((url: string) => ({ url, name: url }))
        : DEFAULT_FEEDS;

      const articles = await step.run('fetch-articles', async () => {
        return await fetchRecentArticles(feedConfigs, maxArticles, maxAgeHours);
      });

      stats.itemsScanned = articles.length;

      if (articles.length === 0) {
        await step.run('complete-run-empty', async () => {
          await completeRun(runId, 'completed', {
            itemsScanned: 0,
            discoveriesCreated: 0,
            duplicatesSkipped: 0,
            autoPromoted: 0,
            errorsCount: 0,
            cursorData: { lastScanAt: new Date().toISOString() },
          });
        });

        return {
          status: 'completed',
          runId,
          message: 'No recent articles found',
          ...stats,
        };
      }

      // Process articles in batches
      const batchSize = 10;
      for (let i = 0; i < articles.length; i += batchSize) {
        const batch = articles.slice(i, i + batchSize);

        const batchResults = await step.run(`process-batch-${i}`, async () => {
          const results = { created: 0, duplicates: 0, errors: 0 };

          for (const article of batch) {
            try {
              const articleResults = await processArticle(article, teamId);
              results.created += articleResults.created;
              results.duplicates += articleResults.duplicates;
              results.errors += articleResults.errors;
            } catch (error) {
              console.error(`Error processing article ${article.link}:`, error);
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
          cursorData: {
            lastScanAt: new Date().toISOString(),
            feedsScanned: feedConfigs.map(f => f.name),
          },
        });
      });

      return {
        status: 'completed',
        runId,
        feedsScanned: feedConfigs.length,
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

export const functions = [scanRSSFeeds];
