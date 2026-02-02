import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/prospects/review - Get prospects for tinder-style review
 *
 * Query params:
 * - filter: 'unreviewed' (default) | 'all' | 'good_fit' | 'not_fit'
 * - limit: number (default 50)
 * - offset: number (default 0)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get user's team (use admin client to bypass RLS)
  const { data: membership } = await adminClient
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const filter = searchParams.get('filter') || 'unreviewed';
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');

  // Build query
  let query = adminClient
    .from('prospects')
    .select(`
      id,
      company_name,
      company_domain,
      company_industry,
      company_description,
      company_size,
      funding_stage,
      helix_products,
      helix_fit_score,
      helix_fit_reason,
      connection_score,
      connections_count,
      has_warm_intro,
      best_connector,
      connection_context,
      status,
      source,
      reviewed_at,
      user_fit_override,
      prospect_connections (
        target_name,
        target_title,
        connector_name,
        relationship_strength,
        connection_context
      )
    `)
    .eq('team_id', membership.team_id)
    .neq('status', 'not_a_fit');

  // Apply filter
  switch (filter) {
    case 'unreviewed':
      query = query.is('reviewed_at', null);
      break;
    case 'good_fit':
      query = query.eq('user_fit_override', true);
      break;
    case 'not_fit':
      query = query.eq('user_fit_override', false);
      break;
    // 'all' - no additional filter
  }

  // Order by priority score descending (best prospects first)
  query = query
    .order('priority_score', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data: prospects, error } = await query;

  if (error) {
    console.error('Failed to get prospects:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get total counts for progress tracking
  const { count: totalCount } = await adminClient
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', membership.team_id)
    .neq('status', 'not_a_fit');

  const { count: reviewedCount } = await adminClient
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', membership.team_id)
    .neq('status', 'not_a_fit')
    .not('reviewed_at', 'is', null);

  return NextResponse.json({
    prospects: prospects || [],
    pagination: {
      total: totalCount || 0,
      reviewed: reviewedCount || 0,
      unreviewed: (totalCount || 0) - (reviewedCount || 0),
      offset,
      limit,
      hasMore: (prospects?.length || 0) === limit,
    },
  });
}
