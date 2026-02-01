import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { searchByCompany, findConnectionPaths } from '@/lib/swarm';

// GET /api/prospects/test-sync - Test Swarm sync on a single prospect
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const prospectId = searchParams.get('id');
  const domain = searchParams.get('domain');

  const supabase = createAdminClient();

  // If domain provided, test search directly
  if (domain) {
    console.log(`[Test] Searching Swarm for domain: ${domain}`);
    const paths = await findConnectionPaths(domain);

    return NextResponse.json({
      domain,
      paths_found: paths.length,
      paths: paths.slice(0, 5).map(p => ({
        target: p.target_person.full_name,
        title: p.target_person.current_title,
        connector: p.connector,
        strength: p.strength,
        context: p.shared_context,
      })),
    });
  }

  // Get a prospect to test
  let prospect;
  if (prospectId) {
    const { data } = await supabase
      .from('prospects')
      .select('*')
      .eq('id', prospectId)
      .single();
    prospect = data;
  } else {
    // Get first unsynced prospect
    const { data } = await supabase
      .from('prospects')
      .select('*')
      .is('swarm_synced_at', null)
      .limit(1)
      .single();
    prospect = data;
  }

  if (!prospect) {
    return NextResponse.json({ error: 'No prospect found' }, { status: 404 });
  }

  console.log(`[Test] Testing sync for: ${prospect.name} (${prospect.company_domain})`);

  // Search Swarm
  const paths = await findConnectionPaths(prospect.company_domain);

  // Calculate score
  let connectionScore = 0;
  if (paths.length > 0) {
    const avgStrength = paths.reduce((sum, p) => sum + p.strength, 0) / paths.length;
    const pathBonus = Math.min(paths.length * 5, 30);
    connectionScore = Math.round(avgStrength * 70 + pathBonus);
  }

  // Build best path
  const bestPath = paths[0] ? {
    connector: paths[0].connector,
    target: paths[0].target_person.full_name,
    target_title: paths[0].target_person.current_title,
    type: paths[0].connection_type,
    strength: paths[0].strength,
    context: paths[0].shared_context,
  } : null;

  // Update prospect
  const { error: updateError } = await supabase
    .from('prospects')
    .update({
      connection_score: connectionScore,
      best_connection_path: bestPath,
      all_connection_paths: paths.slice(0, 10).map(p => ({
        connector: p.connector,
        target: p.target_person.full_name,
        target_title: p.target_person.current_title,
        type: p.connection_type,
        strength: p.strength,
        context: p.shared_context,
      })),
      swarm_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', prospect.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    prospect: {
      id: prospect.id,
      name: prospect.name,
      domain: prospect.company_domain,
    },
    swarm_result: {
      paths_found: paths.length,
      connection_score: connectionScore,
      best_path: bestPath,
      all_paths: paths.slice(0, 5).map(p => ({
        target: p.target_person.full_name,
        title: p.target_person.current_title,
        connector: p.connector,
        strength: p.strength,
      })),
    },
  });
}
