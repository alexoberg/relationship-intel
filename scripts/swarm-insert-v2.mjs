#!/usr/bin/env node
// Simple INSERT from cached Swarm data
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TEAM_ID = 'aa2e0a01-03e4-419c-971a-0a80b187778f';
const OWNER_ID = 'b7a99437-6db9-43e4-a211-33e4e446e2f1';

async function main() {
  console.log('⚡ SWARM INSERT V2\n');

  // Load cached data
  const allItems = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'swarm-contacts.json'), 'utf-8'));
  console.log(`Loaded ${allItems.length} from cache\n`);

  // Get existing swarm_profile_ids to skip duplicates
  const { data: existing } = await supabase
    .from('contacts')
    .select('swarm_profile_id')
    .eq('team_id', TEAM_ID)
    .not('swarm_profile_id', 'is', null);

  const existingIds = new Set(existing?.map(e => e.swarm_profile_id) || []);
  console.log(`${existingIds.size} already in DB\n`);

  let inserted = 0, skipped = 0, errors = 0;
  const toInsert = [];

  for (const item of allItems) {
    const profile = item.profile;
    if (!profile.full_name || !profile.id) continue;

    if (existingIds.has(profile.id)) {
      skipped++;
      continue;
    }

    const connections = item.connections || [];
    const best = connections.reduce((b, c) =>
      (!b || c.connection_strength > b.connection_strength) ? c : b, null);

    toInsert.push({
      team_id: TEAM_ID,
      owner_id: OWNER_ID,
      swarm_profile_id: profile.id,
      full_name: profile.full_name,
      current_title: profile.current_title || null,
      current_company: profile.current_company_name || null,
      linkedin_url: profile.linkedin_url || null,
      email: profile.work_email || null,
      connection_strength: best?.connection_strength || 0,
      best_connector: best?.connector_name || null,
      source: 'swarm',
    });
  }

  console.log(`To insert: ${toInsert.length}, Skipping: ${skipped}\n`);

  // Batch insert
  const BATCH = 100;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    const pct = Math.round((i / toInsert.length) * 100);
    process.stdout.write(`\r${i}/${toInsert.length} (${pct}%) | ✅ ${inserted} | ❌ ${errors}`);

    const { error } = await supabase.from('contacts').insert(batch);
    if (error) {
      // Try one by one
      for (const c of batch) {
        const { error: e } = await supabase.from('contacts').insert(c);
        if (e) errors++; else inserted++;
      }
    } else {
      inserted += batch.length;
    }
  }

  console.log(`\n\n✅ DONE: ${inserted} inserted, ${skipped} skipped, ${errors} errors`);

  // Stats
  const { count: total } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('team_id', TEAM_ID);
  const { count: withStr } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('team_id', TEAM_ID).gt('connection_strength', 0);

  console.log(`\n📊 Total: ${total} | With strength: ${withStr}`);
}

main().catch(console.error);
