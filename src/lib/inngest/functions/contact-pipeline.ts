/**
 * Contact Pipeline - AUTOMATED server-side processing
 * Flow: Swarm Sync → Cleanup → PDL Enrich → Match Prospects
 */

import { inngest } from '../client';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SWARM_API_KEY = process.env.SWARM_API_KEY!;

// ============================================
// 1. SWARM SYNC - Full ingestion from Swarm API
// ============================================
export const syncContacts = inngest.createFunction(
  { 
    id: 'contacts-sync-swarm', 
    name: 'Sync All Contacts from Swarm',
    concurrency: { limit: 1 },
  },
  { event: 'contacts/sync' },
  async ({ event, step }) => {
    const { teamId, ownerId } = event.data;
    
    if (!SWARM_API_KEY) {
      return { error: 'SWARM_API_KEY not configured' };
    }

    // Fetch total count first
    const totalCount = await step.run('get-total-count', async () => {
      const res = await fetch('https://bee.theswarm.com/v2/profiles/network-mapper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': SWARM_API_KEY },
        body: JSON.stringify({ query: { match_all: {} }, size: 1, from: 0 }),
      });
      const data = await res.json();
      return data.total_count || 0;
    });

    console.log(`[Swarm] Starting ingestion of ${totalCount} profiles`);

    // Process in batches
    const BATCH_SIZE = 100;
    let ingested = 0, updated = 0, errors = 0;

    for (let offset = 0; offset < totalCount; offset += BATCH_SIZE) {
      const batchResult = await step.run(`ingest-batch-${offset}`, async () => {
        const res = await fetch('https://bee.theswarm.com/v2/profiles/network-mapper', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': SWARM_API_KEY },
          body: JSON.stringify({ query: { match_all: {} }, size: BATCH_SIZE, from: offset }),
        });

        if (!res.ok) return { error: `API ${res.status}` };
        const data = await res.json();
        
        let batchIngested = 0, batchUpdated = 0, batchErrors = 0;

        for (const item of data.items || []) {
          const p = item.profile;
          const strength = item.connections?.length > 0
            ? Math.max(...item.connections.map((c: any) => c.connection_strength))
            : 0;

          let domain = null;
          if (p.current_company_website) {
            domain = p.current_company_website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
          }

          const contactData = {
            owner_id: ownerId,
            team_id: teamId,
            swarm_profile_id: p.id,
            full_name: p.full_name,
            first_name: p.first_name || p.full_name?.split(' ')[0],
            last_name: p.last_name || p.full_name?.split(' ').slice(1).join(' '),
            email: p.work_email || null,
            linkedin_url: p.linkedin_url || null,
            current_title: p.current_title || null,
            current_company: p.current_company_name || null,
            company_domain: domain,
            source: 'swarm',
            connection_strength: strength,
            swarm_synced_at: new Date().toISOString(),
          };

          try {
            const { data: existing } = await supabase
              .from('contacts')
              .select('id')
              .eq('team_id', teamId)
              .eq('swarm_profile_id', p.id)
              .single();

            if (existing) {
              await supabase.from('contacts').update(contactData).eq('id', existing.id);
              batchUpdated++;
            } else {
              const { error } = await supabase.from('contacts').insert({
                ...contactData,
                enrichment_status: 'pending',
              });
              if (error) batchErrors++;
              else batchIngested++;
            }
          } catch {
            batchErrors++;
          }
        }

        return { ingested: batchIngested, updated: batchUpdated, errors: batchErrors };
      });

      ingested += batchResult.ingested || 0;
      updated += batchResult.updated || 0;
      errors += batchResult.errors || 0;
    }

    // Trigger cleanup after sync
    await step.sendEvent('trigger-cleanup', {
      name: 'contacts/cleanup',
      data: { teamId }
    });

    return { totalCount, ingested, updated, errors };
  }
);

// ============================================
// 2. CLEANUP - Filter junk, dedupe, normalize
// ============================================
export const cleanupContacts = inngest.createFunction(
  { id: 'contacts-cleanup', name: 'Cleanup Contacts' },
  { event: 'contacts/cleanup' },
  async ({ event, step }) => {
    const { teamId } = event.data;

    // Flag generic mailboxes
    const flagged = await step.run('flag-generic', async () => {
      const patterns = ['info@', 'support@', 'contact@', 'hello@', 'admin@', 'sales@', 
                       'help@', 'team@', 'noreply@', 'invoice@', 'notifications@', 'messages+'];
      let count = 0;
      for (const p of patterns) {
        const { count: c } = await supabase
          .from('contacts')
          .update({ is_generic_mailbox: true, enrichment_status: 'skipped' })
          .eq('team_id', teamId)
          .ilike('email', `${p}%`)
          .select('*', { count: 'exact', head: true });
        count += c || 0;
      }
      return count;
    });

    // Extract domains from emails
    await step.run('extract-domains', async () => {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, email')
        .eq('team_id', teamId)
        .is('company_domain', null)
        .not('email', 'is', null)
        .limit(1000);

      for (const c of contacts || []) {
        if (c.email?.includes('@')) {
          const domain = c.email.split('@')[1]?.toLowerCase();
          if (domain && !['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'].includes(domain)) {
            await supabase.from('contacts').update({ company_domain: domain }).eq('id', c.id);
          }
        }
      }
    });

    // Trigger enrichment
    await step.sendEvent('trigger-enrich', {
      name: 'contacts/enrich',
      data: { teamId, batchSize: 50 }
    });

    return { flagged };
  }
);

