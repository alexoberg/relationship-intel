#!/usr/bin/env node
// Re-ingest Swarm contacts with full connection data
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
  console.log('🔄 RE-INGESTING SWARM CONTACTS WITH CONNECTION DATA\n');
  console.log(`Swarm API Key: ${SWARM_API_KEY ? '✅ Set' : '❌ Missing'}\n`);

  // Test connection first
  const testResult = await fetchSwarmNetwork(1, 0);
  console.log(`Total contacts in Swarm: ${testResult.total_count}\n`);

  const batchSize = 50;
  let offset = 0;
  let totalIngested = 0;
  let totalUpdated = 0;
  let totalConnections = 0;
  let errors = [];

  while (offset < 10000) {
    try {
      const result = await fetchSwarmNetwork(batchSize, offset);
      const { items, total_count } = result;

      if (!items || items.length === 0) break;

      const pct = Math.round((offset / total_count) * 100);
      console.log(`Processing ${offset + items.length}/${total_count} (${pct}%)`);

      for (const item of items) {
        try {
          const nameParts = item.profile.full_name?.split(' ') || ['Unknown'];
          const firstName = item.profile.first_name || nameParts[0] || '';
          const lastName = item.profile.last_name || nameParts.slice(1).join(' ') || '';

          let companyDomain = null;
          if (item.profile.current_company_website) {
            companyDomain = item.profile.current_company_website
              .replace(/^https?:\/\//, '')
              .replace(/^www\./, '')
              .split('/')[0];
          }

          // Calculate BEST connection strength from all connectors
          const bestStrength = item.connections?.length > 0
            ? Math.max(...item.connections.map(c => c.connection_strength || 0))
            : 0;

          const contactData = {
            team_id: TEAM_ID,
            swarm_profile_id: item.profile.id,
            full_name: item.profile.full_name || 'Unknown',
            first_name: firstName,
            last_name: lastName,
            email: item.profile.work_email || null,
            linkedin_url: item.profile.linkedin_url || null,
            current_title: item.profile.current_title || null,
            current_company: item.profile.current_company_name || null,
            company_domain: companyDomain,
            source: 'swarm',
            connection_strength: bestStrength,  // KEY: save the strength!
            swarm_synced_at: new Date().toISOString(),
          };

          // Upsert contact
          const { data: existing } = await supabase
            .from('contacts')
            .select('id')
            .eq('team_id', TEAM_ID)
            .eq('swarm_profile_id', item.profile.id)
            .single();

          let contactId;
          if (existing) {
            await supabase.from('contacts').update(contactData).eq('id', existing.id);
            contactId = existing.id;
            totalUpdated++;
          } else {
            const { data: newContact, error } = await supabase
              .from('contacts')
              .insert(contactData)
              .select('id')
              .single();
            if (error) {
              errors.push(`${item.profile.full_name}: ${error.message}`);
              continue;
            }
            contactId = newContact.id;
            totalIngested++;
          }

          // Save ALL connection records (who knows this person)
          for (const conn of item.connections || []) {
            const { error: connError } = await supabase
              .from('contact_connections')
              .upsert({
                contact_id: contactId,
                connector_name: conn.connector_name,
                connector_linkedin_url: conn.connector_linkedin_url || null,
                connection_strength: conn.connection_strength || 0,
                connection_sources: conn.sources || [],
              }, {
                onConflict: 'contact_id,connector_name',
              });

            if (!connError) totalConnections++;
          }
        } catch (err) {
          errors.push(`${item.profile?.full_name || 'Unknown'}: ${err.message}`);
        }
      }

      offset += items.length;
      await new Promise(r => setTimeout(r, 200)); // Rate limit

    } catch (err) {
      console.error(`Batch error at offset ${offset}: ${err.message}`);
      errors.push(`Batch ${offset}: ${err.message}`);
      break;
    }
  }

  console.log(`\n✅ INGESTION COMPLETE:`);
  console.log(`   New contacts: ${totalIngested}`);
  console.log(`   Updated contacts: ${totalUpdated}`);
  console.log(`   Connection records: ${totalConnections}`);
  console.log(`   Errors: ${errors.length}`);

  // Verify
  const { data: stats } = await supabase.rpc('get_contact_stats', { p_team_id: TEAM_ID }).single();
  
  const { count: withStrength } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', TEAM_ID)
    .gt('connection_strength', 0);

  const { count: connRecords } = await supabase
    .from('contact_connections')
    .select('*', { count: 'exact', head: true });

  console.log(`\n📊 VERIFICATION:`);
  console.log(`   Contacts with connection_strength > 0: ${withStrength}`);
  console.log(`   Total contact_connections records: ${connRecords}`);
}

main().catch(console.error);
