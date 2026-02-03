// ============================================
// HN USERS DATABASE OPERATIONS
// ============================================
// Persistent tracking of HN user profiles for deduplication
// and enrichment across scan runs.

import { createAdminClient } from '@/lib/supabase/admin';
import { HNUserCompanyInfo, HNUser } from '../types';
import { logger, metrics, timeAsync } from '../instrumentation';

// ============================================
// TYPES
// ============================================

export interface ListenerHNUser {
  id: string;
  hn_username: string;
  hn_karma: number | null;
  hn_created_at: string | null;
  company_domain: string | null;
  company_name: string | null;
  extraction_confidence: number | null;
  extraction_source: string | null;
  raw_about: string | null;
  linkedin_url: string | null;
  twitter_handle: string | null;
  github_username: string | null;
  personal_website: string | null;
  first_seen_at: string;
  last_scanned_at: string;
  scan_count: number;
  discoveries_created: number;
  last_story_id: number | null;
  last_story_title: string | null;
  is_excluded: boolean;
  exclusion_reason: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// CREATE/UPDATE OPERATIONS
// ============================================

/**
 * Upsert an HN user with extracted company info
 * Uses a single query with RPC for atomic scan_count increment
 */
export async function upsertHNUser(
  user: HNUser,
  companyInfo: HNUserCompanyInfo,
  storyContext?: { storyId: number; storyTitle: string }
): Promise<ListenerHNUser | null> {
  const { result, durationMs } = await timeAsync(
    'upsertHNUser',
    async () => {
      const supabase = createAdminClient();

      const upsertData = {
        hn_username: user.id,
        hn_karma: user.karma,
        hn_created_at: user.created ? new Date(user.created * 1000).toISOString() : null,
        company_domain: companyInfo.companyDomain,
        company_name: companyInfo.companyName,
        extraction_confidence: companyInfo.confidence,
        extraction_source: companyInfo.source,
        raw_about: companyInfo.rawAbout,
        linkedin_url: companyInfo.linkedinUrl || null,
        twitter_handle: companyInfo.twitterHandle || null,
        github_username: companyInfo.githubUsername || null,
        last_scanned_at: new Date().toISOString(),
        ...(storyContext && {
          last_story_id: storyContext.storyId,
          last_story_title: storyContext.storyTitle,
        }),
      };

      // First, try to use RPC for atomic upsert with increment (if available)
      const { data: rpcData, error: rpcError } = await supabase.rpc('upsert_hn_user_with_increment', {
        p_data: upsertData,
      });

      if (!rpcError && rpcData) {
        return rpcData as ListenerHNUser;
      }

      // Fall back to regular upsert + update (2 queries, but handles missing RPC)
      const { data, error } = await supabase
        .from('listener_hn_users')
        .upsert(upsertData, {
          onConflict: 'hn_username',
          ignoreDuplicates: false,
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to upsert HN user', error, { username: user.id });
        return null;
      }

      // Increment scan count in a separate query (non-critical if it fails)
      if (data) {
        supabase
          .from('listener_hn_users')
          .update({ scan_count: (data.scan_count || 1) + 1 })
          .eq('id', data.id)
          .then(() => {}, () => {}); // Ignore result and errors
      }

      return data as ListenerHNUser;
    },
    { username: user.id }
  );

  metrics.record('db_upsert_user_ms', durationMs);
  metrics.increment('db_users_upserted');

  return result;
}

/**
 * Bulk upsert HN users
 */
export async function upsertHNUsers(
  users: Array<{ user: HNUser; companyInfo: HNUserCompanyInfo; storyContext?: { storyId: number; storyTitle: string } }>
): Promise<{ upserted: number; errors: number }> {
  const results = { upserted: 0, errors: 0 };

  for (const { user, companyInfo, storyContext } of users) {
    const result = await upsertHNUser(user, companyInfo, storyContext);
    if (result) {
      results.upserted++;
    } else {
      results.errors++;
    }
  }

  return results;
}

/**
 * Increment discoveries_created count for a user
 */
export async function incrementDiscoveryCount(username: string): Promise<void> {
  const supabase = createAdminClient();

  // Try to use RPC if it exists, otherwise fall back to manual increment
  const { error } = await supabase.rpc('increment_hn_user_discovery_count', { p_username: username });

  if (error) {
    // Fall back to manual increment if RPC doesn't exist
    const { data: user } = await supabase
      .from('listener_hn_users')
      .select('discoveries_created')
      .eq('hn_username', username)
      .single();

    if (user) {
      await supabase
        .from('listener_hn_users')
        .update({ discoveries_created: (user.discoveries_created || 0) + 1 })
        .eq('hn_username', username);
    }
  }
}

// ============================================
// READ OPERATIONS
// ============================================

/**
 * Get an HN user by username
 */
export async function getHNUser(username: string): Promise<ListenerHNUser | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('listener_hn_users')
    .select('*')
    .eq('hn_username', username)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('Failed to get HN user:', error);
    return null;
  }

