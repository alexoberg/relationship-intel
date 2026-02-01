#!/usr/bin/env node
// Add prospects from CLEAR, World ID, ID.me competitor research
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

// New prospects from competitor customer research
const newProspects = [
  // World ID / Tools for Humanity customers - GAMING
  { company_name: "Mythical Games", company_domain: "mythicalgames.com", company_industry: "Gaming/Blockchain", funding_stage: "series_c", notes: "World ID integration for NFL Rivals, FIFA Rivals, Pudgy Party" },
  { company_name: "Tokyo Beast", company_domain: "tokyobeast.com", company_industry: "Gaming", funding_stage: "seed", notes: "First Razer ID + World ID integration game" },
  { company_name: "Immutable", company_domain: "immutable.com", company_industry: "Gaming/Web3", funding_stage: "series_c", notes: "Blockchain gaming infrastructure" },
  { company_name: "Axie Infinity (Sky Mavis)", company_domain: "skymavis.com", company_industry: "Gaming/Web3", funding_stage: "series_b", notes: "P2E gaming, bot problems" },
  
  // Dating apps needing verification (Match Group competitors)
  { company_name: "Bumble", company_domain: "bumble.com", company_industry: "Dating", funding_stage: "public", notes: "Has optional ID verification, competes with Tinder" },
  { company_name: "Feeld", company_domain: "feeld.co", company_industry: "Dating", funding_stage: "series_a", notes: "Alternative dating app" },
  { company_name: "Thursday", company_domain: "getthursday.com", company_industry: "Dating", funding_stage: "seed", notes: "Once-a-week dating app" },
  { company_name: "Iris Dating", company_domain: "irisdating.com", company_industry: "Dating", funding_stage: "seed", notes: "AI-powered dating" },
  { company_name: "Lox Club", company_domain: "loxclub.com", company_industry: "Dating", funding_stage: "seed", notes: "Members-only dating" },
  { company_name: "The League", company_domain: "theleague.com", company_industry: "Dating", funding_stage: "series_a", notes: "Exclusive dating app" },
  { company_name: "Coffee Meets Bagel", company_domain: "coffeemeetsbagel.com", company_industry: "Dating", funding_stage: "series_b", notes: "Curated dating" },
  { company_name: "Hily", company_domain: "hily.com", company_industry: "Dating", funding_stage: "series_a", notes: "AI-powered dating" },
  { company_name: "Snack", company_domain: "snack.dating", company_industry: "Dating", funding_stage: "seed", notes: "Video-first dating" },
  { company_name: "Dispo", company_domain: "dispo.fun", company_industry: "Social/Dating", funding_stage: "series_a", notes: "Photo social app" },
  
  // Identity verification competitors/partners (proof-of-humanity)
  { company_name: "Self", company_domain: "self.ai", company_industry: "Identity/ZK", funding_stage: "seed", notes: "$9M seed - proof-of-humanity, ZK proofs" },
  { company_name: "Prosopo", company_domain: "prosopo.io", company_industry: "Bot Protection", funding_stage: "seed", notes: "Privacy-first bot prevention" },
  { company_name: "IdBase", company_domain: "idbase.com", company_industry: "Identity/Ticketing", funding_stage: "seed", notes: "authenTICKET technology" },
  { company_name: "Tixbase", company_domain: "tixbase.com", company_industry: "Ticketing/Blockchain", funding_stage: "seed", notes: "TixChain + TixID verification" },
  { company_name: "Anon Aadhaar", company_domain: "anonaadhaar.org", company_industry: "Identity/ZK", funding_stage: "seed", notes: "ZK proof of Indian identity" },
  
  // Gaming anti-bot market (companies needing human verification)
  { company_name: "Scopely", company_domain: "scopely.com", company_industry: "Gaming", funding_stage: "series_e", notes: "Mobile gaming, acquired by Savvy" },
  { company_name: "Supercell", company_domain: "supercell.com", company_industry: "Gaming", funding_stage: "acquired", notes: "Clash of Clans, bot issues" },
  { company_name: "Com2uS", company_domain: "com2us.com", company_industry: "Gaming", funding_stage: "public", notes: "Mobile gaming" },
  { company_name: "Jam City", company_domain: "jamcity.com", company_industry: "Gaming", funding_stage: "series_d", notes: "Mobile gaming studio" },
  { company_name: "Kabam", company_domain: "kabam.com", company_industry: "Gaming", funding_stage: "acquired", notes: "Mobile gaming, Marvel games" },
  { company_name: "Pocket Gems", company_domain: "pocketgems.com", company_industry: "Gaming", funding_stage: "series_d", notes: "Mobile gaming studio" },
  { company_name: "Rec Room", company_domain: "recroom.com", company_industry: "Gaming/Social", funding_stage: "series_d", notes: "Social gaming, VR" },
  { company_name: "VRChat", company_domain: "vrchat.com", company_industry: "Gaming/Social", funding_stage: "series_d", notes: "Social VR platform" },
  { company_name: "Roblox Corp", company_domain: "roblox.com", company_industry: "Gaming", funding_stage: "public", notes: "Major bot/identity issues" },
  
  // E-commerce/Drops (high-demand items needing bot protection)
  { company_name: "GOAT", company_domain: "goat.com", company_industry: "Sneaker Marketplace", funding_stage: "series_f", notes: "Sneaker resale, authentication" },
  { company_name: "StockX", company_domain: "stockx.com", company_industry: "Sneaker Marketplace", funding_stage: "series_e", notes: "Sneaker/collectibles exchange" },
  { company_name: "Whatnot", company_domain: "whatnot.com", company_industry: "Live Commerce", funding_stage: "series_d", notes: "Live shopping, collectibles" },
  { company_name: "NTWRK", company_domain: "thentwrk.com", company_industry: "Live Commerce", funding_stage: "series_b", notes: "Drop shopping platform" },
  { company_name: "Depop", company_domain: "depop.com", company_industry: "Marketplace", funding_stage: "acquired", notes: "Gen-Z marketplace" },
  { company_name: "Mercari", company_domain: "mercari.com", company_industry: "Marketplace", funding_stage: "public", notes: "C2C marketplace" },
  { company_name: "Poshmark", company_domain: "poshmark.com", company_industry: "Marketplace", funding_stage: "acquired", notes: "Fashion resale" },
  { company_name: "Vinted", company_domain: "vinted.com", company_industry: "Marketplace", funding_stage: "series_f", notes: "Second-hand fashion" },
  
  // Ticketing (anti-scalping/bot protection)
  { company_name: "DICE", company_domain: "dice.fm", company_industry: "Ticketing", funding_stage: "series_c", notes: "Anti-scalping ticketing" },
  { company_name: "Pollen", company_domain: "pollen.co", company_industry: "Ticketing/Travel", funding_stage: "series_c", notes: "Group travel/events" },
  { company_name: "Fever", company_domain: "feverup.com", company_industry: "Events", funding_stage: "series_e", notes: "Experience discovery" },
  { company_name: "Shotgun", company_domain: "shotgun.live", company_industry: "Ticketing", funding_stage: "series_a", notes: "Music event ticketing" },
  { company_name: "TicketSwap", company_domain: "ticketswap.com", company_industry: "Ticketing", funding_stage: "series_b", notes: "Fan-to-fan ticket exchange" },
  { company_name: "SeatGeek", company_domain: "seatgeek.com", company_industry: "Ticketing", funding_stage: "series_e", notes: "Ticket marketplace" },
  { company_name: "Gametime", company_domain: "gametime.co", company_industry: "Ticketing", funding_stage: "series_d", notes: "Last-minute tickets" },
  
  // Fintech needing KYC/identity
  { company_name: "Chime", company_domain: "chime.com", company_industry: "Neobank", funding_stage: "series_g", notes: "Digital banking" },
  { company_name: "Current", company_domain: "current.com", company_industry: "Neobank", funding_stage: "series_d", notes: "Teen/young adult banking" },
  { company_name: "Dave", company_domain: "dave.com", company_industry: "Neobank", funding_stage: "public", notes: "Banking app" },
  { company_name: "Step", company_domain: "step.com", company_industry: "Neobank", funding_stage: "series_c", notes: "Teen banking" },
  { company_name: "Greenlight", company_domain: "greenlight.com", company_industry: "Neobank", funding_stage: "series_d", notes: "Kids/family banking" },
  { company_name: "GoHenry", company_domain: "gohenry.com", company_industry: "Neobank", funding_stage: "series_d", notes: "Kids money management" },
  
  // Social platforms with bot problems
  { company_name: "Mastodon", company_domain: "joinmastodon.org", company_industry: "Social", funding_stage: "non-profit", notes: "Decentralized social" },
  { company_name: "Threads (Meta)", company_domain: "threads.net", company_industry: "Social", funding_stage: "meta", notes: "Twitter competitor" },
  { company_name: "Hive Social", company_domain: "hivesocial.app", company_industry: "Social", funding_stage: "seed", notes: "Twitter alternative" },
  { company_name: "Post.news", company_domain: "post.news", company_industry: "Social", funding_stage: "seed", notes: "News social platform" },
  { company_name: "T2", company_domain: "t2.social", company_industry: "Social", funding_stage: "seed", notes: "Twitter alternative" },
  { company_name: "Spill", company_domain: "spill.com", company_industry: "Social", funding_stage: "seed", notes: "Culture-focused social" },
  { company_name: "Artifact", company_domain: "artifact.news", company_industry: "Social/News", funding_stage: "seed", notes: "AI news app (Instagram founders)" },
];

