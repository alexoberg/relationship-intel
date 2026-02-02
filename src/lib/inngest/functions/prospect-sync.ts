import { inngest } from '../client';
import { createAdminClient } from '@/lib/supabase/admin';
import { runProspectMatching } from '@/lib/prospect-matching';
import { detectHelixProductFit, CompanyProfile } from '@/lib/helix-sales';
import { enrichByLinkedIn, enrichByNameAndCompany } from '@/lib/pdl';

const DEFAULT_BATCH_SIZE = 20;

/**
 * Match prospects to our contacts (OUR logic, not Swarm)
 * Finds contacts we know at prospect companies and calculates connection scores
 */
export const matchProspectConnections = inngest.createFunction(
  {
    id: 'match-prospect-connections',
    name: 'Match Prospects to Contacts',
    concurrency: {
      limit: 1,
      key: 'event.data.teamId',
    },
    retries: 2,
  },
  { event: 'prospects/match-connections' },
  async ({ event, step }) => {
    const { teamId, prospectIds, batchSize = DEFAULT_BATCH_SIZE } = event.data;
    const supabase = createAdminClient();

    // Step 1: Get prospects to match
    const prospects = await step.run('get-prospects', async () => {
      let query = supabase
        .from('prospects')
        .select('id')
        .eq('team_id', teamId);

      if (prospectIds && prospectIds.length > 0) {
        query = query.in('id', prospectIds);
      } else {
        // Get prospects that haven't been matched recently
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        query = query
          .or(`matched_at.is.null,matched_at.lt.${oneDayAgo}`)
          .order('priority_score', { ascending: false })
          .limit(batchSize);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    });

    if (prospects.length === 0) {
      return { status: 'no_prospects', message: 'No prospects to match' };
    }

    // Step 2: Run matching
    const result = await step.run('match-prospects', async () => {
      return await runProspectMatching(teamId, {
        prospectIds: prospects.map(p => p.id),
      });
    });

    // Step 3: Log activity
    await step.run('log-activity', async () => {
      console.log(`Matched ${result.matched}/${result.processed} prospects to contacts`);
    });

    return {
      status: 'completed',
      processed: result.processed,
      matched: result.matched,
      errors: result.errors.length,
    };
  }
);

// Keep backward compatibility - alias old event to new function
export const syncProspectConnections = inngest.createFunction(
  {
    id: 'sync-prospect-connections',
    name: 'Sync Prospect Connections (Legacy)',
    concurrency: {
      limit: 1,
      key: 'event.data.teamId',
    },
  },
  { event: 'prospects/sync-connections' },
  async ({ event, step }) => {
    // Forward to the new matching function
    await step.run('forward-to-matching', async () => {
      await inngest.send({
        name: 'prospects/match-connections',
        data: event.data,
      });
    });

    return { status: 'forwarded_to_matching' };
  }
);

/**
 * Score a single prospect for Helix product fit (rule-based)
 * Note: For batch AI-powered scoring, use 'prospects/score-helix-fit' event instead
 */
export const scoreHelixFitSingle = inngest.createFunction(
  {
    id: 'score-helix-fit-single',
    name: 'Score Single Prospect for Helix Product Fit',
    concurrency: { limit: 5 },
  },
  { event: 'prospects/score-helix-fit-single' },
  async ({ event, step }) => {
    const { prospectId } = event.data;
    const supabase = createAdminClient();

    // Get prospect
    const prospect = await step.run('get-prospect', async () => {
      const { data, error } = await supabase
        .from('prospects')
        .select('*')
        .eq('id', prospectId)
        .single();

      if (error) throw error;
      return data;
    });

    // Build company profile for scoring
    const companyProfile: CompanyProfile = {
      name: prospect.company_name,
      domain: prospect.company_domain,
      industry: prospect.company_industry,
      hasUserAccounts: true, // Assume true for now
      hasAgeRestrictedContent: false,
      isTicketingPlatform: prospect.company_industry?.toLowerCase().includes('ticket') || false,
      isMarketplace: prospect.company_industry?.toLowerCase().includes('marketplace') || false,
      isSocialPlatform: prospect.company_industry?.toLowerCase().includes('social') || false,
      isGamingPlatform: prospect.company_industry?.toLowerCase().includes('gaming') || false,
    };

    // Score with helix-sales
    const result = await step.run('score-fit', async () => {
      return detectHelixProductFit(companyProfile);
    });

    // Update prospect
    await step.run('update-prospect', async () => {
      const helixProducts = result.products.map(p => p.product);
      const fitScore = result.bestFit ? Math.round(result.bestFit.confidence * 100) : 0;
      const fitReason = result.products.map(p => `${p.product}: ${p.reason}`).join('\n');

      await supabase
        .from('prospects')
        .update({
          helix_products: helixProducts,
          helix_fit_score: fitScore,
          helix_fit_reason: fitReason,
          helix_target_titles: result.allTargetTitles,
          updated_at: new Date().toISOString(),
        })
        .eq('id', prospectId);
    });

    return {
      prospectId,
      company: prospect.name,
      helixProducts: result.products.map(p => p.product),
      fitScore: result.bestFit ? Math.round(result.bestFit.confidence * 100) : 0,
      targetTitles: result.allTargetTitles,
    };
  }
);

/**
 * Bulk import prospects from research data
 */
export const importProspects = inngest.createFunction(
  {
    id: 'import-prospects',
    name: 'Import Prospects from Research',
    concurrency: { limit: 1 },
  },
  { event: 'prospects/import' },
  async ({ event, step }) => {
    const { teamId, prospects, source = 'research' } = event.data;
    const supabase = createAdminClient();

    // Insert prospects (upsert on domain)
    const results = await step.run('insert-prospects', async () => {
      const inserted: string[] = [];
      const skipped: string[] = [];
      const errors: string[] = [];

      for (const prospect of prospects) {
        try {
          const { data, error } = await supabase
            .from('prospects')
            .upsert({
              team_id: teamId,
              company_name: prospect.company_name,
              company_domain: prospect.company_domain,
              company_industry: prospect.company_industry,
              funding_stage: prospect.funding_stage,
              investors: prospect.investors,
              source,
              source_url: prospect.source_url,
            }, {
              onConflict: 'team_id,company_domain',
              ignoreDuplicates: false,
            })
            .select()
            .single();

          if (error) {
            if (error.code === '23505') {
              skipped.push(prospect.company_domain);
            } else {
              errors.push(`${prospect.company_domain}: ${error.message}`);
            }
          } else if (data) {
            inserted.push(data.id);
          }
        } catch (err) {
          errors.push(`${prospect.company_domain}: ${err}`);
        }
      }

      return { inserted, skipped, errors };
    });

    // Trigger Helix scoring for new prospects
    if (results.inserted.length > 0) {
      await step.run('trigger-scoring', async () => {
        for (const prospectId of results.inserted) {
          await inngest.send({
            name: 'prospects/score-helix-fit-single',
            data: { prospectId },
          });
        }
      });

      // Trigger Swarm sync
      await step.run('trigger-swarm-sync', async () => {
        await inngest.send({
          name: 'prospects/sync-connections',
          data: { teamId, prospectIds: results.inserted },
        });
      });
    }

    return {
      status: 'completed',
      imported: results.inserted.length,
      skipped: results.skipped.length,
      errors: results.errors.length,
      errorDetails: results.errors,
    };
  }
);

/**
 * Enrich prospect contacts with PDL data
 * After Swarm finds connections, PDL enriches them with full contact details
 */
export const enrichProspectContacts = inngest.createFunction(
  {
    id: 'enrich-prospect-contacts',
    name: 'Enrich Prospect Contacts with PDL',
    concurrency: { limit: 2 },
    retries: 2,
  },
  { event: 'prospects/enrich-contacts' },
  async ({ event, step }) => {
    const { prospectId, maxContacts = 5 } = event.data;
    const supabase = createAdminClient();

    // Get prospect and its connections
    const { prospect, connections } = await step.run('get-data', async () => {
      const { data: prospectData } = await supabase
        .from('prospects')
        .select('*')
        .eq('id', prospectId)
        .single();

      const { data: connectionsData } = await supabase
        .from('prospect_connections')
        .select('*')
        .eq('prospect_id', prospectId)
        .order('connection_strength', { ascending: false })
        .limit(maxContacts);

      return { prospect: prospectData, connections: connectionsData || [] };
    });

    if (!prospect || connections.length === 0) {
      return { status: 'no_connections', message: 'No connections to enrich' };
    }

    // Enrich each connection via PDL
    const enrichmentResults = await step.run('enrich-contacts', async () => {
      const results: Array<{
        connectionId: string;
        name: string;
        enriched: boolean;
        email?: string;
        error?: string;
      }> = [];

      for (const conn of connections) {
        try {
          let enrichResult;

          // Try LinkedIn first, then name+company
          if (conn.target_linkedin_url) {
            enrichResult = await enrichByLinkedIn(conn.target_linkedin_url);
          } else {
            enrichResult = await enrichByNameAndCompany(
              conn.target_name,
              prospect.company_name
            );
          }

          if (enrichResult.success && enrichResult.person) {
            // Update the connection with enriched data
            const email = enrichResult.person.work_email || 
                          enrichResult.person.personal_emails?.[0];

            await supabase
              .from('prospect_connections')
              .update({
                target_email: email,
                target_title: enrichResult.person.job_title || conn.target_title,
                target_linkedin_url: enrichResult.person.linkedin_url || conn.target_linkedin_url,
              })
              .eq('id', conn.id);

            results.push({
              connectionId: conn.id,
              name: conn.target_name,
              enriched: true,
              email,
            });
          } else {
            results.push({
              connectionId: conn.id,
              name: conn.target_name,
              enriched: false,
              error: enrichResult.error,
            });
          }

          // Rate limit for PDL
          await new Promise(resolve => setTimeout(resolve, 150));
        } catch (error) {
          results.push({
            connectionId: conn.id,
            name: conn.target_name,
            enriched: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return results;
    });

    // Log activity
    await step.run('log-activity', async () => {
      const enrichedCount = enrichmentResults.filter(r => r.enriched).length;
      await supabase.rpc('log_prospect_activity', {
        p_prospect_id: prospectId,
        p_user_id: null, // System action
        p_activity_type: 'enriched',
        p_activity_data: {
          total: enrichmentResults.length,
          enriched: enrichedCount,
          emails_found: enrichmentResults.filter(r => r.email).length,
        },
      });
    });

    return {
      status: 'completed',
      prospectId,
      company: prospect.name,
      enriched: enrichmentResults.filter(r => r.enriched).length,
      total: enrichmentResults.length,
      results: enrichmentResults,
    };
  }
);

/**
 * Full prospect pipeline: Score → Swarm → PDL
 * Runs the complete flow for a new prospect
 */
export const runProspectPipeline = inngest.createFunction(
  {
    id: 'run-prospect-pipeline',
    name: 'Run Full Prospect Pipeline',
    concurrency: { limit: 3 },
  },
  { event: 'prospects/run-pipeline' },
  async ({ event, step }) => {
    const { prospectId } = event.data;

    // Step 1: Score Helix fit
    await step.invoke('score-helix-fit-single', {
      function: scoreHelixFitSingle,
      data: { prospectId },
    });

    // Step 2: Match to contacts (our logic)
    const supabase = createAdminClient();
    const { data: prospect } = await step.run('get-prospect', async () => {
      return await supabase
        .from('prospects')
        .select('team_id')
        .eq('id', prospectId)
        .single();
    });

    if (prospect) {
      await step.invoke('match-connections', {
        function: matchProspectConnections,
        data: { teamId: prospect.team_id, prospectIds: [prospectId] },
      });
    }

    // Step 3: Enrich top contacts via PDL
    await step.invoke('enrich-contacts', {
      function: enrichProspectContacts,
      data: { prospectId, maxContacts: 5 },
    });

    return { status: 'pipeline_complete', prospectId };
  }
);

// Export all functions
export const functions = [
  matchProspectConnections,
  syncProspectConnections, // Legacy, forwards to matchProspectConnections
  scoreHelixFitSingle,
  importProspects,
  enrichProspectContacts,
  runProspectPipeline,
];
