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
): Promise<{ success: boolean; data?: T; error?: string }> {
  const apiKey = process.env.SWARM_API_KEY;

  if (!apiKey) {
    return { success: false, error: 'SWARM_API_KEY not configured' };
  }

  try {
    const response = await fetch(`${SWARM_API_BASE}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: `Swarm API error: ${response.status} - ${errorData.message || 'Unknown error'}`,
      };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: `Swarm request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// ============================================
// SEARCH FUNCTIONS
// ============================================

/**
 * Search for connections at a specific company by domain
 */
export async function searchByCompany(domain: string): Promise<SwarmSearchResult> {
  const result = await swarmRequest<{ hits: { hits: Array<{ _source: SwarmConnection }> }; total: number }>(
    '/profiles/network-mapper',
    {
      query: {
        term: {
          'profile_info.current_company_website': {
            value: domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, ''),
          },
        },
      },
      size: 100,
    }
  );

  if (!result.success) {
    return { success: false, connections: [], total_count: 0, error: result.error };
  }

  const connections = result.data?.hits?.hits?.map(hit => hit._source) || [];
  
  return {
    success: true,
    connections,
    total_count: result.data?.total || connections.length,
  };
}

/**
 * Search for connections with specific job titles at a company
 */
export async function searchByCompanyAndTitle(
  domain: string,
  titleKeywords: string[]
): Promise<SwarmSearchResult> {
  const titleShould = titleKeywords.map(keyword => ({
    match: {
      'profile_info.current_title': {
        query: keyword,
        fuzziness: 'AUTO',
      },
    },
  }));

  const result = await swarmRequest<{ hits: { hits: Array<{ _source: SwarmConnection }> }; total: number }>(
    '/profiles/network-mapper',
    {
      query: {
        bool: {
          must: [
            {
              term: {
                'profile_info.current_company_website': {
                  value: domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, ''),
                },
              },
            },
          ],
          should: titleShould,
          minimum_should_match: 1,
        },
      },
      size: 100,
    }
  );

  if (!result.success) {
    return { success: false, connections: [], total_count: 0, error: result.error };
  }

  const connections = result.data?.hits?.hits?.map(hit => hit._source) || [];
  
  return {
    success: true,
    connections,
    total_count: result.data?.total || connections.length,
  };
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
        'profile_info.full_name': {
          query: name,
          fuzziness: 'AUTO',
        },
      },
    },
  ];

  if (company) {
    must.push({
      match: {
        'profile_info.current_company': {
          query: company,
          fuzziness: 'AUTO',
        },
      },
    });
  }

  const result = await swarmRequest<{ hits: { hits: Array<{ _source: SwarmConnection }> }; total: number }>(
    '/profiles/network-mapper',
    {
      query: {
        bool: { must },
      },
      size: 20,
    }
  );

  if (!result.success) {
    return { success: false, connections: [], total_count: 0, error: result.error };
  }

  const connections = result.data?.hits?.hits?.map(hit => hit._source) || [];
  
  return {
    success: true,
    connections,
    total_count: result.data?.total || connections.length,
  };
}

/**
 * Search by LinkedIn URL
 */
export async function searchByLinkedIn(linkedinUrl: string): Promise<SwarmSearchResult> {
  // Normalize LinkedIn URL
  const cleanUrl = linkedinUrl
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');

  const result = await swarmRequest<{ hits: { hits: Array<{ _source: SwarmConnection }> }; total: number }>(
    '/profiles/network-mapper',
    {
      query: {
        term: {
          'profile_info.linkedin_url': {
            value: cleanUrl,
          },
        },
      },
      size: 10,
    }
  );

  if (!result.success) {
    return { success: false, connections: [], total_count: 0, error: result.error };
  }

  const connections = result.data?.hits?.hits?.map(hit => hit._source) || [];
  
  return {
    success: true,
    connections,
    total_count: result.data?.total || connections.length,
  };
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
