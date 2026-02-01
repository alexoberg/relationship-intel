#!/usr/bin/env node
/**
 * Swarm Contact Sync Script
 *
 * Syncs contacts from The Swarm API to the contacts table.
 * Uses env vars - run with: node --env-file=.env.local scripts/sync-swarm.mjs
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SWARM_API_KEY
 *
 * Required args:
 *   --team-id=<uuid>   Team ID to sync contacts for
 *   --owner-id=<uuid>  Owner ID for new contacts
 */

import { createClient } from '@supabase/supabase-js';

// Parse CLI args
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  if (key && value) acc[key.replace('--', '')] = value;
  return acc;
}, {});

const TEAM_ID = args['team-id'];
const OWNER_ID = args['owner-id'];

if (!TEAM_ID || !OWNER_ID) {
  console.error('Usage: node --env-file=.env.local scripts/sync-swarm.mjs --team-id=<uuid> --owner-id=<uuid>');
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SWARM_KEY = process.env.SWARM_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !SWARM_KEY) {
  console.error('Missing required env vars: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SWARM_API_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchSwarmBatch(offset) {
  const res = await fetch('https://bee.theswarm.com/v2/profiles/network-mapper', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': SWARM_KEY },
    body: JSON.stringify({ query: { match_all: {} }, size: 50, from: offset }),
  });

  if (res.status === 429) {
    console.log('Rate limited, waiting 3s...');
    await new Promise(r => setTimeout(r, 3000));
    return fetchSwarmBatch(offset);
  }
  if (!res.ok) throw new Error(`Swarm API error: ${res.status}`);
  return res.json();
}

async function fetchAllSwarmContacts() {
  const all = [];
  let offset = 0;

  while (true) {
    console.log(`Fetching Swarm offset ${offset}...`);
    const data = await fetchSwarmBatch(offset);
    if (!data.items?.length) break;

    all.push(...data.items);
    offset += data.items.length;
    await new Promise(r => setTimeout(r, 150));

    if (offset >= data.total_count) break;
  }

  return all;
}

async function getExistingContacts() {
  const { data } = await supabase
    .from('contacts')
    .select('id, email, linkedin_url')
    .eq('team_id', TEAM_ID);
  return data || [];
}

function extractDomain(url) {
  if (!url) return null;
  return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}

async function main() {
  console.log('=== SWARM CONTACT SYNC ===\n');
  console.log(`Team: ${TEAM_ID}`);
  console.log(`Owner: ${OWNER_ID}\n`);

  // Fetch all from Swarm
  const swarmContacts = await fetchAllSwarmContacts();
  console.log(`\nFetched ${swarmContacts.length} contacts from Swarm`);

  // Build lookup maps for existing contacts
  const existing = await getExistingContacts();
  const byEmail = new Map(existing.filter(c => c.email).map(c => [c.email.toLowerCase(), c.id]));
  const byLinkedIn = new Map(existing.filter(c => c.linkedin_url).map(c => [c.linkedin_url, c.id]));
  console.log(`Existing: ${existing.length} (${byEmail.size} with email, ${byLinkedIn.size} with LinkedIn)\n`);

  let updated = 0, inserted = 0, errors = 0;

  for (let i = 0; i < swarmContacts.length; i++) {
    const item = swarmContacts[i];
    const p = item.profile;

    // Calculate max connection strength across all connectors
    const strength = item.connections?.length
      ? Math.max(...item.connections.map(c => c.connection_strength || 0))
      : 0;

    const swarmData = {
      swarm_profile_id: p.id,
      connection_strength: Math.round(strength * 100),
      swarm_synced_at: new Date().toISOString(),
    };

    // Find existing contact by email or LinkedIn
    let existingId = null;
    if (p.work_email) existingId = byEmail.get(p.work_email.toLowerCase());
    if (!existingId && p.linkedin_url) existingId = byLinkedIn.get(p.linkedin_url);

    if (existingId) {
      // Update existing contact with Swarm data
      const { error } = await supabase.from('contacts').update(swarmData).eq('id', existingId);
      if (error) errors++;
      else updated++;
    } else {
      // Insert new contact from Swarm
      const { error } = await supabase.from('contacts').insert({
        owner_id: OWNER_ID,
        team_id: TEAM_ID,
        source: 'swarm',
        ...swarmData,
        full_name: p.full_name || '',
        email: p.work_email || null,
        linkedin_url: p.linkedin_url || null,
        current_title: p.current_title || null,
        current_company: p.current_company_name || null,
        company_domain: extractDomain(p.current_company_website),
      });
      if (error) errors++;
      else inserted++;
    }

    if ((i + 1) % 500 === 0) {
      console.log(`${i + 1}/${swarmContacts.length} | +${inserted} new, ~${updated} updated, ${errors} errors`);
    }
  }

  // Final count
  const { count } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', TEAM_ID)
    .not('swarm_profile_id', 'is', null);

  console.log(`\n=== DONE ===`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Updated: ${updated}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total contacts with Swarm data: ${count}`);
}

main().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
