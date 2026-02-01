// ============================================
// SWARM CONTACT INGESTION
// ============================================
// Pulls contacts from The Swarm network into our contacts table
// Uses unified ingestion service for deduplication and merging
// ============================================

import { createAdminClient } from '@/lib/supabase/admin';
import { ingestContacts, swarmItemToRawContact } from '@/lib/ingestion';
import { updateProximityScorePass1 } from '@/lib/scoring';

const SWARM_API_BASE = 'https://bee.theswarm.com/v2';

// ============================================
// TYPES
// ============================================

export interface SwarmProfile {
  id: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  current_title?: string;
  current_company_name?: string;
  current_company_website?: string;
  linkedin_url?: string;
  work_email?: string;
  location?: string;
}

export interface SwarmConnectionInfo {
  connector_id: string;
  connector_name: string;
  connector_linkedin_url?: string;
  connection_strength: number;
  sources: Array<{
    origin: string;
    shared_company?: string;
    overlap_start_date?: string;
    overlap_end_date?: string;
  }>;
}

export interface SwarmNetworkItem {
  profile: SwarmProfile;
  connections: SwarmConnectionInfo[];
}

export interface SwarmNetworkResponse {
  items: SwarmNetworkItem[];
  count: number;
  total_count: number;
}

export interface IngestionResult {
  success: boolean;
  contactsIngested: number;
  contactsUpdated: number;
  connectionsSaved: number;
  errors: string[];
}

// ============================================
// API CLIENT
// ============================================

async function fetchSwarmNetwork(
  pageSize = 100,
  offset = 0
): Promise<{ success: boolean; data?: SwarmNetworkResponse; error?: string }> {
  const apiKey = process.env.SWARM_API_KEY;

  if (!apiKey) {
    return { success: false, error: 'SWARM_API_KEY not configured' };
  }

  try {
    // Fetch all profiles in our network (match_all to get everyone)
    const response = await fetch(`${SWARM_API_BASE}/profiles/network-mapper`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        query: { match_all: {} },
        size: pageSize,
        from: offset,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        error: `Swarm API error: ${response.status} - ${errorText.slice(0, 200)}`,
      };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: `Network error: ${error instanceof Error ? error.message : 'Unknown'}`,
    };
  }
}

// ============================================
// CONTACT INGESTION
// ============================================

/**
 * Ingest all contacts from Swarm network into our database
 * Creates/updates contact records and saves connection relationships
 *
 * @param teamId - The team to ingest contacts for
 * @param ownerId - Required owner_id for the contacts (usually team admin)
 * @param options - Optional configuration
 */
