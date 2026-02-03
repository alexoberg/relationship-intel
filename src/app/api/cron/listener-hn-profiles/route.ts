import { NextRequest } from 'next/server';
import { success, errors } from '@/lib/api/response';
import { inngest } from '@/lib/inngest';
import { createAdminClient } from '@/lib/supabase/admin';

// Vercel cron secret for authentication
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * GET /api/cron/listener-hn-profiles
 * Triggered by Vercel cron to scan HN user profiles
 * Schedule: Daily at 6am UTC (0 6 * * *)
 *
 * This dedicated profile scan extracts company info from HN users
 * who post/comment in relevant threads, then adds their companies
 * as prospects.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret if set
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return errors.unauthorized();
    }
  }

  try {
    // Get the first team
    const supabase = createAdminClient();
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .limit(1)
      .single();

    if (!team) {
      return errors.notFound('No teams found');
    }

    // Trigger HN profile scan
    const { ids } = await inngest.send({
      name: 'listener/scan-hn-profiles',
      data: {
        teamId: team.id,
        maxStoriesPerScan: 20,
        maxUsersPerStory: 100,
        minKeywordScore: 2,
        minKarma: 50,
        minConfidence: 0.5,
        autoPromoteThreshold: 75,
        rescanAfterHours: 168, // 7 days
        enrichWithGitHub: false,
      },
    });

    console.log(`[Cron] Triggered HN profile scan, event ID: ${ids[0]}`);

    return success({
      message: 'HN profile scan triggered',
      eventId: ids[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Failed to trigger HN profile scan:', error);
    return errors.internal(
      error instanceof Error ? error.message : 'Failed to trigger HN profile scan'
    );
  }
}

/**
 * POST /api/cron/listener-hn-profiles
 * Manual trigger with custom options
 */
export async function POST(request: NextRequest) {
  // Verify cron secret if set
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return errors.unauthorized();
    }
  }

  try {
    const body = await request.json().catch(() => ({}));

    // Get the first team or use provided teamId
    const supabase = createAdminClient();
    let teamId = body.teamId;

    if (!teamId) {
      const { data: team } = await supabase
        .from('teams')
        .select('id')
        .limit(1)
        .single();

      if (!team) {
        return errors.notFound('No teams found');
      }
      teamId = team.id;
    }

    // Trigger HN profile scan with custom options
    const { ids } = await inngest.send({
      name: 'listener/scan-hn-profiles',
      data: {
        teamId,
        maxStoriesPerScan: body.maxStoriesPerScan ?? 20,
        maxUsersPerStory: body.maxUsersPerStory ?? 100,
        minKeywordScore: body.minKeywordScore ?? 2,
        minKarma: body.minKarma ?? 50,
        minConfidence: body.minConfidence ?? 0.5,
        autoPromoteThreshold: body.autoPromoteThreshold ?? 75,
        rescanAfterHours: body.rescanAfterHours ?? 168,
        enrichWithGitHub: body.enrichWithGitHub ?? false,
      },
    });

    console.log(`[Cron] Triggered manual HN profile scan, event ID: ${ids[0]}`);

    return success({
      message: 'HN profile scan triggered (manual)',
      eventId: ids[0],
      timestamp: new Date().toISOString(),
      options: {
        teamId,
        maxStoriesPerScan: body.maxStoriesPerScan ?? 20,
        maxUsersPerStory: body.maxUsersPerStory ?? 100,
      },
    });
  } catch (error) {
    console.error('[Cron] Failed to trigger manual HN profile scan:', error);
    return errors.internal(
      error instanceof Error ? error.message : 'Failed to trigger HN profile scan'
    );
  }
}
