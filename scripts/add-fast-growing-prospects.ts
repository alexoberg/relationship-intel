// Script to add fast-growing companies based on user feedback patterns
// Run with: npx tsx scripts/add-fast-growing-prospects.ts

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load env vars manually
const envContent = readFileSync('.env.local', 'utf-8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

// Fast-growing companies based on user's high-rated verticals:
// - Prediction markets / betting (9-10 ratings)
// - Collectibles / trading cards (9-10 ratings)
// - Age-gated content (10 ratings)
// - Gaming platforms (7-8 ratings)
// - Dating apps (7+ ratings)
// - Social networks (10 ratings)
const fastGrowingProspects = [
  // PREDICTION MARKETS / FANTASY SPORTS (User loves these - 9-10 ratings)
  {
    company_name: 'PrizePicks',
    company_domain: 'prizepicks.com',
    company_industry: 'Fantasy Sports / Betting',
    funding_stage: 'series_c',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Largest daily fantasy sports platform in US - needs age verification for betting compliance and bot prevention for entry manipulation',
    helix_fit_score: 92,
  },
  {
    company_name: 'Underdog Fantasy',
    company_domain: 'underdogfantasy.com',
    company_industry: 'Fantasy Sports / Betting',
    funding_stage: 'series_b',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Fast-growing fantasy sports platform - needs age verification and bot prevention for fair play',
    helix_fit_score: 90,
  },
  {
    company_name: 'Sleeper',
    company_domain: 'sleeper.com',
    company_industry: 'Fantasy Sports / Social',
    funding_stage: 'series_c',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Social fantasy sports app with 6M+ users - needs bot prevention for league manipulation and age gates',
    helix_fit_score: 88,
  },
  {
    company_name: 'Betr',
    company_domain: 'betr.app',
    company_industry: 'Sports Betting',
    funding_stage: 'series_a',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Jake Paul backed micro-betting platform - needs age verification and bot prevention',
    helix_fit_score: 88,
  },
  {
    company_name: 'Fliff',
    company_domain: 'fliff.com',
    company_industry: 'Social Sportsbook',
    funding_stage: 'series_a',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Social sportsbook gaming platform - needs age verification and bot prevention',
    helix_fit_score: 85,
  },
  {
    company_name: 'Manifold Markets',
    company_domain: 'manifold.markets',
    company_industry: 'Prediction Markets',
    funding_stage: 'seed',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Play-money prediction market - needs bot prevention for market manipulation',
    helix_fit_score: 82,
  },

  // COLLECTIBLES / TRADING CARDS (User loves these - 9-10 ratings for Misprint, Collectibles.com)
  {
    company_name: 'Arena Club',
    company_domain: 'arenaclub.com',
    company_industry: 'Sports Card Marketplace',
    funding_stage: 'series_a',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Derek Jeter\'s sports card marketplace - needs bot prevention for limited drops and authentication',
    helix_fit_score: 90,
  },
  {
    company_name: 'Goldin',
    company_domain: 'goldin.co',
    company_industry: 'Collectibles Auction',
    funding_stage: 'series_a',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'High-end collectibles auction house (Ken Goldin) - needs bot prevention for bidding wars',
    helix_fit_score: 88,
  },
  {
    company_name: 'PWCC',
    company_domain: 'pwccmarketplace.com',
    company_industry: 'Trading Card Marketplace',
    funding_stage: 'series_a',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Major trading card marketplace and vault - needs bot prevention for auctions',
    helix_fit_score: 85,
  },
  {
    company_name: 'Loupe',
    company_domain: 'getloupe.com',
    company_industry: 'Sports Card Marketplace',
    funding_stage: 'seed',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Live sports card breaking platform - needs bot prevention for live sales',
    helix_fit_score: 85,
  },
  {
    company_name: 'Dibbs',
    company_domain: 'dibbs.io',
    company_industry: 'Fractional Collectibles',
    funding_stage: 'series_a',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Fractional sports card ownership platform - needs bot prevention',
    helix_fit_score: 82,
  },
  {
    company_name: 'Dapper Labs',
    company_domain: 'dapperlabs.com',
    company_industry: 'NFT / Collectibles',
    funding_stage: 'series_d',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'NBA Top Shot creator - MAJOR bot problem on drops, needs prevention',
    helix_fit_score: 88,
  },
  {
    company_name: 'Candy Digital',
    company_domain: 'candy.com',
    company_industry: 'Sports NFT',
    funding_stage: 'series_a',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Official MLB/NFL NFT platform - needs bot prevention for drops',
    helix_fit_score: 85,
  },

  // MESSAGING / COMMUNITY (User rated Signal/Telegram 9-10)
  {
    company_name: 'Discord',
    company_domain: 'discord.com',
    company_industry: 'Messaging / Gaming',
    funding_stage: 'private',
    helix_products: ['captcha_replacement', 'voice_captcha', 'age_verification'],
    helix_fit_reason: 'MASSIVE platform with 150M+ users - needs bot prevention for spam/raids, age gates for NSFW servers',
    helix_fit_score: 95,
  },
  {
    company_name: 'Guilded',
    company_domain: 'guilded.gg',
    company_industry: 'Gaming Community',
    funding_stage: 'acquired',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Gaming community platform (Roblox-owned) - needs bot prevention for spam',
    helix_fit_score: 80,
  },
  {
    company_name: 'Geneva',
    company_domain: 'geneva.com',
    company_industry: 'Community Platform',
    funding_stage: 'series_b',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Group chat/community platform - needs bot prevention for spam',
    helix_fit_score: 78,
  },

  // SOCIAL NETWORKS (User rated Bluesky 10)
  {
    company_name: 'BeReal',
    company_domain: 'bereal.com',
    company_industry: 'Social Media',
    funding_stage: 'series_b',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Authentic social app focused on real moments - needs bot/fake account prevention',
    helix_fit_score: 85,
  },
  {
    company_name: 'Lemon8',
    company_domain: 'lemon8-app.com',
    company_industry: 'Social Media',
    funding_stage: 'private',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'TikTok sister app growing fast - needs bot prevention and age verification',
    helix_fit_score: 82,
  },
  {
    company_name: 'Letterboxd',
    company_domain: 'letterboxd.com',
    company_industry: 'Social / Reviews',
    funding_stage: 'series_a',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Movie review social app with 10M+ users - needs bot prevention for fake reviews',
    helix_fit_score: 78,
  },

  // AGE-GATED CONTENT (User rated OnlyFans/Patreon 10)
  {
    company_name: 'Fansly',
    company_domain: 'fansly.com',
    company_industry: 'Creator Economy / Adult',
    funding_stage: 'private',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'OnlyFans competitor - CRITICAL age verification need for adult content',
    helix_fit_score: 92,
  },
  {
    company_name: 'Fanvue',
    company_domain: 'fanvue.com',
    company_industry: 'Creator Economy / Adult',
    funding_stage: 'seed',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Creator platform with adult content - age verification mandatory',
    helix_fit_score: 88,
  },
  {
    company_name: 'Pornhub',
    company_domain: 'pornhub.com',
    company_industry: 'Adult Content',
    funding_stage: 'private',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'MAJOR adult platform - facing regulatory pressure for age verification worldwide',
    helix_fit_score: 95,
  },
  {
    company_name: 'xHamster',
    company_domain: 'xhamster.com',
    company_industry: 'Adult Content',
    funding_stage: 'private',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Major adult platform - needs age verification for regulatory compliance',
    helix_fit_score: 90,
  },

  // ALCOHOL DELIVERY (Age verification critical)
  {
    company_name: 'Drizly',
    company_domain: 'drizly.com',
    company_industry: 'Alcohol Delivery',
    funding_stage: 'acquired',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Alcohol delivery platform (Uber-owned) - CRITICAL age verification need',
    helix_fit_score: 88,
  },
  {
    company_name: 'Minibar Delivery',
    company_domain: 'minibardelivery.com',
    company_industry: 'Alcohol Delivery',
    funding_stage: 'series_b',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Alcohol delivery platform - age verification required by law',
    helix_fit_score: 85,
  },
  {
    company_name: 'Vivino',
    company_domain: 'vivino.com',
    company_industry: 'Wine / E-commerce',
    funding_stage: 'series_d',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Wine marketplace and rating app - needs age verification for purchases',
    helix_fit_score: 82,
  },

  // CANNABIS (Age verification mandatory)
  {
    company_name: 'Eaze',
    company_domain: 'eaze.com',
    company_industry: 'Cannabis Delivery',
    funding_stage: 'series_d',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Cannabis delivery platform - MANDATORY age verification (21+)',
    helix_fit_score: 90,
  },
  {
    company_name: 'Weedmaps',
    company_domain: 'weedmaps.com',
    company_industry: 'Cannabis Platform',
    funding_stage: 'public',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Cannabis marketplace and discovery - age verification required',
    helix_fit_score: 88,
  },
  {
    company_name: 'Dutchie',
    company_domain: 'dutchie.com',
    company_industry: 'Cannabis Tech',
    funding_stage: 'series_d',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Cannabis dispensary e-commerce platform - age verification critical',
    helix_fit_score: 88,
  },
  {
    company_name: 'Jane Technologies',
    company_domain: 'iheartjane.com',
    company_industry: 'Cannabis E-commerce',
    funding_stage: 'series_c',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Cannabis ordering platform - age verification required for compliance',
    helix_fit_score: 85,
  },
  {
    company_name: 'Leafly',
    company_domain: 'leafly.com',
    company_industry: 'Cannabis Platform',
    funding_stage: 'public',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Cannabis information and ordering platform - needs age verification',
    helix_fit_score: 85,
  },

  // DATING (User rated The League 7, dating is key vertical)
  {
    company_name: 'Coffee Meets Bagel',
    company_domain: 'coffeemeetsbagel.com',
    company_industry: 'Dating',
    funding_stage: 'series_b',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Dating app with curated matches - needs fake profile prevention',
    helix_fit_score: 82,
  },
  {
    company_name: 'Lex',
    company_domain: 'thisislex.app',
    company_industry: 'Dating / LGBTQ',
    funding_stage: 'series_a',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'LGBTQ+ dating and community app - needs verification for safety',
    helix_fit_score: 80,
  },
  {
    company_name: 'Kippo',
    company_domain: 'kippo.love',
    company_industry: 'Gaming Dating',
    funding_stage: 'series_a',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Dating app for gamers - needs bot prevention for fake profiles',
    helix_fit_score: 80,
  },
  {
    company_name: 'Archer',
    company_domain: 'archer.dating',
    company_industry: 'Dating / Gay',
    funding_stage: 'seed',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Gay dating app from Grindr founders - needs fake profile prevention',
    helix_fit_score: 78,
  },

  // GAMING (User rated gaming companies 7-8)
  {
    company_name: 'Overwolf',
    company_domain: 'overwolf.com',
    company_industry: 'Gaming Platform',
    funding_stage: 'series_c',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Gaming overlay/mod platform with 35M+ users - needs bot prevention',
    helix_fit_score: 82,
  },
  {
    company_name: 'Minehut',
    company_domain: 'minehut.com',
    company_industry: 'Gaming / Minecraft',
    funding_stage: 'acquired',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Minecraft server hosting with young users - bot prevention and age verification',
    helix_fit_score: 80,
  },
  {
    company_name: 'Manticore Games',
    company_domain: 'manticoregames.com',
    company_industry: 'Gaming Platform',
    funding_stage: 'series_c',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Core (Roblox competitor) - needs bot prevention and age verification',
    helix_fit_score: 85,
  },
];

async function addFastGrowingProspects() {
  const { data: team } = await supabase
    .from('teams')
    .select('id')
    .limit(1)
    .single();

  if (!team) {
    console.error('No team found');
    return;
  }

  console.log(`Adding prospects to team: ${team.id}\n`);

  let added = 0;
  let skipped = 0;

  for (const prospect of fastGrowingProspects) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('prospects')
      .select('id')
      .eq('company_domain', prospect.company_domain)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`- Already exists: ${prospect.company_name}`);
      skipped++;
      continue;
    }

    const { error } = await supabase.from('prospects').insert({
      team_id: team.id,
      ...prospect,
      status: 'new',
      source: 'manual',
    });

    if (error) {
      console.error(`✗ Failed to add ${prospect.company_name}:`, error.message);
    } else {
      console.log(`+ Added ${prospect.company_name} (${prospect.company_domain}) - Score: ${prospect.helix_fit_score}`);
      added++;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Added: ${added}`);
  console.log(`Skipped (already exist): ${skipped}`);
  console.log(`Total: ${fastGrowingProspects.length}`);
}

addFastGrowingProspects().catch(console.error);
