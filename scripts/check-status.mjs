#!/usr/bin/env node
// Check current status of all data
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

const TEAM_ID = 'aa2e0a01-03e4-419c-971a-0a80b187778f';

async function main() {
  console.log('📊 CURRENT STATUS');
  console.log('==================\n');

  // Contacts
  const { count: totalContacts } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('team_id', TEAM_ID);
  const { count: withStrength } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('team_id', TEAM_ID).gt('connection_strength', 0);
  const { count: pdlEnriched } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('team_id', TEAM_ID).not('pdl_data', 'is', null);

  console.log('CONTACTS:');
  console.log(`  Total: ${totalContacts}`);
  console.log(`  With connection_strength: ${withStrength} (${Math.round(withStrength/totalContacts*100)}%)`);
  console.log(`  PDL enriched: ${pdlEnriched} (${Math.round(pdlEnriched/totalContacts*100)}%)`);

  // Categories
  const { data: contacts } = await supabase.from('contacts').select('category').eq('team_id', TEAM_ID);
  const cats = {};
  contacts?.forEach(c => cats[c.category || 'uncategorized'] = (cats[c.category || 'uncategorized'] || 0) + 1);

  console.log('\nCONTACT CATEGORIES:');
  Object.entries(cats).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
    console.log(`  ${k}: ${v} (${Math.round(v/totalContacts*100)}%)`);
  });

  // Prospects
  const { count: totalProspects } = await supabase.from('prospects').select('*', { count: 'exact', head: true }).eq('team_id', TEAM_ID);
  const { count: withConnections } = await supabase.from('prospects').select('*', { count: 'exact', head: true }).eq('team_id', TEAM_ID).gt('connections_count', 0);
  const { count: warmIntro } = await supabase.from('prospects').select('*', { count: 'exact', head: true }).eq('team_id', TEAM_ID).eq('has_warm_intro', true);

  console.log('\nPROSPECTS:');
  console.log(`  Total: ${totalProspects}`);
  console.log(`  With connections: ${withConnections} (${Math.round(withConnections/totalProspects*100)}%)`);
  console.log(`  With warm intro: ${warmIntro} (${Math.round(warmIntro/totalProspects*100)}%)`);

  // Prospect connections
  const { count: prospectConns } = await supabase.from('prospect_connections').select('*', { count: 'exact', head: true });
  console.log(`  Total prospect_connections: ${prospectConns}`);

  // Connection type breakdown
  const { data: connTypes } = await supabase.from('prospect_connections').select('connection_type');
  const types = {};
  connTypes?.forEach(c => types[c.connection_type || 'unknown'] = (types[c.connection_type || 'unknown'] || 0) + 1);

  console.log('\nCONNECTION TYPES:');
  Object.entries(types).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => {
    console.log(`  ${k}: ${v}`);
  });

  // Top prospects by connections
  console.log('\n🏆 TOP 10 PROSPECTS BY CONNECTIONS:');
  const { data: top } = await supabase
    .from('prospects')
    .select('company_name, helix_fit_score, connection_score, connections_count, has_warm_intro, best_connector')
    .eq('team_id', TEAM_ID)
    .order('connections_count', { ascending: false })
    .limit(10);

  top?.forEach((p, i) => {
    const warm = p.has_warm_intro ? '🤝' : '  ';
    console.log(`${i+1}. ${warm} ${p.company_name}`);
    console.log(`      Fit: ${p.helix_fit_score}% | Conn: ${p.connection_score}% | ${p.connections_count} contacts`);
    if (p.best_connector) console.log(`      Best: ${p.best_connector}`);
  });
}

main().catch(console.error);
