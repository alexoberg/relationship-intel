/**
 * Contact Pipeline - Orchestrates the full contact data flow
 * 
 * Flow: Source Sync → Cleanup → PDL Enrichment → Prospect Matching
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Supported contact sources
export type ContactSource = 'swarm' | 'apollo' | 'salesforce' | 'hubspot' | 'linkedin_csv' | 'manual';

export interface RawContact {
  name: string;
  email?: string;
  linkedin_url?: string;
  title?: string;
  company?: string;
  company_domain?: string;
  connection_strength?: number;
  source: ContactSource;
  source_id?: string; // ID from the source system
  raw_data?: Record<string, unknown>;
}

export interface Contact {
  id: string;
  team_id: string;
  owner_id: string;
  name: string;
  email?: string;
  linkedin_url?: string;
  title?: string;
  company?: string;
  company_domain?: string;
  connection_strength?: number;
  source: ContactSource;
  enrichment_status?: 'pending' | 'enriching' | 'enriched' | 'failed' | 'skipped';
  job_history?: JobHistoryEntry[];
  created_at: string;
  updated_at: string;
}

export interface JobHistoryEntry {
  company: string;
  domain?: string;
  title: string;
  start_date?: string;
  end_date?: string;
  is_current: boolean;
}

/**
 * Upsert contacts from any source
 * Handles deduplication by email or linkedin_url
 */
export async function upsertContacts(
  teamId: string,
  ownerId: string,
  contacts: RawContact[]
): Promise<{ inserted: number; updated: number; errors: string[] }> {
  const results = { inserted: 0, updated: 0, errors: [] as string[] };

  for (const contact of contacts) {
    try {
      // Normalize domain
      const domain = normalizeDomain(contact.company_domain || extractDomainFromEmail(contact.email));
      
      // Check for existing contact by linkedin_url or email
      let existingId: string | null = null;
      
      if (contact.linkedin_url) {
        const { data } = await supabase
          .from('contacts')
          .select('id')
          .eq('team_id', teamId)
          .eq('linkedin_url', contact.linkedin_url)
          .single();
        existingId = data?.id;
      }
      
      if (!existingId && contact.email) {
        const { data } = await supabase
          .from('contacts')
          .select('id')
          .eq('team_id', teamId)
          .eq('email', contact.email.toLowerCase())
          .single();
        existingId = data?.id;
      }

      const contactData = {
        team_id: teamId,
        owner_id: ownerId,
        name: contact.name,
        email: contact.email?.toLowerCase(),
        linkedin_url: contact.linkedin_url,
        title: contact.title,
        company: contact.company,
        company_domain: domain,
        connection_strength: contact.connection_strength || 0,
        source: contact.source,
        swarm_profile_id: contact.source === 'swarm' ? contact.source_id : undefined,
        swarm_synced_at: contact.source === 'swarm' ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      };

      if (existingId) {
        // Update existing
        const { error } = await supabase
          .from('contacts')
          .update(contactData)
          .eq('id', existingId);
        
        if (error) throw error;
        results.updated++;
      } else {
        // Insert new
        const { error } = await supabase
          .from('contacts')
          .insert({
            ...contactData,
            enrichment_status: 'pending',
            created_at: new Date().toISOString(),
          });
        
        if (error) throw error;
        results.inserted++;
      }
    } catch (err) {
      results.errors.push(`${contact.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  return results;
}

/**
 * Fetch contacts from Swarm API
 */
export async function fetchSwarmContacts(apiKey: string): Promise<RawContact[]> {
  const response = await fetch('https://bee.theswarm.com/v2/profiles/network-mapper', {
    headers: { 'X-API-KEY': apiKey }
  });

  if (!response.ok) {
    throw new Error(`Swarm API error: ${response.status}`);
  }

  const data = await response.json();
  const profiles = data.profiles || [];

  return profiles.map((p: any) => ({
    name: p.full_name || p.name || 'Unknown',
    email: p.email,
    linkedin_url: p.linkedin_url,
    title: p.title || p.current_title,
    company: p.company || p.current_company,
    company_domain: p.company_domain || extractDomainFromLinkedIn(p.linkedin_url),
    connection_strength: p.relationship_strength || p.strength || 0,
    source: 'swarm' as ContactSource,
    source_id: p.id || p.profile_id,
    raw_data: p,
  }));
}

/**
 * Get contacts needing enrichment
 */
export async function getContactsForEnrichment(
  teamId: string,
  limit: number = 100
): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('team_id', teamId)
    .eq('enrichment_status', 'pending')
    .order('connection_strength', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Update contact with PDL enrichment data
 */
export async function updateContactEnrichment(
  contactId: string,
  jobHistory: JobHistoryEntry[],
  additionalData?: Partial<Contact>
): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .update({
      job_history: jobHistory,
      enrichment_status: 'enriched',
      pdl_enriched_at: new Date().toISOString(),
      ...additionalData,
    })
    .eq('id', contactId);

  if (error) throw error;
}

/**
 * Mark contact enrichment as failed
 */
export async function markEnrichmentFailed(
  contactId: string,
  error: string
): Promise<void> {
  await supabase
    .from('contacts')
    .update({
      enrichment_status: 'failed',
      enrichment_error: error,
      last_enrichment_attempt: new Date().toISOString(),
    })
    .eq('id', contactId);
}

// Helper functions
function normalizeDomain(domain?: string): string | undefined {
  if (!domain) return undefined;
  return domain.toLowerCase().replace(/^www\./, '').trim();
}

function extractDomainFromEmail(email?: string): string | undefined {
  if (!email) return undefined;
  const parts = email.split('@');
  return parts.length === 2 ? normalizeDomain(parts[1]) : undefined;
}

function extractDomainFromLinkedIn(url?: string): string | undefined {
  // LinkedIn company pages sometimes have domain hints
  return undefined; // TODO: implement if needed
}
