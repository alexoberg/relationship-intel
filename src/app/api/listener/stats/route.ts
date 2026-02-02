import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { success, errors, withErrorHandling } from '@/lib/api/response';
import { getDiscoveryStats, getRunStats, getKeywordStats } from '@/lib/listener';

/**
 * GET /api/listener/stats
 * Get aggregated listener statistics
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return errors.unauthorized();
    }

    // Fetch all stats in parallel
    const [discoveryStats, runStats, keywordStats] = await Promise.all([
      getDiscoveryStats(),
      getRunStats(),
      getKeywordStats(),
    ]);

    return success({
      discoveries: discoveryStats,
      runs: runStats,
      keywords: keywordStats,
      lastUpdated: new Date().toISOString(),
    });
  });
}
