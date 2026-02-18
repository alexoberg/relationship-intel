import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest';
import { success, errors, withErrorHandling } from '@/lib/api';

interface IngestStatusData {
  stats: {
    totalContacts: number;
    swarmContacts: number;
    gmailContacts: number;
  };
}

interface IngestTriggerData {
  message: string;
  teamId: string;
}

// GET /api/contacts/ingest - Check ingestion status
export async function GET() {
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

    // Contacts originally sourced from Swarm CSV imports (already in DB, no live API calls)
    const { count: swarmContactCount } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', membership.team_id)
      .eq('source', 'swarm');

    const { count: gmailContactCount } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', membership.team_id)
      .eq('source', 'gmail');

    return success<IngestStatusData>({
      stats: {
        totalContacts: contactCount || 0,
        swarmContacts: swarmContactCount || 0,
        gmailContacts: gmailContactCount || 0,
      },
    });
  });
}

// POST /api/contacts/ingest - Trigger contact ingestion (Gmail/Calendar only)
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
    const { source = 'gmail', maxContacts } = body;

    if (source === 'swarm') {
      // Swarm ingestion is disabled — contacts are sourced internally
      return errors.badRequest(
        'Swarm ingestion is disabled. Contacts are sourced from Gmail/Calendar sync. Use source: "gmail" instead.'
      );
    }

    if (source === 'gmail') {
      await inngest.send({
        name: 'sync/background-started',
        data: {
          userId: user.id,
          accessToken: '', // Will be fetched from stored tokens
          maxMessages: maxContacts || 500000,
          triggerEnrichment: true,
        },
      });

      return success<IngestTriggerData>({
        message: 'Gmail sync started',
        teamId: membership.team_id,
      });
    }

    return errors.badRequest('Invalid source. Use source: "gmail".');
  });
}
