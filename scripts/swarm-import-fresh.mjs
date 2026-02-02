#!/usr/bin/env node
// FRESH IMPORT: Insert all 8,655 Swarm contacts properly
// Uses UPSERT by swarm_profile_id to avoid duplicates
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

async function fetchSwarmBatch(size, offset) {
  const response = await fetch(`${SWARM_API_BASE}/profiles/network-mapper`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': SWARM_API_KEY,
    },
    body: JSON.stringify({
      query: { match_all: {} },
      size,
      from: offset,
    }),
  });

  if (response.status === 429) {
    console.log('Rate limited, waiting 5s...');
    await new Promise(r => setTimeout(r, 5000));
    return fetchSwarmBatch(size, offset);
  }

  if (!response.ok) {
    throw new Error(`Swarm API error: ${response.status}`);
  }
  return response.json();
}

async function main() {
  console.log('🐝 FRESH SWARM IMPORT\n');
  console.log('This will INSERT all Swarm contacts (upserting by swarm_profile_id)\n');

  // Get total
  const test = await fetchSwarmBatch(1, 0);
  const total = test.total_count;
  console.log(`Total in Swarm: ${total}\n`);

  let inserted = 0, updated = 0, errors = 0, skipped = 0;
  const batchSize = 50;
  let offset = 0;

  while (offset < total) {
    try {
      const result = await fetchSwarmBatch(batchSize, offset);
      const { items } = result;

      if (!items || items.length === 0) break;

      const pct = Math.round((offset / total) * 100);
      process.stdout.write(`\r${offset}/${total} (${pct}%) | +${inserted} ins, ~${updated} upd, ${errors} err`);

      for (const item of items) {
        const profile = item.profile;
        const connections = item.connections || [];

        // Skip if no name
        if (!profile.full_name) {
          skipped++;
          continue;
        }

        // Get best (max) connection strength
        const bestConnection = connections.reduce((best, conn) => {
          if (!best || conn.connection_strength > best.connection_strength) {
            return conn;
          }
          return best;
        }, null);

        const connectionStrength = bestConnection?.connection_strength || 0;
        const bestConnector = bestConnection?.connector_name || null;

        // Prepare contact data
        const contactData = {
          team_id: TEAM_ID,
          swarm_profile_id: profile.id,
          full_name: profile.full_name,
          current_title: profile.current_title || null,
          current_company: profile.current_company_name || null,
          linkedin_url: profile.linkedin_url || null,
          email: profile.work_email || null,
          connection_strength: connectionStrength,
          best_connector: bestConnector,
          source: 'swarm',
          swarm_synced_at: new Date().toISOString(),
        };

        // UPSERT by swarm_profile_id
        const { data, error } = await supabase
          .from('contacts')
          .upsert(contactData, {
            onConflict: 'team_id,swarm_profile_id',
            ignoreDuplicates: false,
          })
          .select('id')
          .single();

        if (error) {
          // Try insert without upsert (might be missing constraint)
          const { data: insertData, error: insertError } = await supabase
            .from('contacts')
            .insert(contactData)
            .select('id')
            .single();

          if (insertError) {
            if (insertError.code === '23505') {
              // Duplicate - try update instead
              const { error: updateError } = await supabase
                .from('contacts')
                .update({
                  connection_strength: connectionStrength,
                  best_connector: bestConnector,
                  swarm_synced_at: new Date().toISOString(),
                })
                .eq('team_id', TEAM_ID)
                .eq('swarm_profile_id', profile.id);

              if (!updateError) {
                updated++;
              } else {
                errors++;
              }
            } else {
              errors++;
            }
          } else {
            inserted++;

            // Save connection records
            if (insertData?.id && connections.length > 0) {
              for (const conn of connections) {
                await supabase.from('contact_connections').upsert({
                  contact_id: insertData.id,
                  connector_name: conn.connector_name,
                  connector_linkedin_url: conn.connector_linkedin_url || null,
                  connection_strength: conn.connection_strength || 0,
                  connection_sources: conn.sources?.map(s => s.origin) || [],
                }, {
                  onConflict: 'contact_id,connector_name',
                }).catch(() => {});
              }
            }
          }
        } else {
          if (data?.id) {
            inserted++;
            // Save connection records
            for (const conn of connections) {
              await supabase.from('contact_connections').upsert({
                contact_id: data.id,
                connector_name: conn.connector_name,
                connector_linkedin_url: conn.connector_linkedin_url || null,
                connection_strength: conn.connection_strength || 0,
                connection_sources: conn.sources?.map(s => s.origin) || [],
              }, {
                onConflict: 'contact_id,connector_name',
              }).catch(() => {});
            }
          } else {
            updated++;
          }
        }
      }

      offset += items.length;

      // Rate limit protection
      await new Promise(r => setTimeout(r, 100));

    } catch (err) {
      console.error(`\nError at offset ${offset}: ${err.message}`);
      errors++;
      offset += batchSize; // Skip this batch and continue
    }
  }

  console.log(`\n\n✅ IMPORT COMPLETE:`);
  console.log(`   Inserted: ${inserted}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Errors: ${errors}`);

  // Verify
  const { count: totalContacts } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', TEAM_ID);

  const { count: withStrength } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', TEAM_ID)
    .gt('connection_strength', 0);

  const { count: swarmSource } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', TEAM_ID)
    .eq('source', 'swarm');

  console.log(`\n📊 FINAL STATUS:`);
  console.log(`   Total contacts: ${totalContacts}`);
  console.log(`   From Swarm: ${swarmSource}`);
  console.log(`   With connection_strength: ${withStrength}`);
}

main().catch(console.error);
