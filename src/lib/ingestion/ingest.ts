/**
 * Unified Contact Ingestion Service
 *
 * Central service for ingesting contacts from any source:
 * - Swarm (preferred)
 * - LinkedIn CSV
 * - Google OAuth (Gmail/Calendar)
 *
 * All sources flow through this service to ensure consistent
 * deduplication, merging, and initial scoring.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { RawContact, IngestionResult, ContactUpsertData } from './types';
import { findMergeCandidates, mergeContactData, normalizeEmail } from './merge';

export interface IngestOptions {
  teamId: string;
  ownerId: string;
  /** If true, skip contacts without email or linkedin_url */
  requireIdentifier?: boolean;
  /** Batch size for database operations */
  batchSize?: number;
}

/**
 * Ingest a batch of contacts from any source
 */
export async function ingestContacts(
  supabase: SupabaseClient,
  contacts: RawContact[],
  options: IngestOptions
): Promise<IngestionResult> {
  const { teamId, ownerId, requireIdentifier = false, batchSize = 50 } = options;

  const result: IngestionResult = {
    success: true,
    inserted: 0,
    updated: 0,
    merged: 0,
    errors: 0,
    error_details: [],
  };

  // Filter contacts if identifier required
  const validContacts = requireIdentifier
    ? contacts.filter((c) => c.email || c.linkedin_url)
    : contacts;

  // Process in batches
  for (let i = 0; i < validContacts.length; i += batchSize) {
    const batch = validContacts.slice(i, i + batchSize);

    for (const contact of batch) {
      try {
        await processContact(supabase, contact, teamId, ownerId, result);
      } catch (error) {
        result.errors++;
        result.error_details?.push(
          `Failed to process ${contact.full_name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  result.success = result.errors === 0;
  return result;
}

/**
 * Process a single contact - find matches, merge or insert
 */
async function processContact(
  supabase: SupabaseClient,
  contact: RawContact,
  teamId: string,
  ownerId: string,
  result: IngestionResult
): Promise<void> {
  // Find existing contacts that might match
  const candidates = await findMergeCandidates(supabase, teamId, contact);

  // Prepare upsert data
  const upsertData: ContactUpsertData = {
    owner_id: ownerId,
    team_id: teamId,
    full_name: contact.full_name,
    source: contact.source,
    email: contact.email ? normalizeEmail(contact.email) : null,
    linkedin_url: contact.linkedin_url || null,
    first_name: contact.first_name || null,
    last_name: contact.last_name || null,
    current_title: contact.current_title || null,
    current_company: contact.current_company || null,
    company_domain: contact.company_domain || null,
    phone: contact.phone || null,
    connection_strength: contact.connection_strength || 0,
    interaction_count: contact.interaction_count || 0,
    last_interaction_at: contact.last_interaction_at || null,
  };

  // Add source-specific fields
  if (contact.source === 'swarm' && contact.source_id) {
    upsertData.swarm_profile_id = contact.source_id;
    upsertData.swarm_synced_at = new Date().toISOString();
  }

  if (candidates.length > 0) {
    // Found a match - merge the data
    const bestMatch = candidates[0];
    const { data: existing } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', bestMatch.existing_id)
      .single();

    if (existing) {
      const mergedData = mergeContactData(existing, upsertData);

      const { error } = await supabase
        .from('contacts')
        .update(mergedData)
        .eq('id', bestMatch.existing_id);

      if (error) {
        throw new Error(`Update failed: ${error.message}`);
      }

      if (bestMatch.match_type === 'email' || bestMatch.match_type === 'linkedin') {
        result.updated++;
      } else {
        result.merged++;
      }
    }
  } else {
    // No match - insert new contact
    const { error } = await supabase.from('contacts').insert(upsertData);

    if (error) {
      // Handle unique constraint violations (race condition)
      if (error.code === '23505') {
        result.updated++;
      } else {
        throw new Error(`Insert failed: ${error.message}`);
      }
    } else {
      result.inserted++;
    }
  }
}

/**
 * Convenience function to ingest from Swarm API response
 */
export function swarmItemToRawContact(item: {
  profile: {
    id: string;
    full_name: string;
    work_email?: string;
    linkedin_url?: string;
    current_title?: string;
    current_company_name?: string;
    current_company_website?: string;
  };
  connections?: Array<{ connection_strength?: number }>;
}): RawContact {
  const p = item.profile;
  const strength = item.connections?.length
    ? Math.max(...item.connections.map((c) => (c.connection_strength || 0) * 100))
    : 0;

  return {
    source: 'swarm',
    source_id: p.id,
    full_name: p.full_name || '',
    email: p.work_email || undefined,
    linkedin_url: p.linkedin_url || undefined,
    current_title: p.current_title || undefined,
    current_company: p.current_company_name || undefined,
    company_domain: extractDomain(p.current_company_website),
    connection_strength: Math.round(strength),
  };
}

/**
 * Convenience function to convert LinkedIn CSV row to RawContact
 */
export function linkedInRowToRawContact(row: Record<string, string>): RawContact | null {
  const firstName = row['First Name'] || row['FirstName'] || row['first_name'] || '';
  const lastName = row['Last Name'] || row['LastName'] || row['last_name'] || '';
  const fullName = `${firstName} ${lastName}`.trim();

  if (!fullName) return null;

  return {
    source: 'linkedin_csv',
    full_name: fullName,
    first_name: firstName || undefined,
    last_name: lastName || undefined,
    email: row['Email Address'] || row['Email'] || row['email'] || undefined,
    linkedin_url: row['Profile URL'] || row['URL'] || row['linkedin_url'] || undefined,
    current_title: row['Position'] || row['Title'] || row['position'] || undefined,
    current_company: row['Company'] || row['company'] || undefined,
  };
}

function extractDomain(url?: string): string | undefined {
  if (!url) return undefined;
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
}
