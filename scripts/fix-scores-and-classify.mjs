#!/usr/bin/env node
// Fix scoring bug + classify industries
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

// Helix fit keywords (scores are 0-100)
const HIGH_FIT = ['ticket', 'event', 'concert', 'live', 'sneaker', 'drop', 'hype', 'social', 'game', 'gaming', 'auth', 'identity', 'verify', 'captcha', 'bot', 'dating', 'match'];
const MED_FIT = ['fintech', 'bank', 'finance', 'market', 'commerce', 'platform', 'neobank', 'kyc', 'fraud'];

// Industry classification
function classifyIndustry(name, domain, existingIndustry) {
  if (existingIndustry && existingIndustry.length > 2) return existingIndustry;
  
  const text = `${name} ${domain}`.toLowerCase();
  
  if (text.match(/ticket|event|concert|live|venue|festival/)) return 'Ticketing & Events';
  if (text.match(/sneaker|shoe|kicks|goat|stockx|grail/)) return 'Sneakers & Streetwear';
  if (text.match(/dating|match|tinder|bumble|hinge|love/)) return 'Dating & Social Discovery';
  if (text.match(/game|gaming|play|esport|vr|metaverse/)) return 'Gaming';
  if (text.match(/social|community|network|chat|message/)) return 'Social Networks';
  if (text.match(/bank|fintech|payment|money|finance|lending/)) return 'Fintech & Banking';
  if (text.match(/identity|auth|verify|kyc|id\.|clear/)) return 'Identity & Verification';
  if (text.match(/market|commerce|shop|buy|sell|trade/)) return 'Marketplace & E-commerce';
  if (text.match(/creator|content|video|stream|media/)) return 'Creator & Media';
  if (text.match(/travel|hotel|flight|booking/)) return 'Travel & Hospitality';
  if (text.match(/health|medical|wellness/)) return 'Healthcare';
  
  return 'Other';
}

async function main() {
  console.log('🔧 FIXING SCORES & CLASSIFYING INDUSTRIES\n');

  // Get all prospects
  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, company_name, company_domain, company_industry, connection_score')
    .eq('team_id', TEAM_ID);

  console.log(`Processing ${prospects?.length || 0} prospects...\n`);

  let scored = 0;
  for (const p of prospects || []) {
    const text = `${p.company_name} ${p.company_domain}`.toLowerCase();
    
    // Calculate Helix fit (0-100)
    let helixFit = 30; // base
    for (const kw of HIGH_FIT) if (text.includes(kw)) helixFit = Math.min(100, helixFit + 20);
    for (const kw of MED_FIT) if (text.includes(kw)) helixFit = Math.min(100, helixFit + 12);
    
    // Priority = helix_fit * 0.4 + connection * 0.6
    const connScore = p.connection_score || 0;
    const priority = Math.round(helixFit * 0.4 + connScore * 0.6);
    
    // Classify industry
    const industry = classifyIndustry(p.company_name, p.company_domain, p.company_industry);
    
    // Note: priority_score is a generated column, don't update it directly
    await supabase.from('prospects').update({
      helix_fit_score: helixFit,
      company_industry: industry,
    }).eq('id', p.id);
    
    scored++;
  }

  console.log(`✅ Scored and classified ${scored} prospects\n`);

  // Show distribution
  const { data: byIndustry } = await supabase
    .from('prospects')
    .select('company_industry')
    .eq('team_id', TEAM_ID);
  
  const counts = {};
  byIndustry?.forEach(p => {
    counts[p.company_industry] = (counts[p.company_industry] || 0) + 1;
  });
  
  console.log('📊 INDUSTRY DISTRIBUTION:');
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([ind, cnt]) => console.log(`   ${ind}: ${cnt}`));

  // Show top 20
  console.log('\n🏆 TOP 20 BY PRIORITY:');
  const { data: top } = await supabase
    .from('prospects')
    .select('company_name, company_domain, company_industry, funding_stage, priority_score, helix_fit_score, connection_score, has_warm_intro, best_connector')
    .eq('team_id', TEAM_ID)
    .order('priority_score', { ascending: false })
    .limit(20);
  
  top?.forEach((p, i) => {
    const warm = p.has_warm_intro ? '🤝' : '  ';
    const conn = p.best_connector ? ` (via ${p.best_connector})` : '';
    console.log(`${String(i+1).padStart(2)}. ${warm} ${p.company_name.padEnd(25)} | ${p.company_industry?.padEnd(22) || 'Unknown'.padEnd(22)} | ${(p.funding_stage || 'N/A').padEnd(10)} | Priority: ${p.priority_score}%${conn}`);
  });
}

main().catch(console.error);
