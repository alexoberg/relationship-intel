import { NextRequest } from 'next/server';
import { success, errors } from '@/lib/api/response';
import { inngest } from '@/lib/inngest';
import { createAdminClient } from '@/lib/supabase/admin';

// Vercel cron secret for authentication
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * GET /api/cron/listener-rss
 * Triggered by Vercel cron to scan RSS feeds
 * Schedule: Every 6 hours (0 *\/6 * * *)
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
    // Get the first team (for now, we'll scan for all teams with one run)
    const supabase = createAdminClient();
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .limit(1)
      .single();

    if (!team) {
      return errors.notFound('No teams found');
    }

    // Trigger RSS scan
    const { ids } = await inngest.send({
      name: 'listener/scan-rss',
      data: {
        teamId: team.id,
        maxArticles: 100,
        maxAgeHours: 48,
      },
    });

    console.log(`[Cron] Triggered RSS scan, event ID: ${ids[0]}`);

    return success({
      message: 'RSS scan triggered',
      eventId: ids[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Failed to trigger RSS scan:', error);
    return errors.internal(
      error instanceof Error ? error.message : 'Failed to trigger RSS scan'
    );
  }
}
