import { inngest } from '../client';
import { createAdminClient } from '@/lib/supabase/admin';
import { findConnectionPaths, searchByCompanyAndTitle, testSwarmConnection } from '@/lib/swarm';
import { detectHelixProductFit, CompanyProfile } from '@/lib/helix-sales';
import { enrichByLinkedIn, enrichByNameAndCompany } from '@/lib/pdl';

const DEFAULT_BATCH_SIZE = 20;
const RATE_LIMIT_DELAY_MS = 250;

/**
 * Sync prospects with The Swarm to find connection paths
 * Updates connection_score, best_connector, and caches all paths
 */
export const syncProspectConnections = inngest.createFunction(
  {
    id: 'sync-prospect-connections',
    name: 'Sync Prospect Connections with The Swarm',
    concurrency: {
      limit: 1,
      key: 'event.data.teamId',
    },
    retries: 2,
  },
  { event: 'prospects/sync-connections' },
  async ({ event, step }) => {
    const { teamId, prospectIds, batchSize = DEFAULT_BATCH_SIZE } = event.data;
    const supabase = createAdminClient();

    // Step 1: Verify Swarm connection
    const swarmStatus = await step.run('verify-swarm-connection', async () => {
      return await testSwarmConnection();
    });

    if (!swarmStatus.connected) {
      throw new Error(`Swarm API not available: ${swarmStatus.error}`);
    }

    // Step 2: Get prospects to sync
    const prospects = await step.run('get-prospects', async () => {
      let query = supabase
        .from('prospects')
        .select('*')
        .eq('team_id', teamId);

      if (prospectIds && prospectIds.length > 0) {
        query = query.in('id', prospectIds);
      } else {
        // Get prospects that haven't been synced recently (or never)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        query = query
          .or(`last_swarm_sync.is.null,last_swarm_sync.lt.${oneDayAgo}`)
          .order('priority_score', { ascending: false })
          .limit(batchSize);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    });

    if (prospects.length === 0) {
      return { status: 'no_prospects', message: 'No prospects to sync' };
    }

    // Step 3: Process each prospect
    const results = await step.run('sync-prospects', async () => {
      const syncResults: Array<{
        prospectId: string;
        company: string;
        connectionsFound: number;
        bestScore: number;
        error?: string;
      }> = [];

      for (const prospect of prospects) {
        try {
          // Find connection paths using Swarm
          const paths = await findConnectionPaths(
            prospect.company_domain,
            prospect.helix_target_titles || undefined
          );

          // Calculate connection score
          let connectionScore = 0;
          let hasWarmIntro = false;
          let bestConnector: string | null = null;
          let connectionType: string | null = null;
          let connectionContext: string | null = null;

          if (paths.length > 0) {
            const avgStrength = paths.reduce((sum, p) => sum + p.strength, 0) / paths.length;
            const pathBonus = Math.min(paths.length * 5, 30);
            connectionScore = Math.round(avgStrength * 70 + pathBonus);
            hasWarmIntro = paths.some(p => p.strength >= 0.7);

            // Best path info
            const best = paths[0];
            bestConnector = best.connector;
            connectionType = best.connection_type;
            connectionContext = best.shared_context;
          }

          // Update prospect
          await supabase
            .from('prospects')
            .update({
              connection_score: connectionScore,
              has_warm_intro: hasWarmIntro,
              best_connector: bestConnector,
              connection_type: connectionType,
              connection_context: connectionContext,
              connections_count: paths.length,
              last_swarm_sync: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', prospect.id);

          // Store all connection paths
          if (paths.length > 0) {
            // Delete old paths first
            await supabase
              .from('prospect_connections')
              .delete()
              .eq('prospect_id', prospect.id);

            // Insert new paths
            const connectionRecords = paths.slice(0, 10).map(path => ({
              prospect_id: prospect.id,
              target_name: path.target_person.full_name,
              target_title: path.target_person.current_title,
              target_linkedin_url: path.target_person.linkedin_url,
              connector_name: path.connector,
              connection_type: path.connection_type,
              connection_strength: path.strength,
              shared_context: path.shared_context,
            }));

            await supabase.from('prospect_connections').insert(connectionRecords);
          }

          syncResults.push({
            prospectId: prospect.id,
            company: prospect.company_name,
            connectionsFound: paths.length,
            bestScore: connectionScore,
          });

          // Rate limit
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
        } catch (error) {
          syncResults.push({
            prospectId: prospect.id,
            company: prospect.company_name,
            connectionsFound: 0,
            bestScore: 0,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return syncResults;
    });

    // Step 4: Log activity
    await step.run('log-activity', async () => {
      const successCount = results.filter(r => !r.error).length;
      const totalConnections = results.reduce((sum, r) => sum + r.connectionsFound, 0);

      // Could log to a team activity table here
      console.log(`Synced ${successCount}/${results.length} prospects, found ${totalConnections} connections`);
    });

    return {
      status: 'completed',
      processed: results.length,
      successful: results.filter(r => !r.error).length,
      totalConnections: results.reduce((sum, r) => sum + r.connectionsFound, 0),
      results,
    };
  }
);

/**
 * Score a prospect for Helix product fit
 */
export const scoreHelixFit = inngest.createFunction(
  {
    id: 'score-helix-fit',
    name: 'Score Prospect for Helix Product Fit',
    concurrency: { limit: 5 },
  },
  { event: 'prospects/score-helix-fit' },
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
      company: prospect.company_name,
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
            name: 'prospects/score-helix-fit',
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
      company: prospect.company_name,
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
    await step.invoke('score-helix-fit', {
      function: scoreHelixFit,
      data: { prospectId },
    });

    // Step 2: Sync Swarm connections
    const supabase = createAdminClient();
    const { data: prospect } = await step.run('get-prospect', async () => {
      return await supabase
        .from('prospects')
        .select('team_id')
        .eq('id', prospectId)
        .single();
    });

    if (prospect) {
      await step.invoke('sync-connections', {
        function: syncProspectConnections,
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
  syncProspectConnections,
  scoreHelixFit,
  importProspects,
  enrichProspectContacts,
  runProspectPipeline,
];
