// ============================================
// DISCOVERIES DATABASE OPERATIONS
// ============================================

import { createAdminClient } from '@/lib/supabase/admin';
import {
  ListenerDiscovery,
  DiscoveryCandidate,
  DiscoveryResult,
  ListenerDiscoveryStatus,
} from '../types';

// ============================================
// CREATE OPERATIONS
// ============================================

/**
 * Create a new discovery (with deduplication)
 * Returns the discovery ID if created, or existing ID if duplicate
 */
export async function createDiscovery(
  candidate: DiscoveryCandidate,
  teamId: string,
  autoPromoteThreshold: number = 80
): Promise<DiscoveryResult> {
  const supabase = createAdminClient();

  try {
    // Check for existing discovery with same domain + source URL
    const { data: existing } = await supabase
      .from('listener_discoveries')
      .select('id, confidence_score, status')
      .eq('company_domain', candidate.companyDomain)
      .eq('source_url', candidate.sourceUrl)
      .single();

    if (existing) {
      // Already exists - check if we should update
      if (candidate.confidenceScore > existing.confidence_score) {
        // Update with higher confidence score
        await supabase
          .from('listener_discoveries')
          .update({
            confidence_score: candidate.confidenceScore,
            keywords_matched: candidate.keywordsMatched,
            helix_products: candidate.helixProducts,
            trigger_text: candidate.triggerText,
          })
          .eq('id', existing.id);
      }

      return {
        success: true,
        discoveryId: existing.id,
        status: 'duplicate',
      };
    }

    // Create new discovery
    const { data: discovery, error } = await supabase
      .from('listener_discoveries')
      .insert({
        company_domain: candidate.companyDomain,
        company_name: candidate.companyName || null,
        source_type: candidate.sourceType,
        source_url: candidate.sourceUrl,
        source_title: candidate.sourceTitle || null,
        trigger_text: candidate.triggerText,
        keywords_matched: candidate.keywordsMatched,
        keyword_category: candidate.keywordCategory || null,
        confidence_score: candidate.confidenceScore,
        helix_products: candidate.helixProducts,
        source_published_at: candidate.sourcePublishedAt?.toISOString() || null,
      })
      .select('id')
      .single();

    if (error) {
      // Handle unique constraint violation (race condition)
      if (error.code === '23505') {
        return {
          success: true,
          status: 'duplicate',
        };
      }
      throw error;
    }

    // Check if we should auto-promote
    if (candidate.confidenceScore >= autoPromoteThreshold) {
      const promoteResult = await promoteDiscovery(discovery.id, teamId);
      if (promoteResult.success) {
        return {
          success: true,
          discoveryId: discovery.id,
          status: 'auto_promoted',
          prospectId: promoteResult.prospectId,
        };
      }
    }

    return {
      success: true,
      discoveryId: discovery.id,
      status: 'created',
    };
  } catch (error) {
    console.error('Failed to create discovery:', error);
    return {
      success: false,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Bulk create discoveries
 */
export async function createDiscoveries(
  candidates: DiscoveryCandidate[],
  teamId: string
): Promise<{ created: number; duplicates: number; autoPromoted: number; errors: number }> {
  const results = {
    created: 0,
    duplicates: 0,
    autoPromoted: 0,
    errors: 0,
  };

  for (const candidate of candidates) {
    const result = await createDiscovery(candidate, teamId);

    if (!result.success) {
      results.errors++;
    } else if (result.status === 'duplicate') {
      results.duplicates++;
    } else if (result.status === 'auto_promoted') {
      results.autoPromoted++;
      results.created++;
    } else {
      results.created++;
    }
  }

  return results;
}

// ============================================
// READ OPERATIONS
// ============================================

/**
 * Get a discovery by ID
 */
export async function getDiscovery(id: string): Promise<ListenerDiscovery | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('listener_discoveries')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }

  return data as ListenerDiscovery;
}

/**
 * List discoveries with filters
 */
export async function listDiscoveries(params: {
  status?: ListenerDiscoveryStatus | ListenerDiscoveryStatus[];
  sourceType?: string;
  minConfidence?: number;
  limit?: number;
  offset?: number;
  orderBy?: 'confidence_score' | 'discovered_at';
  orderDir?: 'asc' | 'desc';
}): Promise<{ discoveries: ListenerDiscovery[]; total: number }> {
  const supabase = createAdminClient();

  let query = supabase.from('listener_discoveries').select('*', { count: 'exact' });

  // Apply filters
  if (params.status) {
    if (Array.isArray(params.status)) {
      query = query.in('status', params.status);
    } else {
      query = query.eq('status', params.status);
    }
  }

  if (params.sourceType) {
    query = query.eq('source_type', params.sourceType);
  }

  if (params.minConfidence !== undefined) {
    query = query.gte('confidence_score', params.minConfidence);
  }

  // Ordering
  const orderBy = params.orderBy || 'discovered_at';
  const orderDir = params.orderDir || 'desc';
  query = query.order(orderBy, { ascending: orderDir === 'asc' });

  // Pagination
  const limit = params.limit || 50;
  const offset = params.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    discoveries: (data || []) as ListenerDiscovery[],
    total: count || 0,
  };
}

/**
 * Check if domain already exists as a discovery or prospect
 */
