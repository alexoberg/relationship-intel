#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
readFileSync(join(__dirname, '..', '.env.local'), 'utf-8').split('\n').forEach(l => { 
  const m = l.match(/^([^#=]+)=(.*)$/); 
  if (m) env[m[1].trim()] = m[2].trim(); 
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const TEAM_ID = 'aa2e0a01-03e4-419c-971a-0a80b187778f';

const prospects = [
  { company_name: 'Ticketmaster', company_domain: 'ticketmaster.com', company_industry: 'Entertainment/Ticketing', funding_stage: 'public', helix_fit_score: 95, helix_fit_reason: 'Huge bot/scalper problem. Bot Sorter perfect for checkout protection.', helix_products: ['captcha_replacement'] },
  { company_name: 'Live Nation', company_domain: 'livenation.com', company_industry: 'Entertainment', funding_stage: 'public', helix_fit_score: 92, helix_fit_reason: 'Enterprise scale. Bot protection across all properties.', helix_products: ['captcha_replacement', 'age_verification'] },
  { company_name: 'Eventbrite', company_domain: 'eventbrite.com', company_industry: 'Ticketing', funding_stage: 'public', helix_fit_score: 88, helix_fit_reason: 'Ticketing = bot target. Self-service means automated attacks.', helix_products: ['captcha_replacement'] },
  { company_name: 'StubHub', company_domain: 'stubhub.com', company_industry: 'Ticketing', funding_stage: 'private_equity', helix_fit_score: 90, helix_fit_reason: 'Resale market heavily botted. Account takeover risk.', helix_products: ['captcha_replacement'] },
  { company_name: 'Stripe', company_domain: 'stripe.com', company_industry: 'Fintech', funding_stage: 'series_i', helix_fit_score: 85, helix_fit_reason: 'Fraud prevention critical. Card testing bots.', helix_products: ['captcha_replacement', 'voice_captcha'] },
  { company_name: 'Coinbase', company_domain: 'coinbase.com', company_industry: 'Crypto', funding_stage: 'public', helix_fit_score: 88, helix_fit_reason: 'High-value accounts = bot targets. Identity verification.', helix_products: ['captcha_replacement', 'voice_captcha'] },
  { company_name: 'Discord', company_domain: 'discord.com', company_industry: 'Social/Gaming', funding_stage: 'series_h', helix_fit_score: 90, helix_fit_reason: 'Spam bots everywhere. Age verification for servers.', helix_products: ['captcha_replacement', 'age_verification'] },
  { company_name: 'Roblox', company_domain: 'roblox.com', company_industry: 'Gaming', funding_stage: 'public', helix_fit_score: 92, helix_fit_reason: 'COPPA compliance critical. Age verification mandatory.', helix_products: ['captcha_replacement', 'age_verification'] },
  { company_name: 'Epic Games', company_domain: 'epicgames.com', company_industry: 'Gaming', funding_stage: 'private', helix_fit_score: 88, helix_fit_reason: 'Account security for valuable skins. Bot/cheat detection.', helix_products: ['captcha_replacement', 'age_verification'] },
  { company_name: 'Uber', company_domain: 'uber.com', company_industry: 'Transportation', funding_stage: 'public', helix_fit_score: 84, helix_fit_reason: 'Driver/rider verification. Fraud prevention.', helix_products: ['captcha_replacement', 'voice_captcha'] },
  { company_name: 'Airbnb', company_domain: 'airbnb.com', company_industry: 'Travel', funding_stage: 'public', helix_fit_score: 85, helix_fit_reason: 'Host/guest verification critical. Identity for trust.', helix_products: ['captcha_replacement', 'voice_captcha'] },
  { company_name: 'DoorDash', company_domain: 'doordash.com', company_industry: 'Delivery', funding_stage: 'public', helix_fit_score: 82, helix_fit_reason: 'Promo abuse bots. Driver verification.', helix_products: ['captcha_replacement', 'voice_captcha'] },
];

(async () => {
  const { data: existing } = await supabase.from('prospects').select('company_domain').eq('team_id', TEAM_ID);
  const existingDomains = new Set(existing?.map(p => p.company_domain) || []);
  
  for (const p of prospects) {
    if (existingDomains.has(p.company_domain)) { console.log('⏭️', p.company_name); continue; }
    const { error } = await supabase.from('prospects').insert({ ...p, team_id: TEAM_ID, status: 'new' });
    if (error) console.log('❌', p.company_name, error.message);
    else console.log('✅', p.company_name);
  }
})();
