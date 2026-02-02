import { inngest } from '../client';
import { ingestSwarmContacts } from '@/lib/swarm-ingestion';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Ingest contacts from Swarm network
 * Pulls all profiles from team's network and stores as contacts
 */
export const ingestSwarmContactsFunction = inngest.createFunction(
  {
    id: 'ingest-swarm-contacts',
    name: 'Ingest Contacts from Swarm',
    concurrency: {
      limit: 1,
      key: 'event.data.teamId',
    },
    retries: 2,
  },
  { event: 'contacts/ingest-swarm' },
  async ({ event, step }) => {
    const { teamId, ownerId, maxContacts = 5000 } = event.data;

    // Step 1: Get owner ID if not provided (use team admin)
    const resolvedOwnerId = await step.run('resolve-owner', async () => {
      if (ownerId) return ownerId;

      const supabase = createAdminClient();
      const { data: admin } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', teamId)
        .eq('role', 'admin')
        .limit(1)
        .single();

      if (!admin) {
        throw new Error(`No admin found for team ${teamId}`);
      }
      return admin.user_id;
    });

    // Step 2: Ingest contacts from Swarm
    const result = await step.run('ingest-from-swarm', async () => {
      return await ingestSwarmContacts(teamId, resolvedOwnerId, { maxContacts });
    });

    // Step 3: Log summary
    await step.run('log-result', async () => {
      console.log(`[Swarm Ingestion] Team ${teamId}: ${result.contactsIngested} new, ${result.contactsUpdated} updated, ${result.errors.length} errors`);
    });

    // Step 4: Run deduplication
    if (result.contactsIngested > 0 || result.contactsUpdated > 0) {
      await step.run('deduplicate-contacts', async () => {
        await inngest.send({
          name: 'contacts/deduplicate',
          data: { teamId },
        });
      });
    }

    return {
      status: result.success ? 'completed' : 'completed_with_errors',
      contactsIngested: result.contactsIngested,
      contactsUpdated: result.contactsUpdated,
      connectionsSaved: result.connectionsSaved,
      errorCount: result.errors.length,
      errors: result.errors.slice(0, 10), // First 10 errors
    };
  }
);

/**
 * Deduplicate contacts - merge duplicates by email or linkedin
 */
export const deduplicateContacts = inngest.createFunction(
  {
    id: 'deduplicate-contacts',
    name: 'Deduplicate Contacts',
    concurrency: { limit: 1 },
  },
  { event: 'contacts/deduplicate' },
  async ({ event, step }) => {
    const { teamId } = event.data;

    const result = await step.run('find-and-merge-duplicates', async () => {
      const supabase = createAdminClient();

      // Find duplicates by email
      const { data: emailDupes } = await supabase.rpc('find_duplicate_contacts_by_email', {
        p_team_id: teamId,
      });

      // Find duplicates by LinkedIn URL
      const { data: linkedinDupes } = await supabase.rpc('find_duplicate_contacts_by_linkedin', {
        p_team_id: teamId,
      });

      let mergedCount = 0;

      // Merge email duplicates (keep the one with most data)
      for (const dupe of emailDupes || []) {
        if (dupe.duplicate_ids && dupe.duplicate_ids.length > 1) {
          const ids = dupe.duplicate_ids;
          const keepId = ids[0]; // Keep first (will update with merged data)
          const deleteIds = ids.slice(1);

          // Update connections to point to the kept contact
          await supabase
            .from('contact_connections')
            .update({ contact_id: keepId })
            .in('contact_id', deleteIds);

          // Delete duplicates
          await supabase
            .from('contacts')
            .delete()
            .in('id', deleteIds);

          mergedCount += deleteIds.length;
        }
      }

      // Merge LinkedIn duplicates
      for (const dupe of linkedinDupes || []) {
        if (dupe.duplicate_ids && dupe.duplicate_ids.length > 1) {
          const ids = dupe.duplicate_ids;
          const keepId = ids[0];
          const deleteIds = ids.slice(1);

          await supabase
            .from('contact_connections')
            .update({ contact_id: keepId })
            .in('contact_id', deleteIds);

          await supabase
            .from('contacts')
            .delete()
            .in('id', deleteIds);

          mergedCount += deleteIds.length;
        }
      }

      console.log(`[Dedup] Merged ${mergedCount} duplicate contacts for team ${teamId}`);
      return { merged: mergedCount };
    });

    // Trigger cleanup after dedup
    await step.run('trigger-cleanup', async () => {
      await inngest.send({
        name: 'contacts/cleanup-junk',
        data: { teamId },
      });
    });

    return {
      status: 'completed',
      duplicatesMerged: result.merged,
    };
  }
);

/**
 * Clean up junk contacts (generic mailboxes, no-reply, etc.)
 * Marks as is_junk=true instead of deleting, for audit trail
 */
