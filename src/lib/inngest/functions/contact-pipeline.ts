/**
 * Contact Pipeline Inngest Functions
 * 
 * Automated flow: Sync → Clean → Enrich → Match
 */

import { inngest } from '../client';
import { 
  fetchSwarmContacts, 
  upsertContacts, 
  getContactsForEnrichment,
  updateContactEnrichment,
  markEnrichmentFailed,
  type JobHistoryEntry 
} from '../../contact-pipeline';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * 1. AUTO-SYNC: Triggered on login or scheduled
 * Pulls contacts from all connected sources
 */
export const syncContacts = inngest.createFunction(
  { id: 'contacts-sync', name: 'Sync Contacts from Sources' },
  { event: 'contacts/sync' },
  async ({ event, step }) => {
    const { teamId, ownerId, sources = ['swarm'] } = event.data;

    const results: Record<string, any> = {};

    // Sync from each source
    for (const source of sources) {
      if (source === 'swarm') {
        results.swarm = await step.run('sync-swarm', async () => {
          const apiKey = process.env.SWARM_API_KEY;
          if (!apiKey) return { error: 'No Swarm API key configured' };

          try {
            const contacts = await fetchSwarmContacts(apiKey);
            const result = await upsertContacts(teamId, ownerId, contacts);
            return { 
              fetched: contacts.length,
              ...result 
            };
          } catch (err) {
            return { error: err instanceof Error ? err.message : 'Unknown error' };
          }
        });
      }
      // Add more sources here: apollo, salesforce, hubspot
    }

    // Trigger cleanup after sync
    await step.sendEvent('trigger-cleanup', {
      name: 'contacts/cleanup',
      data: { teamId }
    });

    return { sources: results };
  }
);

/**
 * 2. CLEANUP: Normalize and dedupe contacts
 */
export const cleanupContacts = inngest.createFunction(
  { id: 'contacts-cleanup', name: 'Cleanup and Normalize Contacts' },
  { event: 'contacts/cleanup' },
  async ({ event, step }) => {
    const { teamId } = event.data;

    // Find and merge duplicates by email
    const emailDupes = await step.run('find-email-dupes', async () => {
      const { data, error } = await supabase.rpc('find_duplicate_contacts_by_email', {
        p_team_id: teamId
      });
      return data || [];
    });

    // Find and merge duplicates by LinkedIn
    const linkedinDupes = await step.run('find-linkedin-dupes', async () => {
      const { data, error } = await supabase.rpc('find_duplicate_contacts_by_linkedin', {
        p_team_id: teamId
      });
      return data || [];
    });

    // Merge duplicates (keep highest connection_strength)
    let merged = 0;
    for (const dupe of [...emailDupes, ...linkedinDupes]) {
      if (dupe.duplicate_ids?.length > 1) {
        await step.run(`merge-${dupe.duplicate_ids[0]}`, async () => {
          const keepId = dupe.duplicate_ids[0]; // First one has highest strength
          const deleteIds = dupe.duplicate_ids.slice(1);
          
          // Delete duplicates
          await supabase
            .from('contacts')
            .delete()
            .in('id', deleteIds);
          
          merged += deleteIds.length;
        });
      }
    }

    // Normalize company domains
    await step.run('normalize-domains', async () => {
      // Get contacts with company but no domain
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, email, company')
        .eq('team_id', teamId)
        .is('company_domain', null);

      for (const contact of contacts || []) {
        let domain: string | null = null;
        
        // Try to extract from email
        if (contact.email) {
          const parts = contact.email.split('@');
          if (parts.length === 2) {
            domain = parts[1].toLowerCase().replace(/^www\./, '');
          }
        }
        
        if (domain) {
          await supabase
            .from('contacts')
            .update({ company_domain: domain })
            .eq('id', contact.id);
        }
      }
    });

    // Trigger enrichment after cleanup
    await step.sendEvent('trigger-enrichment', {
      name: 'contacts/enrich',
      data: { teamId, batchSize: 50 }
    });

    return { 
      emailDuplicates: emailDupes.length,
      linkedinDuplicates: linkedinDupes.length,
      merged 
    };
  }
);

