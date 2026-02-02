import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import LISTENER_KEYWORDS from '@/data/listener-keywords-seed';

/**
 * POST /api/listener/keywords/seed - Seed listener keywords from config
 *
 * This populates the listener_keywords table with comprehensive keywords
 * for discovering Helix prospects via HN, news, etc.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminClient();

  // Get current keyword count
  const { count: existingCount } = await adminClient
    .from('listener_keywords')
    .select('*', { count: 'exact', head: true });

  // Upsert all keywords
  const toInsert = LISTENER_KEYWORDS.map(kw => ({
    keyword: kw.keyword.toLowerCase().trim(),
    category: kw.category,
    weight: kw.weight,
    helix_products: kw.helixProducts,
    is_active: true,
  }));

  const { data, error } = await adminClient
    .from('listener_keywords')
    .upsert(toInsert, {
      onConflict: 'keyword',
      ignoreDuplicates: false, // Update existing keywords
    })
    .select('id');

  if (error) {
    console.error('Failed to seed keywords:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get new count
  const { count: newCount } = await adminClient
    .from('listener_keywords')
    .select('*', { count: 'exact', head: true });

  return NextResponse.json({
    success: true,
    message: 'Keywords seeded successfully',
    stats: {
      totalInSeed: LISTENER_KEYWORDS.length,
      previousCount: existingCount || 0,
      newCount: newCount || 0,
      upserted: data?.length || 0,
    },
  });
}

/**
 * GET /api/listener/keywords/seed - Get keyword stats
 */
export async function GET() {
  const adminClient = createAdminClient();

  const { data: keywords, error } = await adminClient
    .from('listener_keywords')
    .select('category, weight, is_active, helix_products');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Calculate stats
  const stats = {
    total: keywords?.length || 0,
    active: keywords?.filter(k => k.is_active).length || 0,
    byCategory: {} as Record<string, number>,
    byProduct: {} as Record<string, number>,
    seedAvailable: LISTENER_KEYWORDS.length,
  };

  for (const kw of keywords || []) {
    // By category
    stats.byCategory[kw.category] = (stats.byCategory[kw.category] || 0) + 1;

    // By product
    for (const product of kw.helix_products || []) {
      stats.byProduct[product] = (stats.byProduct[product] || 0) + 1;
    }
  }

  return NextResponse.json({ stats });
}
