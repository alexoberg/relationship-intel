// ============================================
// THE SWARM API INTEGRATION
// ============================================
// Provides connection mapping and relationship intelligence
// using The Swarm's 580M profile database
// Docs: https://docs.theswarm.com/docs/api-reference/introduction
// ============================================

const SWARM_API_BASE = 'https://bee.theswarm.com/v2';

// ============================================
// TYPES
// ============================================

export interface SwarmConnectionSource {
  origin: 'work_history' | 'education' | 'investor' | 'linkedin' | 'email' | 'calendar';
  company_name?: string;
  company_domain?: string;
  school_name?: string;
  relationship_type?: string;
  overlap_start?: string;
  overlap_end?: string;
}

export interface SwarmProfileInfo {
  full_name: string;
  first_name?: string;
  last_name?: string;
  linkedin_url?: string;
  current_title?: string;
  current_company?: string;
  current_company_website?: string;
  location?: string;
  headline?: string;
}

export interface SwarmConnection {
  profile_id: string;
  profile_info: SwarmProfileInfo;
  team_member_id: string;
  team_member_name: string;
  connection_strength: number; // 0-1 score
  sources: SwarmConnectionSource[];
}

export interface SwarmSearchResult {
  success: boolean;
  connections: SwarmConnection[];
  total_count: number;
  error?: string;
}

export interface SwarmCompanyResult {
  success: boolean;
  company_name: string;
  domain: string;
  employees: SwarmProfileInfo[];
  connected_employees: SwarmConnection[];
  total_employees: number;
  total_connected: number;
  error?: string;
}

export interface ConnectionPath {
  target_person: SwarmProfileInfo;
  connector: string; // Team member who has the connection
  connection_type: string;
  strength: number;
  shared_context: string; // e.g., "Worked together at Ticketmaster (2018-2020)"
}

// ============================================
// API CLIENT
// ============================================

