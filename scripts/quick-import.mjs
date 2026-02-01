#!/usr/bin/env node
// Quick import script - runs synchronously in smaller chunks
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
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
  console.log('📋 IMPORTING PROSPECTS...');
  
  // Load seed data
  const seedPath = join(__dirname, '..', 'src', 'data', 'helix-prospects-seed.json');
  const seedData = JSON.parse(readFileSync(seedPath, 'utf-8'));
  
  let imported = 0;
  let updated = 0;
  for (const p of seedData.prospects) {
    // Check if exists
    const { data: existing } = await supabase
      .from('prospects')
      .select('id')
      .eq('team_id', TEAM_ID)
      .eq('company_domain', p.company_domain)
      .single();
    
    if (existing) {
      // Update
      await supabase.from('prospects').update({
        company_name: p.company_name,
        company_industry: p.company_industry,
        funding_stage: p.funding_stage,
      }).eq('id', existing.id);
      updated++;
    } else {
      // Insert
      const { error } = await supabase.from('prospects').insert({
        team_id: TEAM_ID,
        company_name: p.company_name,
        company_domain: p.company_domain,
        company_industry: p.company_industry,
        funding_stage: p.funding_stage,
        status: 'new',
      });
      if (!error) imported++;
      else console.log(`   ❌ ${p.company_domain}: ${error.message}`);
    }
  }
  console.log(`   ✅ Imported ${imported} new, updated ${updated} existing`);

  console.log('\n🔗 MATCHING WITH CONTACTS...');
  
  // Get all prospects
  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, company_name, company_domain')
    .eq('team_id', TEAM_ID);
  
  let matched = 0;
  for (const prospect of prospects || []) {
    // Find contacts at this company by name OR domain
    const companyName = prospect.company_name?.toLowerCase() || '';
    
    // Try domain match first
    let { data: contacts } = await supabase
      .from('contacts')
      .select('id, full_name, current_title, email, linkedin_url, connection_strength')
      .eq('team_id', TEAM_ID)
      .eq('company_domain', prospect.company_domain);
    
    // If no domain match, try company name match (case insensitive via ilike)
    if (!contacts?.length && companyName) {
      const { data: nameContacts } = await supabase
        .from('contacts')
        .select('id, full_name, current_title, email, linkedin_url, connection_strength')
        .eq('team_id', TEAM_ID)
        .ilike('current_company', `%${companyName}%`);
      contacts = nameContacts;
    }
    
    if (!contacts?.length) continue;
    matched++;
    console.log(`   Found ${contacts.length} contacts at ${prospect.company_name}`);
    
    // Get best connection
    const best = contacts.reduce((a, b) => (b.connection_strength || 0) > (a.connection_strength || 0) ? b : a);
    
    // Get connection info
    const { data: connInfo } = await supabase
      .from('contact_connections')
      .select('connector_name, connection_strength')
      .eq('contact_id', best.id)
      .order('connection_strength', { ascending: false })
      .limit(1);
    
    // Update prospect
    await supabase.from('prospects').update({
      has_warm_intro: (best.connection_strength || 0) >= 0.5,
      connection_score: Math.round((best.connection_strength || 0) * 100),
      best_connector: connInfo?.[0]?.connector_name || null,
      connections_count: contacts.length,
    }).eq('id', prospect.id);
  }
  console.log(`   ✅ Matched ${matched} prospects with contacts`);

  console.log('\n📊 SCORING HELIX FIT...');
  
  // Score all prospects
  const { data: allProspects } = await supabase
    .from('prospects')
    .select('id, company_name, company_domain, connection_score')
    .eq('team_id', TEAM_ID);
  
  const highFit = ['ticket', 'event', 'sneaker', 'drop', 'social', 'game', 'auth', 'identity', 'captcha', 'bot'];
  const medFit = ['fintech', 'bank', 'dating', 'market', 'commerce', 'platform'];
  
  for (const p of allProspects || []) {
    let score = 30;
    const text = `${p.company_name} ${p.company_domain}`.toLowerCase();
    
    for (const kw of highFit) if (text.includes(kw)) score = Math.min(100, score + 25);
    for (const kw of medFit) if (text.includes(kw)) score = Math.min(100, score + 15);
    
    const priority = Math.round(score * 0.4 + (p.connection_score || 0) * 0.6);
    
    await supabase.from('prospects').update({
      helix_fit_score: score,
      priority_score: priority,
    }).eq('id', p.id);
  }
  console.log(`   ✅ Scored ${allProspects?.length || 0} prospects`);

  console.log('\n🏆 TOP 15 PROSPECTS:');
  const { data: top } = await supabase
    .from('prospects')
    .select('company_name, company_domain, priority_score, helix_fit_score, connection_score, has_warm_intro, best_connector')
    .eq('team_id', TEAM_ID)
    .order('priority_score', { ascending: false })
    .limit(15);
  
  top?.forEach((p, i) => {
    const warm = p.has_warm_intro ? '🤝' : '  ';
    const conn = p.best_connector ? ` via ${p.best_connector}` : '';
    console.log(`${i+1}. ${warm} ${p.company_name} (${p.company_domain}) - Priority: ${p.priority_score}%${conn}`);
  });
  
  // Final counts
  const { count: total } = await supabase.from('prospects').select('*', { count: 'exact', head: true }).eq('team_id', TEAM_ID);
  const { count: withIntro } = await supabase.from('prospects').select('*', { count: 'exact', head: true }).eq('team_id', TEAM_ID).eq('has_warm_intro', true);
  
  console.log(`\n📈 SUMMARY: ${total} prospects, ${withIntro} with warm intros`);
}

main().catch(console.error);
