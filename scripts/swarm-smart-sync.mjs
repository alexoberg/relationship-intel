#!/usr/bin/env node
// Smart sync: match by email OR linkedin, update OR insert
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

function normLi(url) {
  if (!url) return null;
  const m = url.match(/linkedin\.com\/in\/([^\/\?#]+)/i);
  return m ? m[1].toLowerCase() : null;
}

async function main() {
  console.log('🔄 SMART SWARM SYNC\n');

  // Load cache
  const cache = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'swarm-contacts.json'), 'utf-8'));
  console.log(`Loaded ${cache.length} from cache\n`);

  // Build lookup maps for existing contacts
  console.log('Building lookup maps...');
  let all = [], page = 0;
  while (true) {
    const { data } = await supabase.from('contacts')
      .select('id, email, linkedin_url, swarm_profile_id')
      .eq('team_id', TEAM_ID)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    page++;
    if (data.length < 1000) break;
  }

  const byEmail = new Map();
  const byLinkedin = new Map();
  const bySwarmId = new Map();

  for (const c of all) {
    if (c.email) byEmail.set(c.email.toLowerCase(), c.id);
    if (c.linkedin_url) {
      const norm = normLi(c.linkedin_url);
      if (norm) byLinkedin.set(norm, c.id);
    }
    if (c.swarm_profile_id) bySwarmId.set(c.swarm_profile_id, c.id);
  }

  console.log(`  ${all.length} existing contacts`);
  console.log(`  ${byEmail.size} by email, ${byLinkedin.size} by linkedin, ${bySwarmId.size} by swarm_id\n`);

  let updated = 0, inserted = 0, errors = 0;

  for (let i = 0; i < cache.length; i++) {
    const item = cache[i];
    const profile = item.profile;
    const connections = item.connections || [];

    if (!profile.full_name) continue;

    // Get best connection
    const best = connections.reduce((b, c) =>
      (!b || c.connection_strength > b.connection_strength) ? c : b, null);
    const strength = best?.connection_strength || 0;
    const connector = best?.connector_name || null;

    // Try to find existing contact
    let existingId = bySwarmId.get(profile.id);
    if (!existingId && profile.work_email) {
      existingId = byEmail.get(profile.work_email.toLowerCase());
    }
    if (!existingId && profile.linkedin_url) {
      const norm = normLi(profile.linkedin_url);
      if (norm) existingId = byLinkedin.get(norm);
    }

    if (existingId) {
      // UPDATE existing
      const { error } = await supabase.from('contacts').update({
        connection_strength: strength,
        best_connector: connector,
        swarm_profile_id: profile.id,
        swarm_synced_at: new Date().toISOString(),
      }).eq('id', existingId);

      if (error) errors++; else updated++;
    } else {
      // INSERT new
      const { error } = await supabase.from('contacts').insert({
        team_id: TEAM_ID,
        owner_id: OWNER_ID,
        swarm_profile_id: profile.id,
        full_name: profile.full_name,
        current_title: profile.current_title || null,
        current_company: profile.current_company_name || null,
        linkedin_url: profile.linkedin_url || null,
        email: profile.work_email || null,
        connection_strength: strength,
        best_connector: connector,
        source: 'swarm',
      });

      if (error) errors++; else inserted++;
    }

    if ((i + 1) % 100 === 0) {
      const pct = Math.round(((i + 1) / cache.length) * 100);
      process.stdout.write(`\r${i + 1}/${cache.length} (${pct}%) | ✅ ${updated} upd, ${inserted} ins | ❌ ${errors}`);
    }
  }

  console.log(`\n\n✅ DONE: ${updated} updated, ${inserted} inserted, ${errors} errors`);

  // Verify
  const { count: total } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('team_id', TEAM_ID);
  const { count: withStr } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('team_id', TEAM_ID).gt('connection_strength', 0);

  console.log(`\n📊 Total: ${total} | With strength: ${withStr}`);
}

main().catch(console.error);
