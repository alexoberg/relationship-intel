// ============================================
// LISTENER: SCAN HN USER PROFILES
// ============================================
// Dedicated Inngest function for aggressive HN user profile scanning
// Extracts company info and creates discoveries with 'hn_profile' source type

import { inngest } from '../../client';
import {
  fetchFrontPage,
  fetchAskHN,
  fetchStoryComments,
  getItemUrl,
  getItemText,
  getUserUrl,
  timestampToDate,
  fetchUser,
  fetchUsers,
  extractCompanyFromProfile,
  clearCaches,
  getCacheStats,
} from '@/lib/listener/clients/hn';
import { matchText, getBestMatchContext, getPrimaryCategory } from '@/lib/listener/keyword-matcher';
import { createDiscovery } from '@/lib/listener/db/discoveries';
import { startRun, completeRun, addRunError } from '@/lib/listener/db/runs';
import {
  upsertHNUser,
  getRecentlyScannedUsers,
  shouldCreateDiscovery,
} from '@/lib/listener/db/hn-users';
import {
  enrichCompanyInfo,
  scoreProfileDiscovery,
  isQualityExtraction,
  extractCompanyFromGitHub,
  crossValidateCompanyInfo,
} from '@/lib/listener/profile-enrichment';
import { isCompanyDomain, domainToCompanyName } from '@/lib/listener/domain-extractor';
import { DiscoveryCandidate, HNItem, HNUser, HNUserCompanyInfo } from '@/lib/listener/types';
import { logger, metrics, timeAsync } from '@/lib/listener/instrumentation';

/**
 * Collect all unique usernames from a story and its comments
 */
async function collectStoryUsernames(
  story: HNItem,
  maxComments: number = 200
): Promise<{ usernames: string[]; commentsByUser: Map<string, HNItem> }> {
  const usernames = new Set<string>();
  const commentsByUser = new Map<string, HNItem>();

  // Add story author
  if (story.by) {
    usernames.add(story.by);
  }

  // Fetch comments and collect usernames
  const comments = await fetchStoryComments(story.id, 3, maxComments);

  for (const comment of comments) {
    if (comment.by) {
      usernames.add(comment.by);
      // Keep first comment by each user (for context)
      if (!commentsByUser.has(comment.by)) {
        commentsByUser.set(comment.by, comment);
      }
    }
  }

  return {
    usernames: Array.from(usernames),
    commentsByUser,
  };
}

/**
 * Process a batch of users and extract company info
 */
