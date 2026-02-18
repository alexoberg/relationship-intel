import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findConnectionsToProspect, calculateConnectionScore } from '@/lib/prospect-matching';

/**
 * GET /api/prospects/test-sync
 * Tests internal prospect-to-contact matching for a single prospect.
 * Previously called The Swarm API — now uses internal contact DB only.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const prospectId = searchParams.get('id');
  const domain = searchParams.get('domain');

  const supabase = createAdminClient();

  // If domain provided directly, find the team from query param
  const teamId = searchParams.get('team_id');
  if (domain && teamId) {
    const connections = await findConnectionsToProspect(teamId, domain);
    const score = calculateConnectionScore(connections);

    return NextResponse.json({
      domain,
      paths_found: connections.length,
      connection_score: score,
      paths: connections.slice(0, 5).map(c => ({
        target: c.contact_name,
        title: c.job_title,
        connector: c.connector_name,
        strength: c.connection_strength,
        is_current_employee: c.is_current_employee,
      })),
    });
  }

  // Get a prospect to test
  let prospect: { id: string; company_name?: string; name?: string; company_domain: string; team_id: string } | null = null;
  if (prospectId) {
    const { data } = await supabase
      .from('prospects')
      .select('id, company_name, name, company_domain, team_id')
      .eq('id', prospectId)
      .single();
    prospect = data;
  } else {
    const { data } = await supabase
      .from('prospects')
      .select('id, company_name, name, company_domain, team_id')
      .is('matched_at', null)
      .limit(1)
      .single();
    prospect = data;
  }

  if (!prospect) {
    return NextResponse.json({ error: 'No prospect found' }, { status: 404 });
  }

  const companyName = prospect.company_name || prospect.name;
  console.log(`[Test] Running internal match for: ${companyName} (${prospect.company_domain})`);

  const connections = await findConnectionsToProspect(prospect.team_id, prospect.company_domain);
  const connectionScore = calculateConnectionScore(connections);

  // Sort best first
  connections.sort((a, b) => {
    if (a.is_current_employee !== b.is_current_employee) return a.is_current_employee ? -1 : 1;
    return b.connection_strength - a.connection_strength;
  });

  const bestPath = connections[0] ? {
    connector: connections[0].connector_name,
    target: connections[0].contact_name,
    target_title: connections[0].job_title,
    strength: connections[0].connection_strength,
    is_current: connections[0].is_current_employee,
  } : null;

  // Update prospect with results
  await supabase
    .from('prospects')
    .update({
      connection_score: connectionScore,
      best_connection_path: bestPath,
      all_connection_paths: connections.slice(0, 10).map(c => ({
        connector: c.connector_name,
        target: c.contact_name,
        target_title: c.job_title,
        strength: c.connection_strength,
        is_current: c.is_current_employee,
      })),
      matched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', prospect.id);

  return NextResponse.json({
    prospect: {
      id: prospect.id,
      name: companyName,
      domain: prospect.company_domain,
    },
    internal_match_result: {
      paths_found: connections.length,
      connection_score: connectionScore,
      best_path: bestPath,
      all_paths: connections.slice(0, 5).map(c => ({
        target: c.contact_name,
        title: c.job_title,
        connector: c.connector_name,
        strength: c.connection_strength,
        is_current: c.is_current_employee,
      })),
    },
  });
}
