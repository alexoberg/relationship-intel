#!/usr/bin/env node
// Import contacts from local Swarm SQLite database to Supabase
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

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
  console.log('📥 IMPORTING FROM LOCAL SWARM DB\n');

  // Open local Swarm database
  const db = new Database('/Users/alexoberg/Swarm/connections.db', { readonly: true });
  
  const rows = db.prepare('SELECT * FROM connections').all();
  console.log(`Local Swarm DB: ${rows.length} contacts\n`);

  // Get existing contacts by linkedin
  const { data: existing } = await supabase
    .from('contacts')
    .select('id, linkedin_url')
    .eq('team_id', TEAM_ID);

  const existingByLinkedin = new Map();
  for (const c of existing || []) {
    if (c.linkedin_url) {
      const slug = c.linkedin_url.match(/linkedin\.com\/in\/([^\/\?#]+)/i)?.[1]?.toLowerCase();
      if (slug) existingByLinkedin.set(slug, c.id);
    }
  }
  console.log(`Existing contacts: ${existing?.length || 0}`);
  console.log(`With LinkedIn: ${existingByLinkedin.size}\n`);

  let updated = 0, inserted = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const slug = r.linkedin_slug?.toLowerCase();
    
    const contactData = {
      team_id: TEAM_ID,
      owner_id: OWNER_ID,
      swarm_profile_id: r.id,
      full_name: r.full_name,
      current_title: r.current_title || null,
      current_company: r.current_company || null,
      linkedin_url: slug ? `https://linkedin.com/in/${slug}` : null,
      email: r.work_email || null,
      connection_strength: r.connection_strength || 0,
      best_connector: r.connector_name || null,
      category: r.category || null,
      source: 'swarm',
      swarm_synced_at: new Date().toISOString(),
    };

    const existingId = slug ? existingByLinkedin.get(slug) : null;

    if (existingId) {
      const { error } = await supabase.from('contacts')
        .update(contactData)
        .eq('id', existingId);
      if (error) errors++; else updated++;
    } else {
      const { error } = await supabase.from('contacts').insert(contactData);
      if (error) errors++; else inserted++;
    }

    if ((i + 1) % 100 === 0) {
      process.stdout.write(`\r${i + 1}/${rows.length} | ✅ ${updated} upd, ${inserted} ins | ❌ ${errors}`);
    }
  }

  db.close();

  console.log(`\n\n✅ DONE: ${updated} updated, ${inserted} inserted, ${errors} errors`);

  const { count } = await supabase.from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', TEAM_ID);
  console.log(`\n📊 Total contacts now: ${count}`);
}

main().catch(console.error);
