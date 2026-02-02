import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { success, errors, withErrorHandling } from '@/lib/api/response';
import { inngest } from '@/lib/inngest';
import { listRuns, getRunStats } from '@/lib/listener';

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

    return success({
      runs: result.runs,
      total: result.total,
      stats,
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
      source: 'hn' | 'rss';
      options?: {
        scanType?: 'front_page' | 'ask_hn' | 'show_hn' | 'all';
        maxItems?: number;
        includeComments?: boolean;
        feedUrls?: string[];
        maxArticles?: number;
        maxAgeHours?: number;
      };
    };

    if (!source || !['hn', 'rss'].includes(source)) {
      return errors.badRequest('Invalid source. Must be "hn" or "rss"');
    }

    // Trigger the appropriate scan
    let eventId: string;

    if (source === 'hn') {
      const { ids } = await inngest.send({
        name: 'listener/scan-hn',
        data: {
          teamId: membership.team_id,
          scanType: options?.scanType || 'all',
          maxItems: options?.maxItems || 100,
          includeComments: options?.includeComments || false,
        },
      });
      eventId = ids[0];
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

    return success({
      message: `${source.toUpperCase()} scan triggered`,
      eventId,
    });
  });
}