/**
 * 3. ENRICH: Get job history from PDL
 */
export const enrichContacts = inngest.createFunction(
  { id: 'contacts-enrich', name: 'Enrich Contacts via PDL' },
  { event: 'contacts/enrich' },
  async ({ event, step }) => {
    const { teamId, batchSize = 50 } = event.data;

    // Get contacts needing enrichment
    const contacts = await step.run('get-enrichment-queue', async () => {
      return getContactsForEnrichment(teamId, batchSize);
    });

    if (contacts.length === 0) {
      return { message: 'No contacts to enrich' };
    }

    let enriched = 0;
    let failed = 0;

    // Enrich each contact
    for (const contact of contacts) {
      await step.run(`enrich-${contact.id}`, async () => {
        try {
          const jobHistory = await fetchPDLJobHistory(contact);
          
          if (jobHistory) {
            await updateContactEnrichment(contact.id, jobHistory);
            enriched++;
          } else {
            await markEnrichmentFailed(contact.id, 'No PDL data found');
            failed++;
          }
        } catch (err) {
          await markEnrichmentFailed(
            contact.id, 
            err instanceof Error ? err.message : 'Unknown error'
          );
          failed++;
        }
      });
    }

    // If more contacts to enrich, schedule another batch
    const remaining = await step.run('check-remaining', async () => {
      const { count } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .eq('enrichment_status', 'pending');
      return count || 0;
    });

    if (remaining > 0) {
      await step.sendEvent('continue-enrichment', {
        name: 'contacts/enrich',
        data: { teamId, batchSize }
      });
    } else {
      // All done - trigger prospect matching
      await step.sendEvent('trigger-matching', {
        name: 'prospects/match-connections',
        data: { teamId }
      });
    }

    return { enriched, failed, remaining };
  }
);

/**
 * SCHEDULED: Daily contact sync
 */
export const scheduledSync = inngest.createFunction(
  { id: 'contacts-daily-sync', name: 'Daily Contact Sync' },
  { cron: '0 6 * * *' }, // 6 AM daily
  async ({ step }) => {
    // Get all teams with Swarm configured
    const teams = await step.run('get-teams', async () => {
      const { data } = await supabase
        .from('teams')
        .select('id, owner_id');
      return data || [];
    });

    // Trigger sync for each team
    for (const team of teams) {
      await step.sendEvent(`sync-team-${team.id}`, {
        name: 'contacts/sync',
        data: { 
          teamId: team.id, 
          ownerId: team.owner_id,
          sources: ['swarm'] 
        }
      });
    }

    return { teamsQueued: teams.length };
  }
);

/**
 * Fetch job history from People Data Labs
 */
async function fetchPDLJobHistory(contact: { 
  email?: string; 
  linkedin_url?: string;
  name?: string;
}): Promise<JobHistoryEntry[] | null> {
  const apiKey = process.env.PDL_API_KEY;
  if (!apiKey) return null;

  // Build query params
  const params = new URLSearchParams();
  if (contact.email) params.append('email', contact.email);
  if (contact.linkedin_url) params.append('profile', contact.linkedin_url);
  
  if (!params.toString()) return null;

  const response = await fetch(
    `https://api.peopledatalabs.com/v5/person/enrich?${params}`,
    {
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`PDL API error: ${response.status}`);
  }

  const data = await response.json();
  
  // Extract job history
  const experience = data.experience || [];
  
  return experience.map((job: any) => ({
    company: job.company?.name || job.title?.organization || 'Unknown',
    domain: job.company?.website?.replace(/^https?:\/\//, '').replace(/^www\./, ''),
    title: job.title?.name || job.title?.role || 'Unknown',
    start_date: job.start_date,
    end_date: job.end_date,
    is_current: !job.end_date || job.is_primary === true,
  }));
}