export async function ingestSwarmContacts(
  teamId: string,
  ownerId: string,
  options?: {
    batchSize?: number;
    maxContacts?: number;
  }
): Promise<IngestionResult> {
  const supabase = createAdminClient();
  const batchSize = options?.batchSize || 50; // Swarm API caps at 50 per page
  const maxContacts = options?.maxContacts || 10000;

  const result: IngestionResult = {
    success: false,
    contactsIngested: 0,
    contactsUpdated: 0,
    connectionsSaved: 0,
    errors: [],
  };

  let offset = 0;
  let totalFetched = 0;

  while (totalFetched < maxContacts) {
    // Fetch batch from Swarm
    const fetchResult = await fetchSwarmNetwork(batchSize, offset);

    if (!fetchResult.success || !fetchResult.data) {
      result.errors.push(fetchResult.error || 'Failed to fetch from Swarm');
      break;
    }

    const { items, total_count } = fetchResult.data;

    if (items.length === 0) {
      break; // No more data
    }

    console.log(`[Swarm Ingestion] Processing ${items.length} profiles (${totalFetched + items.length}/${total_count})`);

    // Process each profile
    for (const item of items) {
      try {
        // Extract name parts
        const nameParts = item.profile.full_name.split(' ');
        const firstName = item.profile.first_name || nameParts[0] || '';
        const lastName = item.profile.last_name || nameParts.slice(1).join(' ') || '';

        // Extract domain from company website
        let companyDomain = null;
        if (item.profile.current_company_website) {
          companyDomain = item.profile.current_company_website
            .replace(/^https?:\/\//, '')
            .replace(/^www\./, '')
            .split('/')[0];
        }

        // Calculate best connection strength
        const bestStrength = item.connections.length > 0
          ? Math.max(...item.connections.map(c => c.connection_strength))
          : 0;

        // Contact data - includes both owner_id (required) and team_id
        const contactData = {
          owner_id: ownerId,
          team_id: teamId,
          swarm_profile_id: item.profile.id,
          full_name: item.profile.full_name,
          first_name: firstName,
          last_name: lastName,
          email: item.profile.work_email || null,
          linkedin_url: item.profile.linkedin_url || null,
          current_title: item.profile.current_title || null,
          current_company: item.profile.current_company_name || null,
          company_domain: companyDomain,
          source: 'swarm' as const,
          connection_strength: bestStrength,
          swarm_synced_at: new Date().toISOString(),
        };

        // Check if contact exists (by swarm_profile_id within team)
        const { data: existing } = await supabase
          .from('contacts')
          .select('id')
          .eq('team_id', teamId)
          .eq('swarm_profile_id', item.profile.id)
          .single();

        let contactId: string;

        if (existing) {
          // Update existing
          await supabase
            .from('contacts')
            .update(contactData)
            .eq('id', existing.id);
          contactId = existing.id;
          result.contactsUpdated++;
        } else {
          // Insert new
          const { data: newContact, error: insertError } = await supabase
            .from('contacts')
            .insert(contactData)
            .select('id')
            .single();

          if (insertError) {
            result.errors.push(`${item.profile.full_name}: ${insertError.message}`);
            continue;
          }
          contactId = newContact.id;
          result.contactsIngested++;
        }

        // Save connection info (who knows this person and how)
        for (const conn of item.connections) {
          const connectionData = {
            contact_id: contactId,
            connector_name: conn.connector_name,
            connector_linkedin_url: conn.connector_linkedin_url || null,
            connection_strength: conn.connection_strength,
            connection_sources: conn.sources,
          };

          await supabase
            .from('contact_connections')
            .upsert(connectionData, {
              onConflict: 'contact_id,connector_name',
            });

          result.connectionsSaved++;
        }
      } catch (error) {
        result.errors.push(
          `${item.profile.full_name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    totalFetched += items.length;
    offset += items.length; // Use actual items received, not batchSize (API caps at 50)

    // Rate limit
    await new Promise(r => setTimeout(r, 250));
  }

  result.success = result.errors.length === 0;
  console.log(`[Swarm Ingestion] Complete: ${result.contactsIngested} new, ${result.contactsUpdated} updated, ${result.connectionsSaved} connections`);

  // Update proximity scores for all ingested/updated contacts (Pass 1)
  if (result.contactsIngested > 0 || result.contactsUpdated > 0) {
    try {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id')
        .eq('team_id', teamId)
        .not('swarm_profile_id', 'is', null)
        .limit(500); // Process in batches

      for (const contact of contacts || []) {
        await updateProximityScorePass1(supabase, contact.id);
      }
      console.log(`[Swarm Ingestion] Updated proximity scores for ${contacts?.length || 0} contacts`);
    } catch (err) {
      console.error('[Swarm Ingestion] Failed to update proximity scores:', err);
    }
  }

  return result;
}

/**
 * Ingest Swarm contacts using unified ingestion service
 * Alternative to ingestSwarmContacts that uses the shared merge/dedup logic
 */
export async function ingestSwarmContactsUnified(
  teamId: string,
  ownerId: string,
  options?: { maxContacts?: number }
): Promise<{ success: boolean; inserted: number; updated: number; merged: number; errors: number }> {
  const supabase = createAdminClient();
  const maxContacts = options?.maxContacts || 10000;
  const batchSize = 50;

  let offset = 0;
  let totalResult = { success: true, inserted: 0, updated: 0, merged: 0, errors: 0 };

  while (offset < maxContacts) {
    const fetchResult = await fetchSwarmNetwork(batchSize, offset);
    if (!fetchResult.success || !fetchResult.data?.items?.length) break;

    const rawContacts = fetchResult.data.items.map(swarmItemToRawContact);

    const result = await ingestContacts(supabase, rawContacts, {
      teamId,
      ownerId,
      requireIdentifier: false,
    });

    totalResult.inserted += result.inserted;
    totalResult.updated += result.updated;
    totalResult.merged += result.merged;
    totalResult.errors += result.errors;

    offset += fetchResult.data.items.length;
    console.log(`[Swarm Unified] Processed ${offset}/${fetchResult.data.total_count}`);

    await new Promise(r => setTimeout(r, 200));
  }

  totalResult.success = totalResult.errors === 0;
  return totalResult;
}

/**
 * Test Swarm API connection and return basic stats
 */
export async function testSwarmIngestion(): Promise<{
  connected: boolean;
  totalProfiles?: number;
  error?: string;
}> {
  const result = await fetchSwarmNetwork(1, 0);

  if (!result.success) {
    return { connected: false, error: result.error };
  }

  return {
    connected: true,
    totalProfiles: result.data?.total_count || 0,
  };
}
