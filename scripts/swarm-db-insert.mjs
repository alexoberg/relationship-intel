#!/usr/bin/env node
// Insert cached Swarm data into database (uses saved JSON file)
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
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

const TEAM_ID = 'aa2e0a01-03e4-419c-971a-0a80b187778f';
const OWNER_ID = 'b7a99437-6db9-43e4-a211-33e4e446e2f1';
const CACHE_FILE = join(__dirname, '..', 'data', 'swarm-contacts.json');

async function main() {
  console.log('⚡ FAST DB INSERT FROM CACHED FILE\n');

  if (!existsSync(CACHE_FILE)) {
    console.error('❌ Cache file not found:', CACHE_FILE);
    return;
  }

  const allItems = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
  console.log(`📁 Loaded ${allItems.length} contacts from cache\n`);

  // Prepare records
  const contacts = [];
  for (const item of allItems) {
    const profile = item.profile;
    const connections = item.connections || [];
    if (!profile.full_name) continue;

    const best = connections.reduce((b, c) =>
      (!b || c.connection_strength > b.connection_strength) ? c : b, null);

    contacts.push({
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
      swarm_synced_at: new Date().toISOString(),
    });
  }

  console.log(`📝 ${contacts.length} contacts to insert\n`);

  // FAST BATCH INSERT
  const BATCH = 50;
  let ok = 0, err = 0;

  for (let i = 0; i < contacts.length; i += BATCH) {
    const batch = contacts.slice(i, i + BATCH);
    const pct = Math.round((i / contacts.length) * 100);
    process.stdout.write(`\r${i}/${contacts.length} (${pct}%) | ✅ ${ok} | ❌ ${err}`);

    // Try batch upsert first
    const { error } = await supabase
      .from('contacts')
      .upsert(batch, { onConflict: 'team_id,swarm_profile_id', ignoreDuplicates: false });

    if (error) {
      // Fallback: one by one
      for (const c of batch) {
        const { error: e } = await supabase.from('contacts').upsert(c, {
          onConflict: 'team_id,swarm_profile_id', ignoreDuplicates: false
        });
        if (e) err++; else ok++;
      }
    } else {
      ok += batch.length;
    }
  }

  console.log(`\n\n✅ DONE: ${ok} inserted/updated, ${err} errors`);

  // Verify
  const { count: total } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('team_id', TEAM_ID);
  const { count: withStr } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('team_id', TEAM_ID).gt('connection_strength', 0);
  const { count: swarm } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('team_id', TEAM_ID).eq('source', 'swarm');

  console.log(`\n📊 FINAL:`);
  console.log(`   Total contacts: ${total}`);
  console.log(`   From Swarm: ${swarm}`);
  console.log(`   With connection_strength: ${withStr}`);
}

main().catch(console.error);
