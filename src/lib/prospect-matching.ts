/**
 * Prospect Matching - Matches contacts (current & former employees) to prospects
 * 
 * Uses both current employment AND job history from PDL enrichment
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ConnectionPath {
  contact_id: string;
  contact_name: string;
  contact_email?: string;
  contact_linkedin?: string;
  connection_strength: number;
  is_current_employee: boolean;
  job_title?: string;
  job_start_date?: string;
  job_end_date?: string;
  // Who connects you to this person (from contact_connections table)
  connector_name?: string;
  connector_linkedin?: string;
}

export interface ProspectMatch {
  prospect_id: string;
  company_domain: string;
  connection_paths: ConnectionPath[];
  best_path: ConnectionPath | null;
  connection_score: number; // 0-100
}

/**
 * Find all connections to a prospect company
 * Searches both current employees and job history
 */
export async function findConnectionsToProspect(
  teamId: string,
  companyDomain: string
): Promise<ConnectionPath[]> {
  const connections: ConnectionPath[] = [];
  const normalizedDomain = companyDomain.toLowerCase().replace(/^www\./, '');
  const companyName = normalizedDomain.split('.')[0]; // e.g., "roblox" from "roblox.com"

  // 1. Find CURRENT employees (matching company_domain)
  const { data: currentEmployees } = await supabase
    .from('contacts')
    .select(`
      id, name, email, linkedin_url, title, company, 
      connection_strength, company_domain
    `)
    .eq('team_id', teamId)
    .eq('company_domain', normalizedDomain);

  for (const contact of currentEmployees || []) {
    connections.push({
      contact_id: contact.id,
      contact_name: contact.name,
      contact_email: contact.email,
      contact_linkedin: contact.linkedin_url,
      connection_strength: contact.connection_strength || 0,
      is_current_employee: true,
      job_title: contact.title,
    });
  }

  // 2. Find FORMER employees (from job_history JSONB)
  const { data: formerEmployees } = await supabase
    .from('contacts')
    .select(`
      id, name, email, linkedin_url, connection_strength, job_history
    `)
    .eq('team_id', teamId)
    .not('job_history', 'eq', '[]');

  for (const contact of formerEmployees || []) {
    const jobHistory = contact.job_history as any[] || [];
    
    for (const job of jobHistory) {
      // Match by domain or company name
      const jobDomain = (job.domain || '').toLowerCase().replace(/^www\./, '');
      const jobCompany = (job.company || '').toLowerCase();
      
      const matchesDomain = jobDomain === normalizedDomain;
      const matchesName = jobCompany.includes(companyName) || companyName.includes(jobCompany);
      
      if ((matchesDomain || matchesName) && !job.is_current) {
        connections.push({
          contact_id: contact.id,
          contact_name: contact.name,
          contact_email: contact.email,
          contact_linkedin: contact.linkedin_url,
          connection_strength: contact.connection_strength || 0,
          is_current_employee: false,
          job_title: job.title,
          job_start_date: job.start_date,
          job_end_date: job.end_date,
        });
      }
    }
  }

  // 3. Get connector info for each contact (who introduced you)
  for (const conn of connections) {
    const { data: connectorData } = await supabase
      .from('contact_connections')
      .select('connector_name, connector_linkedin_url, connection_strength')
      .eq('contact_id', conn.contact_id)
      .order('connection_strength', { ascending: false })
      .limit(1)
      .single();

    if (connectorData) {
      conn.connector_name = connectorData.connector_name;
      conn.connector_linkedin = connectorData.connector_linkedin_url;
      // Boost strength if there's a warm connector
      conn.connection_strength = Math.min(100, 
        conn.connection_strength + (connectorData.connection_strength || 0) * 0.3
      );
    }
  }

  return connections;
}

/**
 * Calculate connection score for a prospect
 * Considers: relationship strength, current vs former, recency
 */
export function calculateConnectionScore(paths: ConnectionPath[]): number {
  if (paths.length === 0) return 0;

  let maxScore = 0;

  for (const path of paths) {
    let score = path.connection_strength;

    // Boost for current employees (more valuable than former)
    if (path.is_current_employee) {
      score *= 1.5;
    } else {
      // Decay for former employees based on how long ago
      if (path.job_end_date) {
        const yearsAgo = (Date.now() - new Date(path.job_end_date).getTime()) / (365 * 24 * 60 * 60 * 1000);
        score *= Math.max(0.5, 1 - yearsAgo * 0.1); // Decay 10% per year, min 50%
      }
    }

    // Boost if there's a connector (warm intro path)
    if (path.connector_name) {
      score *= 1.2;
    }

    maxScore = Math.max(maxScore, score);
  }

  return Math.min(100, Math.round(maxScore));
}