  return data as ListenerHNUser;
}

/**
 * Get multiple HN users by username
 */
export async function getHNUsers(usernames: string[]): Promise<Map<string, ListenerHNUser>> {
  const supabase = createAdminClient();
  const users = new Map<string, ListenerHNUser>();

  if (usernames.length === 0) return users;

  const { data, error } = await supabase
    .from('listener_hn_users')
    .select('*')
    .in('hn_username', usernames);

  if (error) {
    console.error('Failed to get HN users:', error);
    return users;
  }

  for (const user of data || []) {
    users.set(user.hn_username, user as ListenerHNUser);
  }

  return users;
}

/**
 * Get users that were scanned recently (for deduplication)
 */
export async function getRecentlyScannedUsers(
  usernames: string[],
  withinHours: number = 168 // 7 days
): Promise<Set<string>> {
  const supabase = createAdminClient();
  const recentUsers = new Set<string>();

  if (usernames.length === 0) return recentUsers;

  const cutoffDate = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('listener_hn_users')
    .select('hn_username')
    .in('hn_username', usernames)
    .gte('last_scanned_at', cutoffDate);

  if (error) {
    console.error('Failed to get recently scanned users:', error);
    return recentUsers;
  }

  for (const user of data || []) {
    recentUsers.add(user.hn_username);
  }

  return recentUsers;
}

/**
 * Get users with extracted company info
 */
export async function getUsersWithCompanies(params: {
  minKarma?: number;
  minConfidence?: number;
  limit?: number;
  offset?: number;
}): Promise<{ users: ListenerHNUser[]; total: number }> {
  const supabase = createAdminClient();

  let query = supabase
    .from('listener_hn_users')
    .select('*', { count: 'exact' })
    .not('company_domain', 'is', null)
    .eq('is_excluded', false);

  if (params.minKarma !== undefined) {
    query = query.gte('hn_karma', params.minKarma);
  }

  if (params.minConfidence !== undefined) {
    query = query.gte('extraction_confidence', params.minConfidence);
  }

  query = query.order('last_scanned_at', { ascending: false });

  if (params.limit) {
    query = query.limit(params.limit);
  }

  if (params.offset) {
    query = query.range(params.offset, params.offset + (params.limit || 50) - 1);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('Failed to get users with companies:', error);
    return { users: [], total: 0 };
  }

  return {
    users: (data || []) as ListenerHNUser[],
    total: count || 0,
  };
}

/**
 * Get excluded users
 */
export async function getExcludedUsers(): Promise<ListenerHNUser[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('listener_hn_users')
    .select('*')
    .eq('is_excluded', true);

  if (error) {
    console.error('Failed to get excluded users:', error);
    return [];
  }

  return (data || []) as ListenerHNUser[];
}

// ============================================
// UPDATE OPERATIONS
// ============================================

/**
 * Exclude a user from future scans
 */
export async function excludeUser(username: string, reason: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('listener_hn_users')
    .update({
      is_excluded: true,
      exclusion_reason: reason,
    })
    .eq('hn_username', username);

  if (error) {
    console.error('Failed to exclude user:', error);
    return false;
  }

  return true;
}

/**
 * Update LinkedIn URL for a user
 */
export async function updateLinkedInUrl(username: string, linkedinUrl: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('listener_hn_users')
    .update({ linkedin_url: linkedinUrl })
    .eq('hn_username', username);

  if (error) {
    console.error('Failed to update LinkedIn URL:', error);
    return false;
  }

  return true;
}

/**
 * Update social profiles for a user
 */
export async function updateSocialProfiles(
  username: string,
  profiles: {
    linkedinUrl?: string;
    twitterHandle?: string;
    githubUsername?: string;
    personalWebsite?: string;
  }
): Promise<boolean> {
  const supabase = createAdminClient();

  const updateData: Record<string, string | null> = {};
  if (profiles.linkedinUrl !== undefined) updateData.linkedin_url = profiles.linkedinUrl;
  if (profiles.twitterHandle !== undefined) updateData.twitter_handle = profiles.twitterHandle;
  if (profiles.githubUsername !== undefined) updateData.github_username = profiles.githubUsername;
  if (profiles.personalWebsite !== undefined) updateData.personal_website = profiles.personalWebsite;

  if (Object.keys(updateData).length === 0) return true;

  const { error } = await supabase
    .from('listener_hn_users')
    .update(updateData)
    .eq('hn_username', username);

  if (error) {
    console.error('Failed to update social profiles:', error);
    return false;
  }

  return true;
}