export const cleanupJunkContacts = inngest.createFunction(
  {
    id: 'cleanup-junk-contacts',
    name: 'Cleanup Junk Contacts',
    concurrency: { limit: 1 },
  },
  { event: 'contacts/cleanup-junk' },
  async ({ event, step }) => {
    const { teamId } = event.data;

    // Patterns for junk emails
    const junkEmailPatterns = [
      /^(admin|info|contact|support|help|sales|hello|team|careers|jobs|hr|press|media|marketing|partnerships|billing|accounts|finance|legal|privacy|security|abuse|webmaster|postmaster|feedback|enquiries|general|office|reception)@/i,
      /^no[-_]?reply@/i,
      /^do[-_]?not[-_]?reply@/i,
      /notification|alert|automated|system|bounce|mailer[-_]?daemon/i,
    ];

    // Patterns for junk names (email prefixes parsed as names)
    const junkNamePrefixes = [
      'noreply', 'donotreply', 'no-reply', 'do-not-reply', 'newsletter',
      'customerservice', 'customer-service', 'support', 'info', 'admin',
      'sales', 'marketing', 'billing', 'notifications', 'alerts', 'mailer',
      'daemon', 'postmaster', 'webmaster', 'system', 'automated', 'auto-reply',
      'bounce', 'unsubscribe', 'feedback', 'help', 'contact', 'service'
    ];

    const result = await step.run('mark-junk-contacts', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const supabase = createAdminClient();

      // Get all contacts not already marked as junk
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, email, full_name')
        .eq('team_id', teamId)
        .eq('is_junk', false);

      if (!contacts) return { marked: 0 };

      // Find junk contacts
      const junkIds = contacts
        .filter(c => {
          // Check email patterns
          if (c.email && junkEmailPatterns.some(p => p.test(c.email))) {
            return true;
          }
          // Check name patterns (email prefixes parsed as names)
          const name = (c.full_name || '').toLowerCase();
          if (junkNamePrefixes.some(prefix => name.startsWith(prefix))) {
            return true;
          }
          // Check for underscore names without spaces (like "citizensbank_customerservice")
          if (!name.includes(' ') && name.includes('_') && name.length > 5) {
            // But exclude real names like "john_smith" by checking for junk words
            const hasJunkWord = junkNamePrefixes.some(jw => name.includes(jw));
            return hasJunkWord;
          }
          return false;
        })
        .map(c => c.id);

      if (junkIds.length === 0) return { marked: 0 };

      // Mark as junk (don't delete)
      await supabase
        .from('contacts')
        .update({ is_junk: true })
        .in('id', junkIds);

      console.log(`[Cleanup] Marked ${junkIds.length} contacts as junk for team ${teamId}`);
      return { marked: junkIds.length };
    });

    // Trigger PDL enrichment after cleanup
    await step.run('trigger-enrichment', async () => {
      await inngest.send({
        name: 'contacts/enrich-pdl',
        data: { teamId },
      });
    });

    return {
      status: 'completed',
      junkMarked: result.marked,
    };
  }
);

/**
 * Enrich contacts with PDL data
 */
export const enrichContactsPDL = inngest.createFunction(
  {
    id: 'enrich-contacts-pdl',
    name: 'Enrich Contacts with PDL',
    concurrency: {
      limit: 2,
      key: 'event.data.teamId',
    },
    retries: 2,
  },
  { event: 'contacts/enrich-pdl' },
  async ({ event, step }) => {
    const { teamId, batchSize = 50 } = event.data;

    const result = await step.run('enrich-contacts', async () => {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const { enrichByLinkedIn, enrichByEmail } = await import('@/lib/pdl');
      const supabase = createAdminClient();

      // Get unenriched contacts (prioritize those with LinkedIn)
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, email, linkedin_url, full_name, current_company, current_title')
        .eq('team_id', teamId)
        .is('pdl_enriched_at', null)
        .order('connection_strength', { ascending: false, nullsFirst: false })
        .limit(batchSize);

      if (!contacts || contacts.length === 0) {
        return { enriched: 0, total: 0, errors: [] };
      }

      let enrichedCount = 0;
      const errors: string[] = [];

      for (const contact of contacts) {
        try {
          let result;

          if (contact.linkedin_url) {
            result = await enrichByLinkedIn(contact.linkedin_url);
          } else if (contact.email) {
            result = await enrichByEmail(contact.email);
          } else {
            continue;
          }

          if (result.success && result.person) {
            const person = result.person;
            await supabase
              .from('contacts')
              .update({
                pdl_id: person.id,
                email: contact.email || person.work_email || person.personal_emails?.[0] || null,
                current_title: person.job_title || contact.current_title,
                current_company: person.job_company_name || contact.current_company,
                linkedin_url: person.linkedin_url || contact.linkedin_url,
                pdl_enriched_at: new Date().toISOString(),
              })
              .eq('id', contact.id);

            enrichedCount++;
          } else {
            // Mark as attempted
            await supabase
              .from('contacts')
              .update({ pdl_enriched_at: new Date().toISOString() })
              .eq('id', contact.id);
          }

          // Rate limit for PDL
          await new Promise(r => setTimeout(r, 150));
        } catch (error) {
          errors.push(`${contact.full_name}: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }

      return { enriched: enrichedCount, total: contacts.length, errors };
    });

    // If more contacts to enrich, schedule next batch
    if (result.total === batchSize) {
      await step.run('schedule-next-batch', async () => {
        await inngest.send({
          name: 'contacts/enrich-pdl',
          data: { teamId, batchSize },
        });
      });
    }

    return {
      status: 'completed',
      enriched: result.enriched,
      processed: result.total,
      errorCount: result.errors.length,
    };
  }
);

// Export all functions
export const functions = [
  ingestSwarmContactsFunction,
  deduplicateContacts,
  cleanupJunkContacts,
  enrichContactsPDL,
];
