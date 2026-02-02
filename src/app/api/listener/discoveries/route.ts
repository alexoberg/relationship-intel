import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { success, errors, withErrorHandling } from '@/lib/api/response';
import {
  listDiscoveries,
  getDiscoveryStats,
  ListenerDiscoveryStatus,
} from '@/lib/listener';

/**
 * GET /api/listener/discoveries
 * List discoveries with optional filters
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
    const status = searchParams.get('status') as ListenerDiscoveryStatus | null;
    const sourceType = searchParams.get('source_type');
    const minConfidence = searchParams.get('min_confidence');
    const limit = searchParams.get('limit');
    const offset = searchParams.get('offset');
    const orderBy = searchParams.get('order_by') as 'confidence_score' | 'discovered_at' | null;
    const orderDir = searchParams.get('order_dir') as 'asc' | 'desc' | null;
    const includeStats = searchParams.get('include_stats') === 'true';

    // Fetch discoveries
    const result = await listDiscoveries({
      status: status || undefined,
      sourceType: sourceType || undefined,
      minConfidence: minConfidence ? parseInt(minConfidence, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      orderBy: orderBy || 'discovered_at',
      orderDir: orderDir || 'desc',
    });

    // Optionally include stats
    let stats = null;
    if (includeStats) {
      stats = await getDiscoveryStats();
    }

    return success({
      discoveries: result.discoveries,
      total: result.total,
      stats,
    });
  });
}
