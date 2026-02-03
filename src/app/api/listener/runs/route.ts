import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { success, errors, withErrorHandling } from '@/lib/api/response';
import { inngest } from '@/lib/inngest';
import { listRuns, getRunStats } from '@/lib/listener';
import { ensureKeywordsSeeded, getListenerStatus } from '@/lib/listener/auto-seed';

/**
 * GET /api/listener/runs
 * List listener run history
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return errors.unauthorized();
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const sourceType = searchParams.get('source_type');
    const status = searchParams.get('status') as 'running' | 'completed' | 'failed' | 'partial' | null;
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    const includeStats = searchParams.get('include_stats') === 'true';
    const includeStatus = searchParams.get('include_status') === 'true';

    // Fetch runs
    const result = await listRuns({
      sourceType: sourceType || undefined,
      status: status || undefined,
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    });

    // Optionally include stats
    let stats = null;
    if (includeStats) {
      stats = await getRunStats();
    }

    // Optionally include listener status (keywords seeded, first run, etc)
    let listenerStatus = null;
    if (includeStatus) {
      listenerStatus = await getListenerStatus();
    }

    return success({
      runs: result.runs,
      total: result.total,
      stats,
      listenerStatus,
    });
  });
}

/**
 * POST /api/listener/runs
 * Manually trigger a listener scan
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return errors.unauthorized();
    }

    // Get user's team
    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return errors.notFound('Team membership');
    }

    const body = await request.json();
    const { source, options } = body as {
      source: 'hn' | 'rss' | 'hn_profiles';
      options?: {
        scanType?: 'front_page' | 'ask_hn' | 'show_hn' | 'all';
        maxItems?: number;
        includeComments?: boolean;
        feedUrls?: string[];
        maxArticles?: number;
        maxAgeHours?: number;
      };
    };

    if (!source || !['hn', 'rss', 'hn_profiles'].includes(source)) {
      return errors.badRequest('Invalid source. Must be "hn", "hn_profiles", or "rss"');
    }

    // Auto-seed keywords if not already seeded
    // This ensures the listener can find matches on first run
    console.log('[Listener] Ensuring keywords are seeded before scan...');
    await ensureKeywordsSeeded();

    // Trigger the appropriate scan
    let eventId: string;

    if (source === 'hn') {
      const { ids } = await inngest.send({
        name: 'listener/scan-hn',
        data: {
          teamId: membership.team_id,
          scanType: options?.scanType || 'all',
          maxItems: options?.maxItems || 100,
          includeComments: options?.includeComments ?? true, // Default to true now
        },
      });
      eventId = ids[0];
    } else if (source === 'hn_profiles') {
      // Trigger dedicated profile scanner
      console.log('[Listener] Triggering HN profile scan for team:', membership.team_id);
      const { ids } = await inngest.send({
        name: 'listener/scan-hn-profiles',
        data: {
          teamId: membership.team_id,
          maxStoriesPerScan: 20,
          maxUsersPerStory: 100,
          minKeywordScore: 2,
          minKarma: 50,
          minConfidence: 0.5,
          autoPromoteThreshold: 75,
        },
      });
      eventId = ids[0];
      console.log('[Listener] HN profile scan event sent, ID:', eventId);
    } else {
      const { ids } = await inngest.send({
        name: 'listener/scan-rss',
        data: {
          teamId: membership.team_id,
          feedUrls: options?.feedUrls,
          maxArticles: options?.maxArticles || 100,
          maxAgeHours: options?.maxAgeHours || 48,
        },
      });
      eventId = ids[0];
    }

    console.log(`[Listener] ${source.toUpperCase()} scan triggered successfully, event ID: ${eventId}`);

    return success({
      message: `${source.toUpperCase()} scan triggered`,
      eventId,
      teamId: membership.team_id,
      source,
      triggeredAt: new Date().toISOString(),
    });
  });
}
