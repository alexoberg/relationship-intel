import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/prospects/export - Export prospects as CSV
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get user's team
  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 });
  }

  // Get filter params
  const searchParams = request.nextUrl.searchParams;
  const industry = searchParams.get('industry');
  const minPriority = searchParams.get('min_priority');
  const hasWarmIntro = searchParams.get('has_warm_intro');

  // Build query
  const adminClient = createAdminClient();
  let query = adminClient
    .from('prospects')
    .select(`
      company_name,
      company_domain,
      company_industry,
      funding_stage,
      description,
      helix_fit_score,
      helix_fit_reason,
      priority_score,
      connection_score,
      has_warm_intro,
      best_connector,
      connections_count,
      status
    `)
    .eq('team_id', membership.team_id)
    .order('priority_score', { ascending: false });

  if (industry) query = query.eq('company_industry', industry);
  if (minPriority) query = query.gte('priority_score', parseInt(minPriority));
  if (hasWarmIntro === 'true') query = query.eq('has_warm_intro', true);

  const { data: prospects, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Build CSV
  const headers = [
    'Company Name',
    'Domain',
    'Industry',
    'Funding Stage',
    'Description',
    'Helix Fit Score',
    'Why Helix',
    'Priority Score',
    'Connection Score',
    'Has Warm Intro',
    'Best Connector',
    'Connections Count',
    'Status',
  ];

  const rows = prospects?.map(p => [
    p.company_name || '',
    p.company_domain || '',
    p.company_industry || '',
    p.funding_stage || '',
    (p.description || '').replace(/"/g, '""'),
    p.helix_fit_score || 0,
    (p.helix_fit_reason || '').replace(/"/g, '""'),
    p.priority_score || 0,
    p.connection_score || 0,
    p.has_warm_intro ? 'Yes' : 'No',
    p.best_connector || '',
    p.connections_count || 0,
    p.status || 'new',
  ]) || [];

  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => 
      typeof cell === 'string' && (cell.includes(',') || cell.includes('"') || cell.includes('\n'))
        ? `"${cell}"`
        : cell
    ).join(','))
  ].join('\n');

  // Return as downloadable CSV
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="helix-prospects-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  });
}