export async function checkDomainExists(
  domain: string,
  teamId: string
): Promise<{ inDiscoveries: boolean; inProspects: boolean; prospectId?: string }> {
  const supabase = createAdminClient();

  // Check discoveries
  const { data: discovery } = await supabase
    .from('listener_discoveries')
    .select('id')
    .eq('company_domain', domain)
    .not('status', 'eq', 'dismissed')
    .limit(1)
    .single();

  // Check prospects
  const { data: prospect } = await supabase
    .from('prospects')
    .select('id')
    .eq('company_domain', domain)
    .eq('team_id', teamId)
    .limit(1)
    .single();

  return {
    inDiscoveries: !!discovery,
    inProspects: !!prospect,
    prospectId: prospect?.id,
  };
}

// ============================================
// UPDATE OPERATIONS
// ============================================

/**
 * Update discovery status
 */
export async function updateDiscoveryStatus(
  id: string,
  status: ListenerDiscoveryStatus,
  userId?: string,
  notes?: string
): Promise<boolean> {
  const supabase = createAdminClient();

  const updateData: Record<string, unknown> = {
    status,
    reviewed_at: new Date().toISOString(),
  };

  if (userId) updateData.reviewed_by = userId;
  if (notes) updateData.review_notes = notes;

  const { error } = await supabase
    .from('listener_discoveries')
    .update(updateData)
    .eq('id', id);

  if (error) {
    console.error('Failed to update discovery status:', error);
    return false;
  }

  return true;
}

/**
 * Promote a discovery to a prospect
 */
export async function promoteDiscovery(
  discoveryId: string,
  teamId: string,
  userId?: string
): Promise<{ success: boolean; prospectId?: string; error?: string }> {
  const supabase = createAdminClient();

  try {
    // Get the discovery
    const discovery = await getDiscovery(discoveryId);
    if (!discovery) {
      return { success: false, error: 'Discovery not found' };
    }

    if (discovery.status === 'promoted') {
      return {
        success: true,
        prospectId: discovery.promoted_prospect_id || undefined,
      };
    }

    // Check if prospect already exists for this domain
    const { data: existingProspect } = await supabase
      .from('prospects')
      .select('id')
      .eq('company_domain', discovery.company_domain)
      .eq('team_id', teamId)
      .single();

    if (existingProspect) {
      // Link to existing prospect
      await updateDiscoveryStatus(discoveryId, 'duplicate', userId);
      await supabase
        .from('listener_discoveries')
        .update({ promoted_prospect_id: existingProspect.id })
        .eq('id', discoveryId);

      return { success: true, prospectId: existingProspect.id };
    }

    // Create new prospect
    const { data: prospect, error: prospectError } = await supabase
      .from('prospects')
      .insert({
        team_id: teamId,
        company_name: discovery.company_name || discovery.company_domain,
        company_domain: discovery.company_domain,
        helix_products: discovery.helix_products,
        helix_fit_score: discovery.confidence_score,
        helix_fit_reason: discovery.trigger_text,
        source: 'listener',
        source_url: discovery.source_url,
        status: 'new',
      })
      .select('id')
      .single();

    if (prospectError) {
      // Handle race condition (prospect created between check and insert)
      if (prospectError.code === '23505') {
        const { data: raceProspect } = await supabase
          .from('prospects')
          .select('id')
          .eq('company_domain', discovery.company_domain)
          .eq('team_id', teamId)
          .single();

        if (raceProspect) {
          await updateDiscoveryStatus(discoveryId, 'duplicate', userId);
          return { success: true, prospectId: raceProspect.id };
        }
      }
      throw prospectError;
    }

    // Update discovery status
    await supabase
      .from('listener_discoveries')
      .update({
        status: 'promoted',
        promoted_prospect_id: prospect.id,
        reviewed_by: userId || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', discoveryId);

    return { success: true, prospectId: prospect.id };
  } catch (error) {
    console.error('Failed to promote discovery:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Dismiss a discovery
 */
export async function dismissDiscovery(
  id: string,
  userId?: string,
  notes?: string
): Promise<boolean> {
  return updateDiscoveryStatus(id, 'dismissed', userId, notes);
}

// ============================================
// STATS
// ============================================

/**
 * Get discovery statistics
 */
export async function getDiscoveryStats(): Promise<{
  total: number;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  byKeywordCategory: Record<string, number>;
  avgConfidence: number;
  last24h: number;
  last7d: number;
}> {
  const supabase = createAdminClient();

  // Get all discoveries for aggregation
  const { data: discoveries, error } = await supabase
    .from('listener_discoveries')
    .select('status, source_type, keyword_category, confidence_score, discovered_at');

  if (error) throw error;

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const byStatus: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byKeywordCategory: Record<string, number> = {};
  let totalConfidence = 0;
  let last24h = 0;
  let last7d = 0;

  for (const d of discoveries || []) {
    byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    bySource[d.source_type] = (bySource[d.source_type] || 0) + 1;
    if (d.keyword_category) {
      byKeywordCategory[d.keyword_category] = (byKeywordCategory[d.keyword_category] || 0) + 1;
    }
    totalConfidence += d.confidence_score;

    const discoveredAt = new Date(d.discovered_at);
    if (discoveredAt >= oneDayAgo) last24h++;
    if (discoveredAt >= sevenDaysAgo) last7d++;
  }

  return {
    total: discoveries?.length || 0,
    byStatus,
    bySource,
    byKeywordCategory,
    avgConfidence: discoveries?.length ? Math.round(totalConfidence / discoveries.length) : 0,
    last24h,
    last7d,
  };
}
