import { NextRequest } from 'next/server';
import { success, errors } from '@/lib/api/response';
import { inngest } from '@/lib/inngest';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasSuccessfulRun, ensureKeywordsSeeded } from '@/lib/listener/auto-seed';

// Vercel cron secret for authentication
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * GET /api/cron/listener-hn
 * Triggered by Vercel cron to scan Hacker News
 * Schedule: Every hour (0 * * * *)
 *
 * NOTE: Cron will only run after the first successful manual run.
 * This ensures keywords are seeded and the system is properly initialized.
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
    // Check if there's been at least one successful run
    // This ensures keywords are seeded and the system is initialized
    const hasRun = await hasSuccessfulRun();
    if (!hasRun) {
      console.log('[Cron] Skipping HN scan - no successful run yet. Trigger manually first.');
      return success({
        message: 'Skipped - trigger first scan manually via dashboard',
        reason: 'no_successful_run',
        timestamp: new Date().toISOString(),
      });
    }

    // Ensure keywords are seeded (should already be from first run)
    await ensureKeywordsSeeded();

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

    // Trigger HN scan with comment processing enabled
    // This will scan commenter profiles to extract their companies
    const { ids } = await inngest.send({
      name: 'listener/scan-hn',
      data: {
        teamId: team.id,
        scanType: 'all',
        maxItems: 100,
        includeComments: true,
        minScoreForComments: 3, // Only scan comments on high-relevance stories
      },
    });

    console.log(`[Cron] Triggered HN scan, event ID: ${ids[0]}`);

    return success({
      message: 'HN scan triggered',
      eventId: ids[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Failed to trigger HN scan:', error);
    return errors.internal(
      error instanceof Error ? error.message : 'Failed to trigger HN scan'
    );
  }
}