async function swarmRequest<T>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<{ success: boolean; data?: T; error?: string; rawResponse?: unknown }> {
  const apiKey = process.env.SWARM_API_KEY;

  if (!apiKey) {
    return { success: false, error: 'SWARM_API_KEY not configured' };
  }

  try {
    console.log(`[Swarm] POST ${SWARM_API_BASE}${endpoint}`, JSON.stringify(body).slice(0, 200));

    const response = await fetch(`${SWARM_API_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    const rawText = await response.text();
    console.log(`[Swarm] Response ${response.status}: ${rawText.slice(0, 500)}`);

    if (!response.ok) {
      let errorData = {};
      try { errorData = JSON.parse(rawText); } catch {}
      return {
        success: false,
        error: `Swarm API error: ${response.status} - ${(errorData as { message?: string }).message || rawText.slice(0, 200)}`,
      };
    }

    const data = JSON.parse(rawText);
    return { success: true, data, rawResponse: data };
  } catch (error) {
    return {
      success: false,
      error: `Swarm request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ============================================
// RESPONSE PARSING
// ============================================

// Swarm API response types
interface SwarmNetworkMapperItem {
  profile: {
    id: string;
    full_name: string;
    current_title?: string;
    linkedin_url?: string;
    work_email?: string;
    current_company_name?: string;
    current_company_website?: string;
  };
  connections: Array<{
    connector_id: string;
    connector_name: string;
    connector_linkedin_url?: string;
    connector_current_title?: string;
    connector_current_company_name?: string;
    connection_strength: number;
    connection_strength_normalized: number;
    sources: Array<{
      origin: string;
      shared_company?: string;
      shared_company_website?: string;
      overlap_start_date?: string;
      overlap_end_date?: string;
      overlap_duration_months?: number;
    }>;
  }>;
}

interface SwarmNetworkMapperResponse {
  items: SwarmNetworkMapperItem[];
  count: number;
  total_count: number;
}

function parseSwarmResponse(result: { success: boolean; data?: unknown; error?: string }): SwarmSearchResult {
  if (!result.success) {
    return { success: false, connections: [], total_count: 0, error: result.error };
  }

  const data = result.data as SwarmNetworkMapperResponse;

  if (!data?.items || !Array.isArray(data.items)) {
    console.log('[Swarm] No items array in response');
    return { success: true, connections: [], total_count: 0 };
  }

  // Transform Swarm network-mapper response to our SwarmConnection format
  const connections: SwarmConnection[] = data.items.flatMap(item => {
    return item.connections.map(conn => ({
      profile_id: item.profile.id,
      profile_info: {
        full_name: item.profile.full_name,
        first_name: item.profile.full_name.split(' ')[0],
        last_name: item.profile.full_name.split(' ').slice(1).join(' '),
        linkedin_url: item.profile.linkedin_url,
        current_title: item.profile.current_title,
        current_company: item.profile.current_company_name,
        current_company_website: item.profile.current_company_website,
      },
      team_member_id: conn.connector_id,
      team_member_name: conn.connector_name,
      connection_strength: conn.connection_strength,
      sources: conn.sources.map(src => ({
        origin: src.origin as SwarmConnectionSource['origin'],
        company_name: src.shared_company,
        company_domain: src.shared_company_website,
        overlap_start: src.overlap_start_date,
        overlap_end: src.overlap_end_date,
      })),
    }));
  });

  console.log(`[Swarm] Parsed ${connections.length} connections from ${data.items.length} profiles`);

  return {
    success: true,
    connections,
    total_count: data.total_count || connections.length,
  };
}

// ============================================
// SEARCH FUNCTIONS
// ============================================

/**
 * Search for connections at a specific company by domain
 */
export async function searchByCompany(domain: string): Promise<SwarmSearchResult> {
  // Clean domain and extract company name hint
  // e.g., "livenationentertainment.com" -> "livenation entertainment"
  // e.g., "ticketmaster.com" -> "ticketmaster"
  let searchTerm = domain.toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\.com$|\.io$|\.co$|\.ai$|\.org$|\.net$/, '')
    .replace(/entertainment$/, '') // Remove common suffixes
    .replace(/inc$|corp$|llc$/, '')
    .trim();

  // Add spaces between camelCase or known compound words
  searchTerm = searchTerm
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/livenation/, 'live nation')
    .replace(/ticketmaster/, 'ticketmaster');

  console.log(`[Swarm] Searching for company: "${searchTerm}" (from domain: ${domain})`);

  const result = await swarmRequest<unknown>(
    '/profiles/network-mapper',
    {
      query: {
        query_string: {
          query: searchTerm,
        },
      },
      size: 50,
    }
  );

  return parseSwarmResponse(result);
}

/**
 * Search for connections with specific job titles at a company
 */
export async function searchByCompanyAndTitle(
  domain: string,
  titleKeywords: string[]
): Promise<SwarmSearchResult> {
  // Clean domain and build search query with company + titles
  const cleanDomain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\.com$|\.io$|\.co$|\.ai$/, '');
  const titlesQuery = titleKeywords.join(' OR ');
  const searchQuery = `${cleanDomain} AND (${titlesQuery})`;

  const result = await swarmRequest<unknown>(
    '/profiles/network-mapper',
    {
      query: {
        query_string: {
          query: searchQuery,
        },
      },
      size: 50,
    }
  );

  return parseSwarmResponse(result);
}

/**
 * Search for a specific person by name and optionally company
 */
export async function searchPerson(
  name: string,
  company?: string
): Promise<SwarmSearchResult> {
  const must: Array<Record<string, unknown>> = [
    {
      match: {
        'full_name': {
          query: name,
          fuzziness: 'AUTO',
        },
      },
    },
  ];

  if (company) {
    must.push({
      match: {
        'current_company_name': {
          query: company,
          fuzziness: 'AUTO',
        },
      },
    });
  }

  const result = await swarmRequest<unknown>(
    '/profiles/network-mapper',
    {
      query: {
        bool: { must },
      },
      size: 20,
    }
  );

  return parseSwarmResponse(result);
}

/**
 * Search by LinkedIn URL
 */
