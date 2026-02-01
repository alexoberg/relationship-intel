/**
 * Contact Merge & Deduplication Logic
 *
 * When contacts come from multiple sources (Swarm, LinkedIn CSV, Google),
 * we need to identify duplicates and merge them intelligently.
 *
 * Matching priority:
 * 1. Email (exact match, case-insensitive)
 * 2. LinkedIn URL (normalized)
 * 3. Name + Company (fuzzy, lower confidence)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { MergeCandidate, RawContact, ContactUpsertData } from './types';

/**
 * Normalize email for matching
 */
export function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Normalize LinkedIn URL for matching
 * Handles variations like:
 * - https://www.linkedin.com/in/johndoe
 * - linkedin.com/in/johndoe/
 * - http://linkedin.com/in/johndoe
 */
export function normalizeLinkedInUrl(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
    .trim();
}

/**
 * Find existing contacts that might match the incoming contact
 */
export async function findMergeCandidates(
  supabase: SupabaseClient,
  teamId: string,
  contact: RawContact
): Promise<MergeCandidate[]> {
  const candidates: MergeCandidate[] = [];

  // 1. Match by email (highest confidence)
  if (contact.email) {
    const { data: emailMatches } = await supabase
      .from('contacts')
      .select('id')
      .eq('team_id', teamId)
      .ilike('email', normalizeEmail(contact.email))
      .limit(1);

    if (emailMatches?.length) {
      candidates.push({
        existing_id: emailMatches[0].id,
        match_type: 'email',
        match_confidence: 1.0,
      });
    }
  }

  // 2. Match by LinkedIn URL (high confidence)
  if (contact.linkedin_url && !candidates.length) {
    const normalized = normalizeLinkedInUrl(contact.linkedin_url);
    const { data: linkedinMatches } = await supabase
      .from('contacts')
      .select('id, linkedin_url')
      .eq('team_id', teamId)
      .not('linkedin_url', 'is', null);

    const match = linkedinMatches?.find(
      (c) => c.linkedin_url && normalizeLinkedInUrl(c.linkedin_url) === normalized
    );

    if (match) {
      candidates.push({
        existing_id: match.id,
        match_type: 'linkedin',
        match_confidence: 0.95,
      });
    }
  }

  // 3. Match by name + company (lower confidence, only if no other match)
  // This is a fallback for contacts without email/linkedin
  if (!candidates.length && contact.full_name && contact.current_company) {
    const { data: nameMatches } = await supabase
      .from('contacts')
      .select('id')
      .eq('team_id', teamId)
      .ilike('full_name', contact.full_name)
      .ilike('current_company', contact.current_company)
      .limit(1);

    if (nameMatches?.length) {
      candidates.push({
        existing_id: nameMatches[0].id,
        match_type: 'name_company',
        match_confidence: 0.7,
      });
    }
  }

  return candidates;
}

/**
 * Merge two contact records, preferring non-null values
 * and taking the higher connection strength
 */
export function mergeContactData(
  existing: Partial<ContactUpsertData>,
  incoming: Partial<ContactUpsertData>
): Partial<ContactUpsertData> {
  const merged: Partial<ContactUpsertData> = { ...existing };

  // For each field, prefer incoming if existing is null/empty
  const textFields: (keyof ContactUpsertData)[] = [
    'email',
    'linkedin_url',
    'first_name',
    'last_name',
    'current_title',
    'current_company',
    'company_domain',
    'phone',
    'swarm_profile_id',
  ];

  for (const field of textFields) {
    const incomingVal = incoming[field];
    const existingVal = existing[field];
    if (incomingVal && !existingVal) {
      (merged as Record<string, unknown>)[field] = incomingVal;
    }
  }

  // For connection_strength, take the higher value
  if (typeof incoming.connection_strength === 'number') {
    const existingStrength = (existing.connection_strength as number) || 0;
    merged.connection_strength = Math.max(existingStrength, incoming.connection_strength);
  }

  // For interaction_count, sum them
  if (typeof incoming.interaction_count === 'number') {
    const existingCount = (existing.interaction_count as number) || 0;
    merged.interaction_count = existingCount + incoming.interaction_count;
  }

  // For timestamps, take the most recent
  if (incoming.last_interaction_at) {
    const existingDate = existing.last_interaction_at
      ? new Date(existing.last_interaction_at)
      : new Date(0);
    const incomingDate = new Date(incoming.last_interaction_at);
    if (incomingDate > existingDate) {
      merged.last_interaction_at = incoming.last_interaction_at;
    }
  }

  if (incoming.swarm_synced_at) {
    merged.swarm_synced_at = incoming.swarm_synced_at;
  }

  return merged;
}