/**
 * Match all prospects for a team with their connections
 */
export async function matchAllProspects(teamId: string): Promise<{
  matched: number;
  updated: number;
}> {
  // Get all prospects for the team
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, company_domain, name')
    .eq('team_id', teamId)
    .not('company_domain', 'is', null);

  if (error || !prospects) {
    throw new Error(`Failed to fetch prospects: ${error?.message}`);
  }

  let matched = 0;
  let updated = 0;

  for (const prospect of prospects) {
    const connections = await findConnectionsToProspect(teamId, prospect.company_domain);

    if (connections.length > 0) {
      matched++;

      // Sort by connection strength to find best path
      connections.sort((a, b) => {
        // Prefer current employees
        if (a.is_current_employee !== b.is_current_employee) {
          return a.is_current_employee ? -1 : 1;
        }
        return b.connection_strength - a.connection_strength;
      });

      const bestPath = connections[0];
      const connectionScore = calculateConnectionScore(connections);

      // Update prospect with connection info
      const { error: updateError } = await supabase
        .from('prospects')
        .update({
          connection_score: connectionScore,
          best_connection_path: {
            target: bestPath.contact_name,
            target_title: bestPath.job_title,
            connector: bestPath.connector_name,
            strength: bestPath.connection_strength / 100,
            is_current: bestPath.is_current_employee,
            contact_id: bestPath.contact_id,
          },
          all_connection_paths: connections.slice(0, 10).map(c => ({
            target: c.contact_name,
            target_title: c.job_title,
            connector: c.connector_name,
            strength: c.connection_strength / 100,
            is_current: c.is_current_employee,
            contact_id: c.contact_id,
          })),
          updated_at: new Date().toISOString(),
        })
        .eq('id', prospect.id);

      if (!updateError) {
        updated++;
      }
    }
  }

  return { matched, updated };
}

/**
 * Calculate combined priority score (connection + fit)
 */
export function calculatePriorityScore(
  connectionScore: number,
  fitScore: number,
  weights = { connection: 0.4, fit: 0.6 }
): number {
  return Math.round(
    connectionScore * weights.connection + 
    fitScore * weights.fit
  );
}

/**
 * Run prospect matching for specific prospects or all
 */
export async function runProspectMatching(
  teamId: string,
  options?: { prospectIds?: string[] }
): Promise<{
  processed: number;
  matched: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let processed = 0;
  let matched = 0;

  // Get prospects to process
  let query = supabase
    .from('prospects')
    .select('id, company_domain, name')
    .eq('team_id', teamId)
    .not('company_domain', 'is', null);

  if (options?.prospectIds && options.prospectIds.length > 0) {
    query = query.in('id', options.prospectIds);
  }

  const { data: prospects, error } = await query;
  if (error || !prospects) {
    return { processed: 0, matched: 0, errors: [`Failed to fetch prospects: ${error?.message}`] };
  }

  for (const prospect of prospects) {
    try {
      processed++;
      const connections = await findConnectionsToProspect(teamId, prospect.company_domain);

      if (connections.length > 0) {
        matched++;
        connections.sort((a, b) => {
          if (a.is_current_employee !== b.is_current_employee) {
            return a.is_current_employee ? -1 : 1;
          }
          return b.connection_strength - a.connection_strength;
        });

        const bestPath = connections[0];
        const connectionScore = calculateConnectionScore(connections);

        await supabase
          .from('prospects')
          .update({
            connection_score: connectionScore,
            best_connection_path: {
              target: bestPath.contact_name,
              target_title: bestPath.job_title,
              connector: bestPath.connector_name,
              strength: bestPath.connection_strength / 100,
              is_current: bestPath.is_current_employee,
              contact_id: bestPath.contact_id,
            },
            all_connection_paths: connections.slice(0, 10).map(c => ({
              target: c.contact_name,
              target_title: c.job_title,
              connector: c.connector_name,
              strength: c.connection_strength / 100,
              is_current: c.is_current_employee,
              contact_id: c.contact_id,
            })),
            has_warm_intro: connections.some(c => c.connector_name),
            matched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', prospect.id);
      }
    } catch (err) {
      errors.push(`${prospect.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return { processed, matched, errors };
}