// ============================================
// DEDUPLICATION HELPERS
// ============================================

/**
 * Check if we should create a discovery for this domain
 * (checks both existing prospects and recent discoveries in parallel)
 */
export async function shouldCreateDiscovery(
  domain: string,
  teamId: string
): Promise<{ create: boolean; reason: string; existingId?: string }> {
  const { result, durationMs } = await timeAsync(
    'shouldCreateDiscovery',
    async () => {
      const supabase = createAdminClient();
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Run both checks in parallel for better performance
      const [prospectResult, discoveryResult] = await Promise.all([
        supabase
          .from('prospects')
          .select('id')
          .eq('company_domain', domain)
          .eq('team_id', teamId)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('listener_discoveries')
          .select('id')
          .eq('company_domain', domain)
          .neq('status', 'dismissed')
          .gte('discovered_at', sevenDaysAgo)
          .limit(1)
          .maybeSingle(),
      ]);

      if (prospectResult.data) {
        return { create: false, reason: 'already_prospect', existingId: prospectResult.data.id };
      }

      if (discoveryResult.data) {
        return { create: false, reason: 'recent_discovery', existingId: discoveryResult.data.id };
      }

      return { create: true, reason: 'new' };
    },
    { domain }
  );

  metrics.record('db_should_create_discovery_ms', durationMs);

  return result;
}

// ============================================
// STATS
// ============================================

/**
 * Get HN user tracking stats using efficient SQL aggregation
 */
export async function getHNUserStats(): Promise<{
  total: number;
  withCompany: number;
  withLinkedIn: number;
  excluded: number;
  scannedLast24h: number;
  scannedLast7d: number;
  avgKarma: number;
}> {
  const { result, durationMs } = await timeAsync('getHNUserStats', async () => {
    const supabase = createAdminClient();

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Try to use RPC for efficient aggregation (single query)
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_hn_user_stats', {
      p_one_day_ago: oneDayAgo,
      p_seven_days_ago: sevenDaysAgo,
    });

    if (!rpcError && rpcData) {
      return rpcData as {
        total: number;
        withCompany: number;
        withLinkedIn: number;
        excluded: number;
        scannedLast24h: number;
        scannedLast7d: number;
        avgKarma: number;
      };
    }

    // Fallback: Run multiple count queries in parallel (still better than fetching all rows)
    const [
      totalResult,
      withCompanyResult,
      withLinkedInResult,
      excludedResult,
      scannedLast24hResult,
      scannedLast7dResult,
      avgKarmaResult,
    ] = await Promise.all([
      supabase.from('listener_hn_users').select('*', { count: 'exact', head: true }),
      supabase.from('listener_hn_users').select('*', { count: 'exact', head: true }).not('company_domain', 'is', null),
      supabase.from('listener_hn_users').select('*', { count: 'exact', head: true }).not('linkedin_url', 'is', null),
      supabase.from('listener_hn_users').select('*', { count: 'exact', head: true }).eq('is_excluded', true),
      supabase.from('listener_hn_users').select('*', { count: 'exact', head: true }).gte('last_scanned_at', oneDayAgo),
      supabase.from('listener_hn_users').select('*', { count: 'exact', head: true }).gte('last_scanned_at', sevenDaysAgo),
      // For avg karma, we need to fetch values (but only karma column)
      supabase.from('listener_hn_users').select('hn_karma').not('hn_karma', 'is', null),
    ]);

    // Calculate average karma from fetched values
    let avgKarma = 0;
    if (avgKarmaResult.data && avgKarmaResult.data.length > 0) {
      const total = avgKarmaResult.data.reduce((sum, u) => sum + (u.hn_karma || 0), 0);
      avgKarma = Math.round(total / avgKarmaResult.data.length);
    }

    return {
      total: totalResult.count || 0,
      withCompany: withCompanyResult.count || 0,
      withLinkedIn: withLinkedInResult.count || 0,
      excluded: excludedResult.count || 0,
      scannedLast24h: scannedLast24hResult.count || 0,
      scannedLast7d: scannedLast7dResult.count || 0,
      avgKarma,
    };
  });

  metrics.record('db_get_stats_ms', durationMs);

  return result;
}
