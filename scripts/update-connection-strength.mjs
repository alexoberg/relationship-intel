#!/usr/bin/env node
// Update connection_strength for existing contacts based on Swarm data
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

function normLi(url) {
  if (!url) return null;
  const m = url.match(/linkedin\.com\/in\/([^\/\?#]+)/i);
  return m ? m[1].toLowerCase() : null;
}

async function main() {
  console.log('🔄 UPDATING CONNECTION STRENGTH\n');

  // Load swarm and deduplicate by linkedin/email
  const swarm = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'swarm-contacts.json'), 'utf-8'));
  
  // Build map of unique people with BEST connection strength across all dupes
  const byLinkedin = new Map();
  const byEmail = new Map();
  
  for (const item of swarm) {
    const p = item.profile;
    const connections = item.connections || [];
    const best = connections.reduce((b, c) =>
      (!b || c.connection_strength > b.connection_strength) ? c : b, null);
    
    if (!best) continue;
    
    const li = normLi(p.linkedin_url);
    const email = p.work_email?.toLowerCase();
    
    // Update if this has higher strength
    if (li) {
      const existing = byLinkedin.get(li);
      if (!existing || best.connection_strength > existing.strength) {
        byLinkedin.set(li, { strength: best.connection_strength, connector: best.connector_name });
      }
    }
    if (email) {
      const existing = byEmail.get(email);
      if (!existing || best.connection_strength > existing.strength) {
        byEmail.set(email, { strength: best.connection_strength, connector: best.connector_name });
      }
    }
  }

  console.log(`Unique profiles by LinkedIn: ${byLinkedin.size}`);
  console.log(`Unique profiles by Email: ${byEmail.size}\n`);

  // Get existing contacts
  let all = [], page = 0;
  while (true) {
    const { data } = await supabase.from('contacts')
      .select('id, email, linkedin_url, connection_strength')
      .eq('team_id', TEAM_ID)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    page++;
    if (data.length < 1000) break;
  }
  console.log(`Existing contacts: ${all.length}\n`);

  let updated = 0, skipped = 0, errors = 0;

  for (const contact of all) {
    const li = normLi(contact.linkedin_url);
    const email = contact.email?.toLowerCase();
    
    let swarmData = null;
    if (li && byLinkedin.has(li)) {
      swarmData = byLinkedin.get(li);
    } else if (email && byEmail.has(email)) {
      swarmData = byEmail.get(email);
    }
    
    if (!swarmData) {
      skipped++;
      continue;
    }
    
    // Update contact
    const { error } = await supabase.from('contacts').update({
      connection_strength: swarmData.strength,
      best_connector: swarmData.connector,
      swarm_synced_at: new Date().toISOString(),
    }).eq('id', contact.id);
    
    if (error) errors++;
    else updated++;
  }

  console.log(`✅ Updated: ${updated}`);
  console.log(`⏭️ Skipped (no swarm match): ${skipped}`);
  console.log(`❌ Errors: ${errors}`);

  // Verify
  const { count: withStr } = await supabase.from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', TEAM_ID)
    .gt('connection_strength', 0);
  console.log(`\n📊 Contacts with connection_strength > 0: ${withStr}`);
}

main().catch(console.error);
