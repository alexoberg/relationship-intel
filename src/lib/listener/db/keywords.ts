// ============================================
// LISTENER KEYWORDS DATABASE OPERATIONS
// ============================================

import { createAdminClient } from '@/lib/supabase/admin';
import { ListenerKeyword, KeywordCategory } from '../types';
import { HelixProduct } from '../../helix-sales';
import { clearKeywordCache } from '../keyword-matcher';

// ============================================
// READ OPERATIONS
// ============================================

/**
 * Get all active keywords
 */
export async function getActiveKeywords(): Promise<ListenerKeyword[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('listener_keywords')
    .select('*')
    .eq('is_active', true)
    .order('weight', { ascending: false });

  if (error) throw error;

  return (data || []) as ListenerKeyword[];
}

/**
 * Get all keywords (including inactive)
 */
export async function getAllKeywords(): Promise<ListenerKeyword[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('listener_keywords')
    .select('*')
    .order('category')
    .order('weight', { ascending: false });

  if (error) throw error;

  return (data || []) as ListenerKeyword[];
}

/**
 * Get keyword by ID
 */
export async function getKeyword(id: string): Promise<ListenerKeyword | null> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('listener_keywords')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data as ListenerKeyword;
}

/**
 * Get keywords by category
 */
export async function getKeywordsByCategory(
  category: KeywordCategory
): Promise<ListenerKeyword[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('listener_keywords')
    .select('*')
    .eq('category', category)
    .eq('is_active', true)
    .order('weight', { ascending: false });

  if (error) throw error;

  return (data || []) as ListenerKeyword[];
}

// ============================================
// CREATE/UPDATE OPERATIONS
// ============================================

/**
 * Add a new keyword
 */
export async function addKeyword(params: {
  keyword: string;
  category: KeywordCategory;
  weight?: number;
  helixProducts?: HelixProduct[];
}): Promise<ListenerKeyword> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('listener_keywords')
    .insert({
      keyword: params.keyword.toLowerCase().trim(),
      category: params.category,
      weight: params.weight || 1,
      helix_products: params.helixProducts || [],
      is_active: true,
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error(`Keyword "${params.keyword}" already exists`);
    }
    throw error;
  }

  // Clear cache so new keyword is picked up
  clearKeywordCache();

  return data as ListenerKeyword;
}

/**
 * Update a keyword
 */
export async function updateKeyword(
  id: string,
  updates: {
    keyword?: string;
    category?: KeywordCategory;
    weight?: number;
    helixProducts?: HelixProduct[];
    isActive?: boolean;
  }
): Promise<ListenerKeyword> {
  const supabase = createAdminClient();

  const updateData: Record<string, unknown> = {};
  if (updates.keyword !== undefined) updateData.keyword = updates.keyword.toLowerCase().trim();
  if (updates.category !== undefined) updateData.category = updates.category;
  if (updates.weight !== undefined) updateData.weight = updates.weight;
  if (updates.helixProducts !== undefined) updateData.helix_products = updates.helixProducts;
  if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

  const { data, error } = await supabase
    .from('listener_keywords')
    .update(updateData)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;

  // Clear cache
  clearKeywordCache();

  return data as ListenerKeyword;
}

/**
 * Toggle keyword active status
 */
export async function toggleKeyword(id: string): Promise<boolean> {
  const supabase = createAdminClient();

  // Get current status
  const { data: current } = await supabase
    .from('listener_keywords')
    .select('is_active')
    .eq('id', id)
    .single();

  if (!current) return false;

  // Toggle
  const { error } = await supabase
    .from('listener_keywords')
    .update({ is_active: !current.is_active })
    .eq('id', id);

  if (error) {
    console.error('Failed to toggle keyword:', error);
    return false;
  }

  // Clear cache
  clearKeywordCache();

  return true;
}

/**
 * Delete a keyword
 */
export async function deleteKeyword(id: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('listener_keywords')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete keyword:', error);
    return false;
  }

  // Clear cache
  clearKeywordCache();

  return true;
}

// ============================================
// BULK OPERATIONS
// ============================================

/**
 * Bulk add keywords
 */
export async function bulkAddKeywords(
  keywords: Array<{
    keyword: string;
    category: KeywordCategory;
    weight?: number;
    helixProducts?: HelixProduct[];
  }>
): Promise<{ added: number; skipped: number }> {
  const supabase = createAdminClient();

  const toInsert = keywords.map(kw => ({
    keyword: kw.keyword.toLowerCase().trim(),
    category: kw.category,
    weight: kw.weight || 1,
    helix_products: kw.helixProducts || [],
    is_active: true,
  }));

  // Use upsert to handle duplicates
  const { data, error } = await supabase
    .from('listener_keywords')
    .upsert(toInsert, { onConflict: 'keyword', ignoreDuplicates: true })
    .select('id');

  if (error) throw error;

  // Clear cache
  clearKeywordCache();

  return {
    added: data?.length || 0,
    skipped: keywords.length - (data?.length || 0),
  };
}

/**
 * Bulk update keyword weights by category
 */
export async function updateCategoryWeights(
  category: KeywordCategory,
  weight: number
): Promise<number> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('listener_keywords')
    .update({ weight })
    .eq('category', category)
    .select('id');

  if (error) throw error;

  // Clear cache
  clearKeywordCache();

  return data?.length || 0;
}

// ============================================
// STATS
// ============================================

/**
 * Get keyword statistics
 */
export async function getKeywordStats(): Promise<{
  total: number;
  active: number;
  byCategory: Record<string, { total: number; active: number }>;
  avgWeight: number;
}> {
  const supabase = createAdminClient();

  const { data: keywords, error } = await supabase
    .from('listener_keywords')
    .select('category, weight, is_active');

  if (error) throw error;

  const byCategory: Record<string, { total: number; active: number }> = {};
  let totalActive = 0;
  let totalWeight = 0;

  for (const kw of keywords || []) {
    if (!byCategory[kw.category]) {
      byCategory[kw.category] = { total: 0, active: 0 };
    }
    byCategory[kw.category].total++;
    if (kw.is_active) {
      byCategory[kw.category].active++;
      totalActive++;
    }
    totalWeight += kw.weight;
  }

  return {
    total: keywords?.length || 0,
    active: totalActive,
    byCategory,
    avgWeight: keywords?.length ? Math.round((totalWeight / keywords.length) * 10) / 10 : 0,
  };
}