async function main() {
  console.log('🎯 ADDING COMPETITOR CUSTOMER PROSPECTS\n');
  console.log(`Adding ${newProspects.length} new prospects from CLEAR/World ID/ID.me research...\n`);

  let added = 0, updated = 0, errors = 0;

  for (const p of newProspects) {
    // Check if exists
    const { data: existing } = await supabase
      .from('prospects')
      .select('id')
      .eq('team_id', TEAM_ID)
      .eq('company_domain', p.company_domain)
      .single();

    if (existing) {
      await supabase.from('prospects').update({
        company_name: p.company_name,
        company_industry: p.company_industry,
        funding_stage: p.funding_stage,
        helix_fit_reason: p.notes,
      }).eq('id', existing.id);
      updated++;
    } else {
      const { error } = await supabase.from('prospects').insert({
        team_id: TEAM_ID,
        company_name: p.company_name,
        company_domain: p.company_domain,
        company_industry: p.company_industry,
        funding_stage: p.funding_stage,
        helix_fit_reason: p.notes,
        status: 'new',
      });
      if (error) {
        console.log(`❌ ${p.company_domain}: ${error.message}`);
        errors++;
      } else {
        added++;
      }
    }
  }

  console.log(`✅ Added ${added} new prospects`);
  console.log(`✅ Updated ${updated} existing prospects`);
  if (errors > 0) console.log(`⚠️  ${errors} errors`);

  // Get final count
  const { count } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', TEAM_ID);
  
  console.log(`\n📊 TOTAL PROSPECTS: ${count}`);
}

main().catch(console.error);
