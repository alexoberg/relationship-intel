#!/usr/bin/env node
// Fix prospect-contact matching - use exact matches only
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
  console.log('🔧 FIXING PROSPECT-CONTACT MATCHING\n');

  // First, reset all connection scores
  console.log('Resetting all connection scores...');
  await supabase.from('prospects').update({
    connection_score: 0,
    has_warm_intro: false,
    best_connector: null,
    connections_count: 0,
  }).eq('team_id', TEAM_ID);

  // Get all prospects
  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, company_name, company_domain')
    .eq('team_id', TEAM_ID);

  console.log(`Processing ${prospects?.length || 0} prospects...\n`);

  let matched = 0;
  for (const prospect of prospects || []) {
    // EXACT match on company_domain first
    let contacts = [];
    if (prospect.company_domain) {
      const { data } = await supabase
        .from('contacts')
        .select('id, full_name, current_title, email, linkedin_url, connection_strength')
        .eq('team_id', TEAM_ID)
        .eq('company_domain', prospect.company_domain);
      if (data?.length) contacts = data;
    }

    // If no domain match, try EXACT company name match (case insensitive)
    if (!contacts.length && prospect.company_name) {
      const { data } = await supabase
        .from('contacts')
        .select('id, full_name, current_title, email, linkedin_url, connection_strength')
        .eq('team_id', TEAM_ID)
        .ilike('current_company', prospect.company_name);  // exact match, just case insensitive
      if (data?.length) contacts = data;
    }

    if (!contacts.length) continue;

    matched++;
    console.log(`✅ ${prospect.company_name}: ${contacts.length} contacts`);

    // Get best connection strength
    const best = contacts.reduce((a, b) => 
      (b.connection_strength || 0) > (a.connection_strength || 0) ? b : a
    );

    // Get connector info for best contact
    const { data: connInfo } = await supabase
      .from('contact_connections')
      .select('connector_name, connection_strength')
      .eq('contact_id', best.id)
      .order('connection_strength', { ascending: false })
      .limit(1);

    // Calculate connection score (0-100)
    const connScore = Math.round((best.connection_strength || 0) * 100);

    // Update prospect
    await supabase.from('prospects').update({
      connection_score: connScore,
      has_warm_intro: connScore >= 50,
      best_connector: connInfo?.[0]?.connector_name || null,
      connections_count: contacts.length,
    }).eq('id', prospect.id);
  }

  console.log(`\n✅ Matched ${matched} prospects with contacts`);

  // Show top 10 by priority
  console.log('\n🏆 TOP 10 BY PRIORITY (after fix):');
  const { data: top } = await supabase
    .from('prospects')
    .select('company_name, company_domain, priority_score, helix_fit_score, connection_score, has_warm_intro, best_connector, connections_count')
    .eq('team_id', TEAM_ID)
    .order('priority_score', { ascending: false })
    .limit(10);

  top?.forEach((p, i) => {
    const warm = p.has_warm_intro ? '🤝' : '  ';
    const conn = p.best_connector ? ` via ${p.best_connector}` : '';
    console.log(`${i+1}. ${warm} ${p.company_name} (${p.connections_count || 0} contacts) - Priority: ${p.priority_score}%${conn}`);
  });
}

main().catch(console.error);