async function processUserBatch(
  usernames: string[],
  story: HNItem,
  storyMatchResult: Awaited<ReturnType<typeof matchText>>,
  commentsByUser: Map<string, HNItem>,
  teamId: string,
  options: {
    minKarma: number;
    minConfidence: number;
    autoPromoteThreshold: number;
    enrichWithGitHub: boolean;
  }
): Promise<{
  processed: number;
  discoveries: number;
  duplicates: number;
  errors: number;
  usersTracked: number;
}> {
  const results = {
    processed: 0,
    discoveries: 0,
    duplicates: 0,
    errors: 0,
    usersTracked: 0,
  };

  // Fetch all user profiles
  const users = await fetchUsers(usernames, 5);

  for (const [username, user] of users) {
    results.processed++;

    try {
      // Filter by karma
      if (user.karma < options.minKarma) {
        continue;
      }

      // Extract company info
      let companyInfo = extractCompanyFromProfile(user);

      // Enrich with social profiles
      companyInfo = await enrichCompanyInfo(user, companyInfo);

      // Optionally cross-validate with GitHub
      if (options.enrichWithGitHub && companyInfo.githubUsername) {
        const githubCompany = await extractCompanyFromGitHub(companyInfo.githubUsername);
        if (githubCompany) {
          companyInfo = crossValidateCompanyInfo(companyInfo, githubCompany);
        }
      }

      // Check if extraction is quality enough
      if (!isQualityExtraction(companyInfo, user, options.minConfidence)) {
        // Still track the user for future scans
        await upsertHNUser(user, companyInfo, {
          storyId: story.id,
          storyTitle: story.title || 'HN Story',
        });
        results.usersTracked++;
        continue;
      }

      // Check if we should create a discovery for this domain
      const shouldCreate = await shouldCreateDiscovery(companyInfo.companyDomain!, teamId);
      if (!shouldCreate.create) {
        // Track user but skip discovery creation
        await upsertHNUser(user, companyInfo, {
          storyId: story.id,
          storyTitle: story.title || 'HN Story',
        });
        results.usersTracked++;
        results.duplicates++;
        continue;
      }

      // Score the profile discovery
      const { score } = scoreProfileDiscovery({
        companyInfo,
        user,
        storyRelevanceScore: storyMatchResult.totalScore * 10, // Scale to 0-100
        hasLinkedIn: !!companyInfo.linkedinUrl,
        hasGitHub: !!companyInfo.githubUsername,
      });

      // Get comment context if available
      const userComment = commentsByUser.get(username);
      const commentText = userComment ? getItemText(userComment) : '';

      // Build trigger text
      const triggerText = buildTriggerText(
        username,
        companyInfo,
        story.title || 'HN Discussion',
        commentText,
        storyMatchResult
      );

      // Create discovery candidate
      const candidate: DiscoveryCandidate = {
        companyDomain: companyInfo.companyDomain!,
        companyName: companyInfo.companyName || domainToCompanyName(companyInfo.companyDomain!),
        sourceType: 'hn_profile',
        sourceUrl: getUserUrl(username),
        sourceTitle: `${username}'s profile (commented on: ${story.title || 'HN Discussion'})`,
        triggerText,
        keywordsMatched: storyMatchResult.matches.map(m => m.keyword),
        keywordCategory: getPrimaryCategory(storyMatchResult.matches) || undefined,
        confidenceScore: score,
        helixProducts: storyMatchResult.suggestedHelixProducts,
        sourcePublishedAt: userComment?.time ? timestampToDate(userComment.time) : undefined,
      };

      // Create discovery (with lower auto-promote threshold for profiles)
      const result = await createDiscovery(candidate, teamId, options.autoPromoteThreshold);

      if (result.success) {
        if (result.status === 'duplicate') {
          results.duplicates++;
        } else {
          results.discoveries++;
        }
      } else {
        results.errors++;
      }

      // Track the user
      await upsertHNUser(user, companyInfo, {
        storyId: story.id,
        storyTitle: story.title || 'HN Story',
      });
      results.usersTracked++;

    } catch (error) {
      console.error(`Error processing user ${username}:`, error);
      results.errors++;
    }
  }

  return results;
}

/**
 * Build a descriptive trigger text for the discovery
 */
function buildTriggerText(
  username: string,
  companyInfo: HNUserCompanyInfo,
  storyTitle: string,
  commentText: string,
  matchResult: Awaited<ReturnType<typeof matchText>>
): string {
  const parts: string[] = [];

  // User and company context
  const companyPart = companyInfo.companyName
    ? `${companyInfo.companyName} (${companyInfo.companyDomain})`
    : companyInfo.companyDomain;

  parts.push(`HN user "${username}" works at ${companyPart}.`);

  // How we found this
  if (companyInfo.source === 'about_url') {
    parts.push('Company identified from profile URL.');
  } else if (companyInfo.source === 'email_domain') {
    parts.push('Company identified from email address.');
  } else if (companyInfo.source === 'linkedin') {
    parts.push('Company identified from LinkedIn profile.');
  } else if (companyInfo.source === 'github') {
    parts.push('Company identified from GitHub profile.');
  }

  // Social presence
  const socialLinks: string[] = [];
  if (companyInfo.linkedinUrl) socialLinks.push('LinkedIn');
  if (companyInfo.githubUsername) socialLinks.push('GitHub');
  if (companyInfo.twitterHandle) socialLinks.push('Twitter');
  if (socialLinks.length > 0) {
    parts.push(`Has ${socialLinks.join(', ')} presence.`);
  }

  // Thread context
  parts.push(`Commented on: "${storyTitle}"`);

  // Keyword context
  if (matchResult.matches.length > 0) {
    const keywords = matchResult.matches.slice(0, 3).map(m => m.keyword).join(', ');
    parts.push(`Thread matched keywords: ${keywords}`);
  }

  // Comment snippet if available
  if (commentText && commentText.length > 20) {
    const snippet = commentText.slice(0, 150).trim();
    parts.push(`Comment: "${snippet}..."`);
  }

  return parts.join(' ');
}