export async function searchByLinkedIn(linkedinUrl: string): Promise<SwarmSearchResult> {
  // Normalize LinkedIn URL - extract the profile slug
  const cleanUrl = linkedinUrl
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');

  const result = await swarmRequest<unknown>(
    '/profiles/network-mapper',
    {
      query: {
        bool: {
          should: [
            { wildcard: { 'linkedin_url': `*${cleanUrl}*` } },
          ],
          minimum_should_match: 1,
        },
      },
      size: 10,
    }
  );

  return parseSwarmResponse(result);
}

// ============================================
// CONNECTION PATH ANALYSIS
// ============================================

/**
 * Find the best connection paths to reach someone at a target company
 * Returns paths sorted by connection strength
 */
export async function findConnectionPaths(
  targetDomain: string,
  targetTitles?: string[]
): Promise<ConnectionPath[]> {
  const searchResult = targetTitles
    ? await searchByCompanyAndTitle(targetDomain, targetTitles)
    : await searchByCompany(targetDomain);

  if (!searchResult.success || searchResult.connections.length === 0) {
    return [];
  }

  const paths: ConnectionPath[] = searchResult.connections.map(conn => {
    // Build shared context string from connection sources
    const contexts = conn.sources.map(source => {
      if (source.origin === 'work_history' && source.company_name) {
        const period = source.overlap_start && source.overlap_end
          ? ` (${source.overlap_start.slice(0, 4)}-${source.overlap_end.slice(0, 4)})`
          : '';
        return `Worked together at ${source.company_name}${period}`;
      }
      if (source.origin === 'education' && source.school_name) {
        return `Attended ${source.school_name} together`;
      }
      if (source.origin === 'linkedin') {
        return 'LinkedIn connection';
      }
      if (source.origin === 'email') {
        return 'Email correspondence';
      }
      if (source.origin === 'calendar') {
        return 'Met in meetings';
      }
      return source.origin;
    });

    return {
      target_person: conn.profile_info,
      connector: conn.team_member_name,
      connection_type: conn.sources[0]?.origin || 'unknown',
      strength: conn.connection_strength,
      shared_context: contexts.join('; '),
    };
  });

  // Sort by strength descending
  paths.sort((a, b) => b.strength - a.strength);

  return paths;
}

// ============================================
// HELIX PROSPECT INTEGRATION
// ============================================

/**
 * For a list of target companies (Helix prospects), find all connection paths
 * Returns companies ranked by connection strength
 */
export interface ProspectConnection {
  company_name: string;
  company_domain: string;
  best_path: ConnectionPath | null;
  all_paths: ConnectionPath[];
  connection_score: number; // 0-100 aggregated score
  has_warm_intro: boolean;
}

export async function findProspectConnections(
  prospects: Array<{ name: string; domain: string; targetTitles?: string[] }>
): Promise<ProspectConnection[]> {
  const results: ProspectConnection[] = [];

  for (const prospect of prospects) {
    const paths = await findConnectionPaths(prospect.domain, prospect.targetTitles);
    
    // Calculate aggregated connection score
    let connectionScore = 0;
    if (paths.length > 0) {
      // Weight by strength and number of paths
      const avgStrength = paths.reduce((sum, p) => sum + p.strength, 0) / paths.length;
      const pathBonus = Math.min(paths.length * 5, 30); // Max 30 point bonus for multiple paths
      connectionScore = Math.round(avgStrength * 70 + pathBonus);
    }

    results.push({
      company_name: prospect.name,
      company_domain: prospect.domain,
      best_path: paths[0] || null,
      all_paths: paths,
      connection_score: connectionScore,
      has_warm_intro: paths.some(p => p.strength >= 0.7),
    });

    // Rate limit: avoid hammering the API
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // Sort by connection score descending
  results.sort((a, b) => b.connection_score - a.connection_score);

  return results;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if API is configured and working
 */
export async function testSwarmConnection(): Promise<{ connected: boolean; error?: string }> {
  const apiKey = process.env.SWARM_API_KEY;
  
  if (!apiKey) {
    return { connected: false, error: 'SWARM_API_KEY environment variable not set' };
  }

  // Try a simple search to verify connection
  const result = await searchByCompany('theswarm.com');
  
  if (!result.success) {
    return { connected: false, error: result.error };
  }

  return { connected: true };
}
