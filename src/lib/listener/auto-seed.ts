// ============================================
// AUTO-SEED KEYWORDS
// ============================================
// Automatically seeds keywords from the repo seed file if not already seeded

import { createAdminClient } from '@/lib/supabase/admin';
import LISTENER_KEYWORDS from '@/data/listener-keywords-seed';

let seedingPromise: Promise<boolean> | null = null;

/**
 * Check if keywords are already seeded
 */
export async function areKeywordsSeeded(): Promise<boolean> {
  const supabase = createAdminClient();

  const { count } = await supabase
    .from('listener_keywords')
    .select('*', { count: 'exact', head: true });

  return (count ?? 0) > 0;
}

/**
 * Seed keywords from the repo seed file
 * Returns true if seeded, false if already seeded
 */
export async function seedKeywords(): Promise<boolean> {
  const supabase = createAdminClient();

  // Check if already seeded
  const alreadySeeded = await areKeywordsSeeded();
  if (alreadySeeded) {
    console.log('[Listener] Keywords already seeded, skipping');
    return false;
  }

  console.log(`[Listener] Seeding ${LISTENER_KEYWORDS.length} keywords...`);

  // Prepare keywords for insertion
  const toInsert = LISTENER_KEYWORDS.map(kw => ({
    keyword: kw.keyword.toLowerCase().trim(),
    category: kw.category,
    weight: kw.weight,
    helix_products: kw.helixProducts,
    is_active: true,
  }));

  // Insert in batches to avoid hitting limits
  const batchSize = 50;
  let inserted = 0;

  for (let i = 0; i < toInsert.length; i += batchSize) {
    const batch = toInsert.slice(i, i + batchSize);

    const { error } = await supabase
      .from('listener_keywords')
      .upsert(batch, {
        onConflict: 'keyword',
        ignoreDuplicates: true,
      });

    if (error) {
      console.error('[Listener] Failed to seed keywords batch:', error);
      throw error;
    }

    inserted += batch.length;
  }

  console.log(`[Listener] Successfully seeded ${inserted} keywords`);
  return true;
}

/**
 * Ensure keywords are seeded (idempotent, thread-safe)
 * Call this before any scan operation
 */
export async function ensureKeywordsSeeded(): Promise<void> {
  // Use a singleton promise to prevent concurrent seeding
  if (seedingPromise) {
    await seedingPromise;
    return;
  }

  seedingPromise = (async () => {
    try {
      await seedKeywords();
      return true;
    } catch (error) {
      console.error('[Listener] Failed to ensure keywords seeded:', error);
      return false;
    }
  })();

  await seedingPromise;
  seedingPromise = null;
}

/**
 * Check if listener has had at least one successful run
 */
export async function hasSuccessfulRun(): Promise<boolean> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('listener_runs')
    .select('id')
    .eq('status', 'completed')
    .limit(1)
    .single();

  return !!data;
}

/**
 * Get listener initialization status
 */
export async function getListenerStatus(): Promise<{
  keywordsSeeded: boolean;
  keywordCount: number;
  hasSuccessfulRun: boolean;
  totalRuns: number;
  successfulRuns: number;
}> {
  const supabase = createAdminClient();

  // Get keyword count
  const { count: keywordCount } = await supabase
    .from('listener_keywords')
    .select('*', { count: 'exact', head: true });

  // Get run stats
  const { data: runs } = await supabase
    .from('listener_runs')
    .select('status');

  const totalRuns = runs?.length ?? 0;
  const successfulRuns = runs?.filter(r => r.status === 'completed').length ?? 0;

  return {
    keywordsSeeded: (keywordCount ?? 0) > 0,
    keywordCount: keywordCount ?? 0,
    hasSuccessfulRun: successfulRuns > 0,
    totalRuns,
    successfulRuns,
  };
}
