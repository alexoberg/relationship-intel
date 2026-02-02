#!/usr/bin/env node
// FAST Swarm import - saves to file first, then batch inserts
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
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
const DATA_DIR = join(__dirname, '..', 'data');
const CACHE_FILE = join(DATA_DIR, 'swarm-contacts.json');

async function fetchSwarmBatch(size, offset) {
  const response = await fetch(`${SWARM_API_BASE}/profiles/network-mapper`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': SWARM_API_KEY },
    body: JSON.stringify({ query: { match_all: {} }, size, from: offset }),
  });
  if (response.status === 429) {
    console.log(' [rate limit, waiting 3s]');
    await new Promise(r => setTimeout(r, 3000));
    return fetchSwarmBatch(size, offset);
  }
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

async function fetchAllSwarmData() {
  console.log('📥 FETCHING ALL SWARM DATA...\n');

  const test = await fetchSwarmBatch(1, 0);
  const total = test.total_count;
  console.log(`Total contacts: ${total}\n`);

  const allItems = [];
  const batchSize = 100; // Larger batches = faster
  let offset = 0;

  while (offset < total) {
    const pct = Math.round((offset / total) * 100);
    process.stdout.write(`\rFetching: ${offset}/${total} (${pct}%)`);

    const result = await fetchSwarmBatch(batchSize, offset);
    if (!result.items?.length) break;

    allItems.push(...result.items);
    offset += result.items.length;

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 50));
  }

  console.log(`\n✅ Fetched ${allItems.length} contacts\n`);
  return allItems;
}

async function main() {
  console.log('🐝 FAST SWARM IMPORT\n');

  // Ensure data directory exists
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

  let allItems;

  // Check for cached data
  if (existsSync(CACHE_FILE)) {
    const stats = readFileSync(CACHE_FILE);
    const cached = JSON.parse(stats);
    console.log(`📁 Found cached data: ${cached.length} contacts`);
    console.log('   Using cache (delete data/swarm-contacts.json to re-fetch)\n');
    allItems = cached;
  } else {
    // Fetch fresh
    allItems = await fetchAllSwarmData();

    // SAVE TO FILE FIRST
    console.log('💾 Saving to file...');
    writeFileSync(CACHE_FILE, JSON.stringify(allItems, null, 2));
    console.log(`✅ Saved to ${CACHE_FILE}\n`);
  }

  // Prepare contact records
  console.log('📝 Preparing database records...');
  const contacts = [];
  const connectionRecords = [];

  for (const item of allItems) {
    const profile = item.profile;
    const connections = item.connections || [];

    if (!profile.full_name) continue;

    // Get best connection
    const best = connections.reduce((b, c) =>
      (!b || c.connection_strength > b.connection_strength) ? c : b, null);

    contacts.push({
      team_id: TEAM_ID,
      swarm_profile_id: profile.id,
      full_name: profile.full_name,
      current_title: profile.current_title || null,
      current_company: profile.current_company_name || null,
      linkedin_url: profile.linkedin_url || null,
      email: profile.work_email || null,
      connection_strength: best?.connection_strength || 0,
      best_connector: best?.connector_name || null,
      source: 'swarm',
      swarm_synced_at: new Date().toISOString(),
    });

    // Save connection info for later
    for (const conn of connections) {
      connectionRecords.push({
        swarm_profile_id: profile.id,
        connector_name: conn.connector_name,
        connector_linkedin_url: conn.connector_linkedin_url || null,
        connection_strength: conn.connection_strength || 0,
        sources: conn.sources?.map(s => s.origin) || [],
      });
    }
  }

  console.log(`   ${contacts.length} contacts to insert\n`);

  // BATCH INSERT - much faster than one at a time
  console.log('⚡ Batch inserting to database...');
  const BATCH_SIZE = 100;
  let inserted = 0, errors = 0;

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    const pct = Math.round((i / contacts.length) * 100);
    process.stdout.write(`\rInserting: ${i}/${contacts.length} (${pct}%) | +${inserted} ok, ${errors} err`);

    try {
      const { data, error } = await supabase
        .from('contacts')
        .upsert(batch, {
          onConflict: 'team_id,swarm_profile_id',
          ignoreDuplicates: false
        })
        .select('id, swarm_profile_id');

      if (error) {
        // Fallback: insert one by one
        for (const contact of batch) {
          const { error: singleErr } = await supabase
            .from('contacts')
            .upsert(contact, { onConflict: 'team_id,swarm_profile_id' });
          if (singleErr) errors++;
          else inserted++;
        }
      } else {
        inserted += batch.length;
      }
    } catch (err) {
      errors += batch.length;
    }
  }

  console.log(`\n\n✅ DATABASE IMPORT COMPLETE:`);
  console.log(`   Inserted/Updated: ${inserted}`);
  console.log(`   Errors: ${errors}`);

  // Verify
  const { count: totalContacts } = await supabase
    .from('contacts').select('*', { count: 'exact', head: true }).eq('team_id', TEAM_ID);
  const { count: withStrength } = await supabase
    .from('contacts').select('*', { count: 'exact', head: true }).eq('team_id', TEAM_ID).gt('connection_strength', 0);
  const { count: swarmSource } = await supabase
    .from('contacts').select('*', { count: 'exact', head: true }).eq('team_id', TEAM_ID).eq('source', 'swarm');

  console.log(`\n📊 FINAL STATUS:`);
  console.log(`   Total contacts: ${totalContacts}`);
  console.log(`   From Swarm: ${swarmSource}`);
  console.log(`   With connection_strength: ${withStrength}`);
}

main().catch(console.error);
