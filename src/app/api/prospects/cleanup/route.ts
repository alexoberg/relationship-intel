import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest/client';

/**
 * POST /api/prospects/cleanup - Trigger prospect cleanup job
 *
 * Query params:
 * - action: 'cleanup' (default) | 'verify-domains'
 *
 * Cleans up:
 * - Dead/defunct companies
 * - Prospects missing helix_fit_reason or helix_products
 * - Orphaned connections
 * - Incorrect connection counts
 *
 * verify-domains:
 * - Checks if domains actually resolve
 * - Marks non-existent domains as not_a_fit
 * - Updates redirected domains
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get user's team
  const { data: membership } = await adminClient
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 });
  }

  const searchParams = request.nextUrl.searchParams;
  const action = searchParams.get('action') || 'cleanup';

  if (action === 'verify-domains') {
    // Trigger domain verification job
    await inngest.send({
      name: 'prospects/verify-domains',
      data: {
        teamId: membership.team_id,
        batchSize: 100, // Check 100 domains per run
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Domain verification job started. Check Inngest dashboard for progress.',
    });
  }

  // Default: trigger the cleanup job
  await inngest.send({
    name: 'prospects/cleanup',
    data: {
      teamId: membership.team_id,
    },
  });

  return NextResponse.json({
    success: true,
    message: 'Cleanup job started. Check Inngest dashboard for progress.',
  });
}

/**
 * GET /api/prospects/cleanup - Get current data quality stats
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get user's team
  const { data: membership } = await adminClient
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 });
  }

  const teamId = membership.team_id;

  // Get stats
  const [
    { count: totalActive },
    { count: withReason },
    { count: withProducts },
    { count: withConnections },
    { count: totalConnections },
  ] = await Promise.all([
    adminClient
      .from('prospects')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .neq('status', 'not_a_fit'),
    adminClient
      .from('prospects')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .neq('status', 'not_a_fit')
      .not('helix_fit_reason', 'is', null),
    adminClient
      .from('prospects')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .neq('status', 'not_a_fit')
      .not('helix_products', 'eq', '{}'),
    adminClient
      .from('prospects')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .neq('status', 'not_a_fit')
      .gt('connections_count', 0),
    adminClient
      .from('prospect_connections')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId),
  ]);

  return NextResponse.json({
    totalActive: totalActive || 0,
    withFitReason: withReason || 0,
    withoutFitReason: (totalActive || 0) - (withReason || 0),
    withProducts: withProducts || 0,
    withConnections: withConnections || 0,
    totalConnections: totalConnections || 0,
  });
}
