import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest';
import { testSwarmIngestion } from '@/lib/swarm-ingestion';

// GET /api/contacts/ingest - Check ingestion status / test connection
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Test Swarm connection
  const swarmTest = await testSwarmIngestion();

  // Get current stats
  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 });
  }

  const { count: contactCount } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', membership.team_id);

  const { count: swarmContactCount } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', membership.team_id)
    .eq('source', 'swarm');

  return NextResponse.json({
    swarm: {
      connected: swarmTest.connected,
      totalProfiles: swarmTest.totalProfiles,
      error: swarmTest.error,
    },
    stats: {
      totalContacts: contactCount || 0,
      swarmContacts: swarmContactCount || 0,
    },
  });
}

// POST /api/contacts/ingest - Trigger contact ingestion
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const { source = 'swarm', maxContacts } = body;

  if (source === 'swarm') {
    // Trigger Swarm ingestion via Inngest
    await inngest.send({
      name: 'contacts/ingest-swarm',
      data: {
        teamId: membership.team_id,
        ownerId: user.id, // Contacts will be owned by the triggering user
        maxContacts: maxContacts || 5000,
      },
    });

    return NextResponse.json({
      message: 'Swarm ingestion started',
      teamId: membership.team_id,
    });
  }

  return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
}
