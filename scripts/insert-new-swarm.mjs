#!/usr/bin/env node
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
  console.log('🚀 INSERTING NEW CONTACTS FROM SWARM\n');

  // Load swarm data
  const swarm = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'swarm-contacts.json'), 'utf-8'));
  console.log(`Swarm contacts: ${swarm.length}`);

  // Get ALL existing emails and linkedin handles
  console.log('Loading existing contacts...');
  let all = [], page = 0;
  while (true) {
    const { data } = await supabase.from('contacts')
      .select('email, linkedin_url')
      .eq('team_id', TEAM_ID)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    page++;
    if (data.length < 1000) break;
  }
  console.log(`Existing contacts: ${all.length}`);

  // Build lookup sets
  const existingEmails = new Set();
  const existingLinkedins = new Set();
  
  for (const c of all) {
    if (c.email) existingEmails.add(c.email.toLowerCase());
    if (c.linkedin_url) {
      const norm = normLi(c.linkedin_url);
      if (norm) existingLinkedins.add(norm);
    }
  }
  
  console.log(`Existing emails: ${existingEmails.size}`);
  console.log(`Existing linkedins: ${existingLinkedins.size}\n`);

  // Find NEW contacts
  const toInsert = [];
  let alreadyExists = 0;
  
  for (const item of swarm) {
    const p = item.profile;
    if (!p.full_name) continue;
    
    const email = p.work_email?.toLowerCase();
    const li = normLi(p.linkedin_url);
    
    // Check if exists
    const emailMatch = email && existingEmails.has(email);
    const liMatch = li && existingLinkedins.has(li);
    
    if (emailMatch || liMatch) {
      alreadyExists++;
      continue;
    }
    
    // Get best connection
    const connections = item.connections || [];
    const best = connections.reduce((b, c) =>
      (!b || c.connection_strength > b.connection_strength) ? c : b, null);
    
    toInsert.push({
      team_id: TEAM_ID,
      owner_id: OWNER_ID,
      swarm_profile_id: p.id,
      full_name: p.full_name,
      current_title: p.current_title || null,
      current_company: p.current_company_name || null,
      linkedin_url: p.linkedin_url || null,
      email: p.work_email || null,
      connection_strength: best?.connection_strength || 0,
      best_connector: best?.connector_name || null,
      source: 'swarm',
    });
  }

  console.log(`Already exist: ${alreadyExists}`);
  console.log(`NEW to insert: ${toInsert.length}\n`);

  if (toInsert.length === 0) {
    console.log('Nothing new to insert');
    return;
  }

  // Batch insert
  let inserted = 0, errors = 0;
  const BATCH = 50;
  
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    process.stdout.write(`\r${i}/${toInsert.length} | ✅ ${inserted} | ❌ ${errors}`);
    
    const { error } = await supabase.from('contacts').insert(batch);
    if (error) {
      // Try one by one
      for (const c of batch) {
        const { error: e } = await supabase.from('contacts').insert(c);
        if (e) errors++;
        else inserted++;
      }
    } else {
      inserted += batch.length;
    }
  }

  console.log(`\n\n✅ DONE: ${inserted} inserted, ${errors} errors`);

  // Verify
  const { count: total } = await supabase.from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', TEAM_ID);
  console.log(`\n📊 Total contacts now: ${total}`);
}

main().catch(console.error);