// ============================================
// 3. PDL ENRICH - Get job history
// ============================================
export const enrichContacts = inngest.createFunction(
  { id: 'contacts-enrich', name: 'Enrich via PDL' },
  { event: 'contacts/enrich' },
  async ({ event, step }) => {
    const { teamId, batchSize = 50 } = event.data;
    const PDL_API_KEY = process.env.PDL_API_KEY;

    if (!PDL_API_KEY) {
      // Skip PDL, go straight to matching
      await step.sendEvent('trigger-match', {
        name: 'prospects/match-connections',
        data: { teamId }
      });
      return { skipped: 'No PDL_API_KEY' };
    }

    const contacts = await step.run('get-queue', async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id, full_name, email, linkedin_url')
        .eq('team_id', teamId)
        .eq('enrichment_status', 'pending')
        .not('linkedin_url', 'is', null)
        .order('connection_strength', { ascending: false })
        .limit(batchSize);
      return data || [];
    });

    if (contacts.length === 0) {
      await step.sendEvent('trigger-match', {
        name: 'prospects/match-connections',
        data: { teamId }
      });
      return { message: 'No contacts to enrich, triggering match' };
    }

    let enriched = 0, failed = 0;

    for (const c of contacts) {
      await step.run(`enrich-${c.id}`, async () => {
        try {
          const params = new URLSearchParams();
          if (c.linkedin_url) params.append('profile', c.linkedin_url);
          else if (c.email) params.append('email', c.email);

          const res = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?${params}`, {
            headers: { 'X-Api-Key': PDL_API_KEY }
          });

          if (res.status === 404) {
            await supabase.from('contacts').update({ enrichment_status: 'skipped' }).eq('id', c.id);
            return;
          }

          const data = await res.json();
          const jobHistory = (data.experience || []).map((j: any) => ({
            company: j.company?.name || 'Unknown',
            domain: (j.company?.website || '').replace(/^https?:\/\//, '').replace(/^www\./, ''),
            title: j.title?.name || 'Unknown',
            start_date: j.start_date,
            end_date: j.end_date,
            is_current: !j.end_date
          }));

          await supabase.from('contacts').update({
            job_history: jobHistory,
            enrichment_status: 'enriched',
            pdl_enriched_at: new Date().toISOString()
          }).eq('id', c.id);
          enriched++;
        } catch {
          await supabase.from('contacts').update({ enrichment_status: 'failed' }).eq('id', c.id);
          failed++;
        }
      });
    }

    // Check if more to process
    const { count } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', teamId)
      .eq('enrichment_status', 'pending');

    if (count && count > 0) {
      await step.sendEvent('continue-enrich', {
        name: 'contacts/enrich',
        data: { teamId, batchSize }
      });
    } else {
      await step.sendEvent('trigger-match', {
        name: 'prospects/match-connections',
        data: { teamId }
      });
    }

    return { enriched, failed, remaining: count };
  }
);

// ============================================
// 4. SCHEDULED DAILY SYNC - Runs automatically
// ============================================
export const scheduledSync = inngest.createFunction(
  { id: 'contacts-daily-sync', name: 'Daily Contact Sync' },
  { cron: '0 6 * * *' }, // 6 AM daily
  async ({ step }) => {
    const { data: teams } = await supabase.from('teams').select('id, created_by');

    for (const team of teams || []) {
      await step.sendEvent(`sync-${team.id}`, {
        name: 'contacts/sync',
        data: { teamId: team.id, ownerId: team.created_by }
      });
    }

    return { teamsQueued: teams?.length || 0 };
  }
);

// ============================================
// 5. ON-LOGIN SYNC - Triggered when user logs in
// ============================================
export const onLoginSync = inngest.createFunction(
  { id: 'contacts-login-sync', name: 'Sync on User Login' },
  { event: 'user/logged-in' },
  async ({ event, step }) => {
    const { userId, teamId } = event.data;

    // Check if synced recently (within 1 hour)
    const lastSync = await step.run('check-last-sync', async () => {
      const { data } = await supabase
        .from('contacts')
        .select('swarm_synced_at')
        .eq('team_id', teamId)
        .eq('source', 'swarm')
        .order('swarm_synced_at', { ascending: false })
        .limit(1)
        .single();
      return data?.swarm_synced_at;
    });

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    if (lastSync && lastSync > oneHourAgo) {
      return { skipped: 'Recently synced' };
    }

    // Trigger full sync
    await step.sendEvent('trigger-sync', {
      name: 'contacts/sync',
      data: { teamId, ownerId: userId }
    });

    return { triggered: true };
  }
);
