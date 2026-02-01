import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest';
import { testSwarmIngestion } from '@/lib/swarm-ingestion';
import { success, errors, withErrorHandling } from '@/lib/api';

interface IngestStatusData {
  swarm: {
    connected: boolean;
    totalProfiles?: number;
    error?: string;
  };
  stats: {
    totalContacts: number;
    swarmContacts: number;
  };
}

interface IngestTriggerData {
  message: string;
  teamId: string;
}

// GET /api/contacts/ingest - Check ingestion status / test connection
export async function GET() {
  return withErrorHandling(async () => {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return errors.unauthorized();
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
      return errors.notFound('Team');
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

    return success<IngestStatusData>({
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
  });
}

// POST /api/contacts/ingest - Trigger contact ingestion
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return errors.unauthorized();
    }

    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id, role')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return errors.notFound('Team');
    }

    const body = await request.json().catch(() => ({}));
    const { source = 'swarm', maxContacts } = body;

    if (source === 'swarm') {
      // Trigger Swarm ingestion via Inngest
      await inngest.send({
        name: 'contacts/ingest-swarm',
        data: {
          teamId: membership.team_id,
          ownerId: user.id,
          maxContacts: maxContacts || 5000,
        },
      });

      return success<IngestTriggerData>({
        message: 'Swarm ingestion started',
        teamId: membership.team_id,
      });
    }

    return errors.badRequest('Invalid source');
  });
}
