// ============================================
// PROSPECT MATCHING SERVICE
// ============================================
// Matches our contacts to prospects (target companies)
// This is OUR logic, not Swarm's - we do the matching
// ============================================

import { createAdminClient } from '@/lib/supabase/admin';

// ============================================
// TYPES
// ============================================

export interface ContactMatch {
  contactId: string;
  contactName: string;
  contactTitle: string | null;
  contactEmail: string | null;
  contactLinkedIn: string | null;
  connectionStrength: number;
  connectorName: string | null;
  matchReason: string;
  titleRelevance: number; // 0-1 how relevant their title is
}

export interface ProspectMatchResult {
  prospectId: string;
  prospectName: string;
  companyDomain: string;
  matches: ContactMatch[];
  bestMatch: ContactMatch | null;
  connectionScore: number; // 0-100
  hasWarmIntro: boolean;
}

// Title relevance keywords for Helix products
const HELIX_TARGET_TITLES = [
  // Trust & Safety
  { keywords: ['trust', 'safety', 'fraud', 'risk', 'abuse', 'compliance'], weight: 1.0 },
  // Identity / Auth
  { keywords: ['identity', 'authentication', 'auth', 'security', 'verification'], weight: 1.0 },
  // Product leadership
  { keywords: ['vp product', 'head of product', 'cpo', 'chief product'], weight: 0.9 },
  // Engineering leadership
  { keywords: ['vp engineering', 'head of engineering', 'cto', 'chief technology'], weight: 0.8 },
  // General leadership
  { keywords: ['ceo', 'coo', 'founder', 'co-founder'], weight: 0.7 },
  // Product managers
  { keywords: ['product manager', 'pm', 'product lead'], weight: 0.6 },
  // Engineers
  { keywords: ['engineer', 'developer', 'software'], weight: 0.4 },
];

// ============================================
// MATCHING LOGIC
// ============================================

/**
 * Calculate how relevant a contact's title is for Helix products
 */
function calculateTitleRelevance(title: string | null): number {
  if (!title) return 0;

  const lowerTitle = title.toLowerCase();

  for (const category of HELIX_TARGET_TITLES) {
    if (category.keywords.some(kw => lowerTitle.includes(kw))) {
      return category.weight;
    }
  }

  return 0.1; // Base relevance for any contact
}

/**
 * Match a single prospect to contacts in our network
 */
export async function matchProspectToContacts(
  teamId: string,
  prospectId: string
): Promise<ProspectMatchResult | null> {
  const supabase = createAdminClient();

  // Get prospect details
  const { data: prospect } = await supabase
    .from('prospects')
    .select('*')
    .eq('id', prospectId)
    .single();

  if (!prospect) return null;

  // Find contacts at this company (by domain or company name)
  const { data: contacts } = await supabase
    .from('contacts')
    .select(`
      id,
      full_name,
      current_title,
      email,
      linkedin_url,
      company_domain,
      current_company,
      contact_connections (
        connector_name,
        connection_strength
      )
    `)
    .eq('team_id', teamId)
    .or(`company_domain.eq.${prospect.company_domain},current_company.ilike.%${prospect.name}%`);

  const matches: ContactMatch[] = [];

  for (const contact of contacts || []) {
    const titleRelevance = calculateTitleRelevance(contact.current_title);
    const connections = contact.contact_connections || [];
    const bestConnection = connections.sort((a: { connection_strength: number }, b: { connection_strength: number }) =>
      b.connection_strength - a.connection_strength
    )[0];

    const connectionStrength = bestConnection?.connection_strength || 0;

    matches.push({
      contactId: contact.id,
      contactName: contact.full_name,
      contactTitle: contact.current_title,
      contactEmail: contact.email,
      contactLinkedIn: contact.linkedin_url,
      connectionStrength,
      connectorName: bestConnection?.connector_name || null,
      matchReason: contact.company_domain === prospect.company_domain
        ? 'Domain match'
        : 'Company name match',
      titleRelevance,
    });
  }

  // Sort by combined score (connection strength + title relevance)
  matches.sort((a, b) => {
    const scoreA = a.connectionStrength * 0.6 + a.titleRelevance * 0.4;
    const scoreB = b.connectionStrength * 0.6 + b.titleRelevance * 0.4;
    return scoreB - scoreA;
  });

  // Calculate overall connection score
  let connectionScore = 0;
  if (matches.length > 0) {
    const avgStrength = matches.reduce((sum, m) => sum + m.connectionStrength, 0) / matches.length;
    const avgRelevance = matches.reduce((sum, m) => sum + m.titleRelevance, 0) / matches.length;
    const matchBonus = Math.min(matches.length * 5, 30); // Max 30 points for multiple matches
    connectionScore = Math.round((avgStrength * 50 + avgRelevance * 20 + matchBonus));
  }

  return {
    prospectId: prospect.id,
    prospectName: prospect.name,
    companyDomain: prospect.company_domain,
    matches: matches.slice(0, 10), // Top 10 matches
    bestMatch: matches[0] || null,
    connectionScore,
    hasWarmIntro: matches.some(m => m.connectionStrength >= 0.7),
  };
}

/**
 * Match all prospects to contacts and update database
 */
export async function runProspectMatching(
  teamId: string,
  options?: { prospectIds?: string[] }
): Promise<{
  processed: number;
  matched: number;
  errors: string[];
}> {
  const supabase = createAdminClient();

  // Get prospects to match
  let query = supabase
    .from('prospects')
    .select('id')
    .eq('team_id', teamId);

  if (options?.prospectIds) {
    query = query.in('id', options.prospectIds);
  }

  const { data: prospects } = await query;

  const result = {
    processed: 0,
    matched: 0,
    errors: [] as string[],
  };

  for (const prospect of prospects || []) {
    try {
      const matchResult = await matchProspectToContacts(teamId, prospect.id);

      if (!matchResult) {
        result.errors.push(`Prospect ${prospect.id}: not found`);
        continue;
      }

      result.processed++;

      if (matchResult.matches.length > 0) {
        result.matched++;

        // Update prospect with match data
        const bestMatch = matchResult.bestMatch;
        await supabase
          .from('prospects')
          .update({
            connection_score: matchResult.connectionScore,
            best_connection_path: bestMatch ? {
              connector: bestMatch.connectorName,
              target: bestMatch.contactName,
              target_title: bestMatch.contactTitle,
              strength: bestMatch.connectionStrength,
              context: bestMatch.matchReason,
            } : null,
            all_connection_paths: matchResult.matches.map(m => ({
              connector: m.connectorName,
              target: m.contactName,
              target_title: m.contactTitle,
              strength: m.connectionStrength,
              context: m.matchReason,
            })),
            matched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', prospect.id);

        // Store individual matches for easy querying
        for (const match of matchResult.matches) {
          await supabase
            .from('prospect_connections')
            .upsert({
              prospect_id: prospect.id,
              contact_id: match.contactId,
              target_name: match.contactName,
              target_title: match.contactTitle,
              target_email: match.contactEmail,
              target_linkedin_url: match.contactLinkedIn,
              connector_name: match.connectorName,
              connection_strength: match.connectionStrength,
              shared_context: match.matchReason,
            }, {
              onConflict: 'prospect_id,contact_id',
            });
        }
      }
    } catch (error) {
      result.errors.push(
        `Prospect ${prospect.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  console.log(`[Prospect Matching] Processed ${result.processed}, matched ${result.matched}, errors ${result.errors.length}`);
  return result;
}
