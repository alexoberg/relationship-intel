/**
 * Two-Pass Proximity Scoring
 *
 * Pass 1 (Initial): Based on Swarm connection strength + interaction data
 *   - Runs during ingestion
 *   - Uses connection_strength from Swarm (0-100)
 *   - Adds interaction bonuses if Gmail/Calendar data available
 *
 * Pass 2 (Refined): After PDL enrichment
 *   - Adds bonuses based on work history overlap
 *   - Considers shared companies, education
 *   - Adjusts for recency and relevance
 *
 * Final score: 0-100
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface ProximityFactors {
  // Swarm factors (Pass 1)
  swarm_connection_strength: number; // 0-100

  // Interaction factors (Pass 1)
  email_count: number;
  meeting_count: number;
  last_interaction_days_ago: number | null;

  // Enrichment factors (Pass 2)
  shared_companies_count: number;
  current_company_connection: boolean;
  worked_together_recently: boolean; // within last 3 years
}

export interface ProximityScore {
  score: number; // 0-100
  factors: ProximityFactors;
  pass: 1 | 2;
}

/**
 * Calculate Pass 1 proximity score (pre-enrichment)
 *
 * Weights:
 * - Swarm connection strength: 50% (primary signal)
 * - Email interactions: 25%
 * - Meeting interactions: 15%
 * - Recency bonus: 10%
 */
export function calculatePass1Score(factors: Partial<ProximityFactors>): number {
  let score = 0;

  // Swarm connection strength (0-50 points)
  const swarmStrength = factors.swarm_connection_strength || 0;
  score += swarmStrength * 0.5;

  // Email interactions (0-25 points)
  // Diminishing returns: 5 points per email, max 25
  const emailCount = factors.email_count || 0;
  score += Math.min(emailCount * 5, 25);

  // Meeting interactions (0-15 points)
  // 5 points per meeting, max 15
  const meetingCount = factors.meeting_count || 0;
  score += Math.min(meetingCount * 5, 15);

  // Recency bonus (0-10 points)
  if (factors.last_interaction_days_ago !== null && factors.last_interaction_days_ago !== undefined) {
    const daysAgo = factors.last_interaction_days_ago;
    if (daysAgo <= 7) score += 10; // Last week
    else if (daysAgo <= 30) score += 7; // Last month
    else if (daysAgo <= 90) score += 4; // Last quarter
    else if (daysAgo <= 365) score += 2; // Last year
  }

  return Math.min(Math.round(score), 100);
}

/**
 * Calculate Pass 2 proximity score (post-enrichment)
 *
 * Starts with Pass 1 score and adds enrichment bonuses:
 * - Shared companies: +5 per company (max +15)
 * - Current company connection: +10
 * - Recent work overlap: +10
 */
export function calculatePass2Score(
  pass1Score: number,
  factors: Partial<ProximityFactors>
): number {
  let score = pass1Score;

  // Shared companies bonus
  const sharedCompanies = factors.shared_companies_count || 0;
  score += Math.min(sharedCompanies * 5, 15);

  // Current company connection bonus
  if (factors.current_company_connection) {
    score += 10;
  }

  // Recent work overlap bonus (worked together in last 3 years)
  if (factors.worked_together_recently) {
    score += 10;
  }

  return Math.min(Math.round(score), 100);
}

/**
 * Update proximity score for a contact (Pass 1 - after ingestion/sync)
 */
export async function updateProximityScorePass1(
  supabase: SupabaseClient,
  contactId: string
): Promise<number> {
  // Fetch contact with interaction stats
  const { data: contact } = await supabase
    .from('contacts')
    .select(`
      id,
      connection_strength,
      interaction_count,
      inbound_email_count,
      outbound_email_count,
      meeting_count,
      last_interaction_at
    `)
    .eq('id', contactId)
    .single();

  if (!contact) {
    throw new Error(`Contact not found: ${contactId}`);
  }

  // Calculate days since last interaction
  let lastInteractionDaysAgo: number | null = null;
  if (contact.last_interaction_at) {
    const lastDate = new Date(contact.last_interaction_at);
    const now = new Date();
    lastInteractionDaysAgo = Math.floor(
      (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  const factors: Partial<ProximityFactors> = {
    swarm_connection_strength: contact.connection_strength || 0,
    email_count: (contact.inbound_email_count || 0) + (contact.outbound_email_count || 0),
    meeting_count: contact.meeting_count || 0,
    last_interaction_days_ago: lastInteractionDaysAgo,
  };

  const score = calculatePass1Score(factors);

  // Update the contact's proximity score
  await supabase
    .from('contacts')
    .update({ proximity_score: score })
    .eq('id', contactId);

  return score;
}

/**
 * Update proximity score for a contact (Pass 2 - after PDL enrichment)
 */
export async function updateProximityScorePass2(
  supabase: SupabaseClient,
  contactId: string,
  teamMemberCompanies: string[] // List of companies team members have worked at
): Promise<number> {
  // Fetch contact with work history
  const { data: contact } = await supabase
    .from('contacts')
    .select(`
      id,
      proximity_score,
      current_company,
      work_history (
        company_name,
        company_normalized,
        start_date,
        end_date,
        is_current
      )
    `)
    .eq('id', contactId)
    .single();

  if (!contact) {
    throw new Error(`Contact not found: ${contactId}`);
  }

  const pass1Score = contact.proximity_score || 0;
  const workHistory = contact.work_history || [];

  // Normalize team member companies for matching
  const normalizedTeamCompanies = teamMemberCompanies.map((c) => c.toLowerCase().trim());

  // Find shared companies
  const contactCompanies = workHistory.map(
    (w: { company_normalized?: string; company_name: string }) =>
      (w.company_normalized || w.company_name).toLowerCase().trim()
  );
  const sharedCompanies = contactCompanies.filter((c: string) => normalizedTeamCompanies.includes(c));

  // Check for current company connection
  const currentCompanyConnection = contact.current_company
    ? normalizedTeamCompanies.includes(contact.current_company.toLowerCase().trim())
    : false;

  // Check for recent work overlap (within last 3 years)
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const recentOverlap = workHistory.some((w: { company_normalized?: string; company_name: string; end_date?: string; is_current: boolean }) => {
    const companyNorm = (w.company_normalized || w.company_name).toLowerCase().trim();
    if (!normalizedTeamCompanies.includes(companyNorm)) return false;

    // Check if work was recent
    if (w.is_current) return true;
    if (w.end_date) {
      const endDate = new Date(w.end_date);
      return endDate >= threeYearsAgo;
    }
    return false;
  });

  const factors: Partial<ProximityFactors> = {
    shared_companies_count: sharedCompanies.length,
    current_company_connection: currentCompanyConnection,
    worked_together_recently: recentOverlap,
  };

  const score = calculatePass2Score(pass1Score, factors);

  // Update the contact's proximity score
  await supabase
    .from('contacts')
    .update({ proximity_score: score })
    .eq('id', contactId);

  return score;
}

/**
 * Batch update Pass 1 scores for all contacts in a team
 */
export async function batchUpdatePass1Scores(
  supabase: SupabaseClient,
  teamId: string
): Promise<{ updated: number; errors: number }> {
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id')
    .eq('team_id', teamId);

  if (!contacts) return { updated: 0, errors: 0 };

  let updated = 0;
  let errors = 0;

  for (const contact of contacts) {
    try {
      await updateProximityScorePass1(supabase, contact.id);
      updated++;
    } catch {
      errors++;
    }
  }

  return { updated, errors };
}
