import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { inngest } from '@/lib/inngest';
import seedData from '@/data/helix-prospects-seed.json';

// GET /api/prospects - List prospects for team
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

  // Get prospects with optional filters
  const searchParams = request.nextUrl.searchParams;
  const status = searchParams.get('status');
  const minScore = searchParams.get('min_score');
  const hasWarmIntro = searchParams.get('has_warm_intro');

  let query = supabase
    .from('prospects')
    .select(`
      *,
      prospect_connections (
        target_name,
        target_title,
        target_email,
        connector_name,
        connection_strength,
        shared_context
      )
    `)
    .eq('team_id', membership.team_id)
    .order('priority_score', { ascending: false });

  if (status) query = query.eq('status', status);
  if (minScore) query = query.gte('priority_score', parseInt(minScore));
  if (hasWarmIntro === 'true') query = query.eq('has_warm_intro', true);

  const { data, error } = await query.limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ prospects: data });
}

// Helper: Get or create team for user
async function getOrCreateTeam(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  // Check for existing membership
  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)
    .single();

  if (membership) {
    return membership.team_id;
  }

  // No team - create one using admin client
  const adminClient = createAdminClient();
  
  // Create team
  const { data: team, error: teamError } = await adminClient
    .from('teams')
    .insert({ name: 'My Team', created_by: userId })
    .select()
    .single();

  if (teamError) {
    console.error('Failed to create team:', teamError);
    return null;
  }

  // Add user as admin
  const { error: memberError } = await adminClient
    .from('team_members')
    .insert({ team_id: team.id, user_id: userId, role: 'admin' });

  if (memberError) {
    console.error('Failed to add team member:', memberError);
    return null;
  }

  return team.id;
}

// POST /api/prospects - Import prospects or trigger sync
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const teamId = await getOrCreateTeam(supabase, user.id);
  if (!teamId) {
    return NextResponse.json({ error: 'Failed to get or create team' }, { status: 500 });
  }

  const body = await request.json();
  const { action, prospects: customProspects, domain, companyName } = body;

  console.log('POST /api/prospects', { action, domain, companyName });

  // Action: add single prospect by name and domain
  if (action === 'add-by-domain' && domain && companyName) {
    const adminClient = createAdminClient();

    // Normalize domain (remove protocol, www, trailing slash)
    const normalizedDomain = domain
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .trim();

    console.log('Normalized domain:', normalizedDomain);

    // Basic validation
    if (!normalizedDomain || !normalizedDomain.includes('.')) {
      console.log('Domain validation failed:', { normalizedDomain, hasDot: normalizedDomain?.includes('.') });
      return NextResponse.json({ error: 'Invalid domain format' }, { status: 400 });
    }

    if (!companyName.trim()) {
      return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
    }

    // Check if prospect already exists
    const { data: existing } = await adminClient
      .from('prospects')
      .select('id, company_name, company_domain')
      .eq('team_id', teamId)
      .eq('company_domain', normalizedDomain)
      .single();

    if (existing) {
      return NextResponse.json({
        error: 'Prospect already exists',
        prospect: existing,
      }, { status: 409 });
    }

    const { data: prospect, error } = await adminClient
      .from('prospects')
      .insert({
        team_id: teamId,
        company_name: companyName.trim(),
        company_domain: normalizedDomain,
        status: 'new',
        source: 'manual',
        helix_fit_score: 50, // Default score until enriched
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create prospect:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Trigger the enrichment pipeline to populate Helix fit and connections
    await inngest.send({
      name: 'prospects/run-pipeline',
      data: { prospectId: prospect.id },
    });

    return NextResponse.json({
      message: 'Prospect added successfully. Enrichment running in background.',
      prospect,
      enriching: true,
    });
  }

  // Action: import seed data (synchronous for reliability)
  if (action === 'import-seed') {
    const adminClient = createAdminClient();
    const inserted: string[] = [];
    const errors: string[] = [];

    for (const prospect of seedData.prospects) {
      try {
        const { data, error } = await adminClient
          .from('prospects')
          .upsert({
            team_id: teamId,
            name: prospect.company_name,  // DB uses 'name' not 'company_name'
            company_domain: prospect.company_domain,
          }, {
            onConflict: 'team_id,company_domain',
          })
          .select()
          .single();

        if (error) {
          errors.push(`${prospect.company_domain}: ${error.message}`);
        } else if (data) {
          inserted.push(data.id);
        }
      } catch (err) {
        errors.push(`${prospect.company_domain}: ${err}`);
      }
    }

    return NextResponse.json({
      message: 'Import completed',
      imported: inserted.length,
      errors: errors.length,
      errorDetails: errors.slice(0, 5),
    });
  }

  // Action: import custom prospects
  if (action === 'import' && customProspects) {
    await inngest.send({
      name: 'prospects/import',
      data: {
        teamId: teamId,
        prospects: customProspects,
        source: 'manual',
      },
    });

    return NextResponse.json({ 
      message: 'Import started',
      count: customProspects.length,
    });
  }

  // Action: sync all prospects with internal contact matching (no external Swarm API)
  if (action === 'sync-swarm') {
    await inngest.send({
      name: 'prospects/match-connections',
      data: { teamId: teamId },
    });

    return NextResponse.json({
      message: 'Internal contact matching started for all prospects',
      steps: ['match-prospects']
    });
  }

  // Action: run full pipeline on specific prospect
  if (action === 'run-pipeline' && body.prospectId) {
    await inngest.send({
      name: 'prospects/run-pipeline',
      data: { prospectId: body.prospectId },
    });

    return NextResponse.json({ message: 'Pipeline started', prospectId: body.prospectId });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// PATCH /api/prospects - Update prospect (feedback, status)
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { prospectId, status, is_good_fit, feedback_notes } = body;

  if (!prospectId) {
    return NextResponse.json({ error: 'prospectId required' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  
  if (status) updates.status = status;
  if (is_good_fit !== undefined) {
    updates.is_good_fit = is_good_fit;
    updates.feedback_by = user.id;
    updates.feedback_at = new Date().toISOString();
  }
  if (feedback_notes) updates.feedback_notes = feedback_notes;

  const { data, error } = await supabase
    .from('prospects')
    .update(updates)
    .eq('id', prospectId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log the activity
  const adminClient = createAdminClient();
  await adminClient.rpc('log_prospect_activity', {
    p_prospect_id: prospectId,
    p_user_id: user.id,
    p_activity_type: is_good_fit !== undefined ? 'feedback_given' : 'status_change',
    p_activity_data: updates,
    p_notes: feedback_notes,
  });

  return NextResponse.json({ prospect: data });
}
