#!/usr/bin/env node
// Re-ingest Swarm contacts - FIXED to match by linkedin_url
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

function normalizeLinkedIn(url) {
  if (!url) return null;
  return url.toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
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
    const text = await response.text();
    throw new Error(`Swarm API error: ${response.status} - ${text.slice(0, 200)}`);
  }

  return response.json();
}

async function main() {
  console.log('🔄 RE-INGESTING SWARM CONTACTS (FIXED)\n');
  console.log('Matching by LinkedIn URL to update existing contacts\n');

  const testResult = await fetchSwarmNetwork(1, 0);
  console.log(`Total contacts in Swarm: ${testResult.total_count}\n`);

  const batchSize = 50;
  let offset = 0;
  let updated = 0, notFound = 0, errors = 0;

  while (offset < 10000) {
    try {
      const result = await fetchSwarmNetwork(batchSize, offset);
      const { items, total_count } = result;

      if (!items || items.length === 0) break;

      const pct = Math.round((offset / total_count) * 100);
      console.log(`Processing ${offset + items.length}/${total_count} (${pct}%)`);

      for (const item of items) {
        try {
          const linkedinUrl = item.profile.linkedin_url;
          if (!linkedinUrl) continue;

          const normalizedUrl = normalizeLinkedIn(linkedinUrl);
          
          // Calculate BEST connection strength
          const bestStrength = item.connections?.length > 0
            ? Math.max(...item.connections.map(c => c.connection_strength || 0))
            : 0;

          // Get best connector name
          const bestConn = item.connections?.sort((a, b) => 
            (b.connection_strength || 0) - (a.connection_strength || 0)
          )[0];

          // Find existing contact by linkedin_url (normalized comparison)
          const { data: existing } = await supabase
            .from('contacts')
            .select('id, linkedin_url')
            .eq('team_id', TEAM_ID)
            .ilike('linkedin_url', `%${normalizedUrl.split('/').pop()}%`)
            .limit(1);

          if (existing && existing.length > 0) {
            // Update existing contact
            const { error } = await supabase
              .from('contacts')
              .update({
                swarm_profile_id: item.profile.id,
                connection_strength: bestStrength,
                swarm_synced_at: new Date().toISOString(),
              })
              .eq('id', existing[0].id);

            if (!error) {
              updated++;
              
              // Save connection records
              for (const conn of item.connections || []) {
                await supabase
                  .from('contact_connections')
                  .upsert({
                    contact_id: existing[0].id,
                    connector_name: conn.connector_name,
                    connector_linkedin_url: conn.connector_linkedin_url || null,
                    connection_strength: conn.connection_strength || 0,
                    connection_sources: conn.sources || [],
                  }, { onConflict: 'contact_id,connector_name' });
              }
            }
          } else {
            notFound++;
          }
        } catch (err) {
          errors++;
        }
      }

      offset += items.length;
      await new Promise(r => setTimeout(r, 100));

    } catch (err) {
      console.error(`Batch error: ${err.message}`);
      break;
    }
  }

  console.log(`\n✅ INGESTION COMPLETE:`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Not found in DB: ${notFound}`);
  console.log(`   Errors: ${errors}`);

  // Verify
  const { count: withStrength } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', TEAM_ID)
    .gt('connection_strength', 0);

  console.log(`\n📊 Contacts with connection_strength > 0: ${withStrength}`);
}

main().catch(console.error);
