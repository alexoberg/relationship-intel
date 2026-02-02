#!/usr/bin/env node
// Improved Swarm sync - match by email OR normalized LinkedIn
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SWARM_API_KEY = process.env.SWARM_API_KEY;
const SWARM_API_BASE = 'https://bee.theswarm.com/v2';
const TEAM_ID = 'aa2e0a01-03e4-419c-971a-0a80b187778f';

// Normalize LinkedIn URL for matching
function normalizeLinkedIn(url) {
  if (!url) return null;
  // Extract just the profile ID/handle
  const match = url.match(/linkedin\.com\/in\/([^\/\?#]+)/i);
  return match ? match[1].toLowerCase().replace(/[^a-z0-9-]/g, '') : null;
}

// Normalize email for matching
function normalizeEmail(email) {
  if (!email) return null;
  return email.toLowerCase().trim();
}

async function fetchSwarmNetwork(pageSize = 50, offset = 0) {
  const response = await fetch(`${SWARM_API_BASE}/profiles/network-mapper`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': SWARM_API_KEY,
    },
    body: JSON.stringify({
      query: { match_all: {} },
      size: pageSize,
      from: offset,
    }),
  });

  if (!response.ok) {
    throw new Error(`Swarm API error: ${response.status}`);
  }
  return response.json();
}

async function main() {
  console.log('🔄 IMPROVED SWARM CONNECTION SYNC\n');

  // First, build lookup maps for existing contacts
  console.log('Loading existing contacts...');
  const { data: allContacts } = await supabase
    .from('contacts')
    .select('id, email, linkedin_url')
    .eq('team_id', TEAM_ID);

  const emailMap = new Map();
  const linkedinMap = new Map();

  allContacts?.forEach(c => {
    if (c.email) {
      emailMap.set(normalizeEmail(c.email), c.id);
    }
    if (c.linkedin_url) {
      const norm = normalizeLinkedIn(c.linkedin_url);
      if (norm) linkedinMap.set(norm, c.id);
    }
  });

  console.log(`  ${emailMap.size} contacts with email`);
  console.log(`  ${linkedinMap.size} contacts with LinkedIn\n`);

  // Fetch from Swarm
  const testResult = await fetchSwarmNetwork(1, 0);
  const totalSwarm = testResult.total_count;
  console.log(`Total Swarm contacts: ${totalSwarm}\n`);

  let matched = 0, notMatched = 0, errors = 0;
  const batchSize = 50;
  let offset = 0;

  while (offset < totalSwarm) {
    try {
      const result = await fetchSwarmNetwork(batchSize, offset);
      const { items } = result;

      if (!items || items.length === 0) break;

      const pct = Math.round((offset / totalSwarm) * 100);
      console.log(`Processing ${offset}/${totalSwarm} (${pct}%)...`);

      for (const item of items) {
        const profile = item.profile;
        const connections = item.connections || [];

        if (connections.length === 0) continue;

        // Get best connection strength
        const bestStrength = Math.max(...connections.map(c => c.connection_strength || 0));
        if (bestStrength === 0) continue;

        // Try to match to existing contact
        let contactId = null;

        // Try email first
        if (profile.work_email) {
          contactId = emailMap.get(normalizeEmail(profile.work_email));
        }

        // Try LinkedIn
        if (!contactId && profile.linkedin_url) {
          const normLi = normalizeLinkedIn(profile.linkedin_url);
          if (normLi) contactId = linkedinMap.get(normLi);
        }

        if (contactId) {
          // Update existing contact with connection strength
          const { error } = await supabase
            .from('contacts')
            .update({
              connection_strength: bestStrength,
              swarm_profile_id: profile.id,
              swarm_synced_at: new Date().toISOString(),
            })
            .eq('id', contactId);

          if (!error) {
            matched++;
            // Also save connection records
            for (const conn of connections) {
              await supabase.from('contact_connections').upsert({
                contact_id: contactId,
                connector_name: conn.connector_name,
                connector_linkedin_url: conn.connector_linkedin_url || null,
                connection_strength: conn.connection_strength || 0,
                connection_sources: conn.sources || [],
              }, {
                onConflict: 'contact_id,connector_name',
              });
            }
          }
        } else {
          notMatched++;
        }
      }

      offset += items.length;
      await new Promise(r => setTimeout(r, 200));

    } catch (err) {
      console.error(`Error at offset ${offset}: ${err.message}`);
      errors++;
      break;
    }
  }

  console.log(`\n✅ SYNC COMPLETE:`);
  console.log(`   Matched: ${matched}`);
  console.log(`   Not matched: ${notMatched}`);
  console.log(`   Errors: ${errors}`);

  // Verify
  const { count: withStrength } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', TEAM_ID)
    .gt('connection_strength', 0);

  console.log(`\n📊 Contacts with connection_strength: ${withStrength}`);
}

main().catch(console.error);