/**
 * Main HN profile scanning function
 */
export const scanHNProfiles = inngest.createFunction(
  {
    id: 'listener-scan-hn-profiles',
    name: 'Listener: Scan HN User Profiles',
    concurrency: {
      limit: 1, // Only one profile scan at a time
    },
    retries: 2,
  },
  { event: 'listener/scan-hn-profiles' },
  async ({ event, step }) => {
    const {
      teamId,
      maxStoriesPerScan = 20,
      maxUsersPerStory = 100,
      minKeywordScore = 2,
      minKarma = 50,
      minConfidence = 0.5,
      autoPromoteThreshold = 75,
      rescanAfterHours = 168, // 7 days
      enrichWithGitHub = false, // Disabled by default (rate limits)
    } = event.data;

    const scanStartTime = Date.now();

    // Reset metrics for this run
    metrics.reset();

    logger.info('Starting HN profile scan', {
      runId: 'pending',
      maxStoriesPerScan,
      maxUsersPerStory,
      minKarma,
      minConfidence,
    });

    // Start tracking run
    const runId = await step.run('start-run', async () => {
      return await startRun('hn_profile', 'scheduled', {});
    });

    logger.info('HN profile scan run started', { runId, teamId });

    const stats = {
      storiesProcessed: 0,
      usersScanned: 0,
      usersSkippedRecent: 0,
      usersTracked: 0,
      discoveriesCreated: 0,
      duplicatesSkipped: 0,
      errorsCount: 0,
      errorDetails: [] as Array<{ message: string; timestamp: string }>,
    };

    try {
      // Fetch front page and Ask HN stories
      const [frontPage, askHN] = await Promise.all([
        step.run('fetch-front-page', () => fetchFrontPage(50)),
        step.run('fetch-ask-hn', () => fetchAskHN(30)),
      ]);

      const allStories = [...frontPage.items, ...askHN.items];

      // Filter stories by keyword relevance
      const relevantStories: Array<{
        story: HNItem;
        matchResult: Awaited<ReturnType<typeof matchText>>;
      }> = [];

      for (const story of allStories) {
        const text = getItemText(story);
        if (!text || text.length < 20) continue;

        const matchResult = await matchText(text);
        if (matchResult.totalScore >= minKeywordScore) {
          relevantStories.push({ story, matchResult });
        }
      }

      // Sort by relevance and take top stories
      const topStories = relevantStories
        .sort((a, b) => b.matchResult.totalScore - a.matchResult.totalScore)
        .slice(0, maxStoriesPerScan);

      // Process each story
      for (let i = 0; i < topStories.length; i++) {
        const { story, matchResult } = topStories[i];
        stats.storiesProcessed++;

        try {
          // Collect usernames from story and comments
          // Note: step.run serializes return values, so we convert Map to Object
          const { usernames, commentsByUserObj } = await step.run(
            `collect-users-${story.id}`,
            async () => {
              const result = await collectStoryUsernames(story, maxUsersPerStory * 2);
              return {
                usernames: result.usernames,
                commentsByUserObj: Object.fromEntries(result.commentsByUser),
              };
            }
          );
          const commentsByUser = new Map(Object.entries(commentsByUserObj)) as Map<string, HNItem>;

          // Filter out recently scanned users
          // Note: step.run serializes return values, so we convert Set to Array
          const recentlyScannedArray = await step.run(
            `filter-recent-${story.id}`,
            async () => {
              const recentSet = await getRecentlyScannedUsers(usernames, rescanAfterHours);
              return Array.from(recentSet);
            }
          );
          const recentlyScanned = new Set(recentlyScannedArray);

          const usersToScan = usernames
            .filter((u: string) => !recentlyScanned.has(u))
            .slice(0, maxUsersPerStory);

          stats.usersSkippedRecent += recentlyScanned.size;

          if (usersToScan.length === 0) {
            continue;
          }

          // Process users in batches
          const batchSize = 20;
          for (let j = 0; j < usersToScan.length; j += batchSize) {
            const batch = usersToScan.slice(j, j + batchSize);

            const batchResults = await step.run(
              `process-batch-${story.id}-${j}`,
              () => processUserBatch(
                batch,
                story,
                matchResult,
                commentsByUser,
                teamId,
                { minKarma, minConfidence, autoPromoteThreshold, enrichWithGitHub }
              )
            );

            stats.usersScanned += batchResults.processed;
            stats.discoveriesCreated += batchResults.discoveries;
            stats.duplicatesSkipped += batchResults.duplicates;
            stats.errorsCount += batchResults.errors;
            stats.usersTracked += batchResults.usersTracked;
          }

          // Rate limit between stories
          await step.sleep('rate-limit', '1s');

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error(`Error processing story ${story.id}:`, error);
          stats.errorDetails.push({
            message: `Story ${story.id}: ${errorMessage}`,
            timestamp: new Date().toISOString(),
          });
          stats.errorsCount++;
        }
      }

      // Complete run successfully
      await step.run('complete-run', async () => {
        await completeRun(runId, 'completed', {
          itemsScanned: stats.usersScanned,
          discoveriesCreated: stats.discoveriesCreated,
          duplicatesSkipped: stats.duplicatesSkipped,
          autoPromoted: 0, // Tracked separately
          errorsCount: stats.errorsCount,
          errorDetails: stats.errorDetails,
          cursorData: {
            lastScanAt: new Date().toISOString(),
            storiesProcessed: stats.storiesProcessed,
            usersTracked: stats.usersTracked,
            usersSkippedRecent: stats.usersSkippedRecent,
          },
        });
      });

      // Log final stats
      const scanDuration = Date.now() - scanStartTime;
      const cacheStats = getCacheStats();
      const metricsSummary = metrics.getSummary();

      logger.info('HN profile scan completed', {
        runId,
        durationMs: scanDuration,
        ...stats,
        cacheStats,
        metrics: metricsSummary,
      });

      // Clear caches after run to free memory
      clearCaches();

      return {
        status: 'completed',
        runId,
        ...stats,
        durationMs: scanDuration,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      stats.errorDetails.push({ message: errorMessage, timestamp: new Date().toISOString() });

      logger.error('HN profile scan failed', error, {
        runId,
        durationMs: Date.now() - scanStartTime,
        ...stats,
      });

      await step.run('fail-run', async () => {
        await addRunError(runId, errorMessage);
        await completeRun(runId, 'failed', {
          itemsScanned: stats.usersScanned,
          discoveriesCreated: stats.discoveriesCreated,
          duplicatesSkipped: stats.duplicatesSkipped,
          autoPromoted: 0,
          errorsCount: stats.errorsCount + 1,
          errorDetails: stats.errorDetails,
        });
      });

      // Clear caches even on failure
      clearCaches();

      throw error;
    }
  }
);

/**
 * Scheduled profile scan - runs daily at 6am UTC
 */
export const scheduledHNProfileScan = inngest.createFunction(
  {
    id: 'listener-scan-hn-profiles-scheduled',
    name: 'Listener: Scheduled HN Profile Scan',
    concurrency: { limit: 1 },
    retries: 1,
  },
  { cron: '0 6 * * *' }, // Daily at 6am UTC
  async ({ step }) => {
    // Get the default team ID
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const adminClient = createAdminClient();

    const { data: team } = await adminClient
      .from('teams')
      .select('id')
      .limit(1)
      .single();

    if (!team) {
      console.log('No team found for scheduled profile scan');
      return { status: 'skipped', reason: 'no_team' };
    }

    // Trigger the profile scan
    await step.sendEvent('trigger-profile-scan', {
      name: 'listener/scan-hn-profiles',
      data: {
        teamId: team.id,
        maxStoriesPerScan: 20,
        maxUsersPerStory: 100,
        minKeywordScore: 2,
        minKarma: 50,
        minConfidence: 0.5,
        autoPromoteThreshold: 75,
        rescanAfterHours: 168,
        enrichWithGitHub: false,
      },
    });

    return { status: 'triggered', teamId: team.id };
  }
);

export const functions = [scanHNProfiles, scheduledHNProfileScan];
