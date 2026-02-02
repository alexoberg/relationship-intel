#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

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
  console.log('📥 IMPORTING SWARM CSV EXPORTS\n');

  const files = [
    { path: 'data/Anna_Sun_Feb_01_2026_2025.csv', connector: 'Anna Dor' },
    { path: 'data/Alex_Sun_Feb_01_2026_2025.csv', connector: 'Alex Oberg' },
    { path: 'data/Mike_Sun_Feb_01_2026_2025.csv', connector: 'Michael Hall' },
  ];

  // Load all contacts from CSVs
  const allContacts = new Map(); // key by linkedin slug

  for (const file of files) {
    const content = readFileSync(join(__dirname, '..', file.path), 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true });
    console.log(`${file.connector}: ${records.length} rows`);

    for (const r of records) {
      const li = normLi(r['LinkedIn']);
      if (!li) continue;

      const existing = allContacts.get(li);
      if (existing) {
        // Merge connectors
        if (!existing.connectors.includes(file.connector)) {
          existing.connectors.push(file.connector);
        }
      } else {
        allContacts.set(li, {
          full_name: `${r['First Name'] || ''} ${r['Last Name'] || ''}`.trim() || null,
          current_title: r['Current job title'] || null,
          current_company: r['Current company'] || null,
          company_domain: r['Company url']?.replace(/^https?:\/\//, '').split('/')[0] || null,
          linkedin_url: r['LinkedIn'],
          email: r['Emails']?.split(',')[0]?.trim() || null,
          location: r['Location'] || null,
          connectors: [file.connector],
          strong: r['Strong connectors'] || '',
          familiar: r['Familiar connectors'] || '',
        });
      }
    }
  }

  console.log(`\nUnique contacts: ${allContacts.size}\n`);

  // Get existing by linkedin
  let existing = [], page = 0;
  while (true) {
    const { data } = await supabase.from('contacts')
      .select('id, linkedin_url')
      .eq('team_id', TEAM_ID)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    existing.push(...data);
    page++;
    if (data.length < 1000) break;
  }

  const existingByLi = new Map();
  for (const c of existing) {
    const li = normLi(c.linkedin_url);
    if (li) existingByLi.set(li, c.id);
  }
  console.log(`Existing contacts: ${existing.length}`);
  console.log(`With LinkedIn: ${existingByLi.size}\n`);

  let updated = 0, inserted = 0, errors = 0;
  const entries = [...allContacts.entries()];

  for (let i = 0; i < entries.length; i++) {
    const [li, c] = entries[i];
    
    // Determine best connector and strength
    const bestConnector = c.strong || c.familiar || c.connectors[0];
    const strength = c.strong ? 0.9 : (c.familiar ? 0.6 : 0.3);

    const contactData = {
      team_id: TEAM_ID,
      owner_id: OWNER_ID,
      full_name: c.full_name,
      current_title: c.current_title,
      current_company: c.current_company,
      company_domain: c.company_domain,
      linkedin_url: c.linkedin_url,
      email: c.email,
      location: c.location,
      connection_strength: strength,
      best_connector: bestConnector,
      source: 'swarm',
      swarm_synced_at: new Date().toISOString(),
    };

    const existingId = existingByLi.get(li);

    if (existingId) {
      const { error } = await supabase.from('contacts').update(contactData).eq('id', existingId);
      if (error) errors++; else updated++;
    } else {
      const { error } = await supabase.from('contacts').insert(contactData);
      if (error) errors++; else inserted++;
    }

    if ((i + 1) % 500 === 0) {
      console.log(`${i + 1}/${entries.length} | ✅ ${updated} upd, ${inserted} ins | ❌ ${errors}`);
    }
  }

  console.log(`\n✅ DONE: ${updated} updated, ${inserted} inserted, ${errors} errors`);

  const { count } = await supabase.from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', TEAM_ID);
  console.log(`\n📊 Total contacts now: ${count}`);
}

main().catch(console.error);
