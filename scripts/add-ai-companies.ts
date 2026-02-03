// Script to add AI companies and other notable prospects
// Run with: npx tsx scripts/add-ai-companies.ts

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

const aiAndOtherCompanies = [
  // Restaurant/Reservations
  {
    company_name: 'Perplexity',
    company_domain: 'perplexity.ai',
    company_industry: 'AI Search',
    funding_stage: 'series_b',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'AI search engine with 10M+ users - needs bot prevention for API abuse and scraping prevention',
    helix_fit_score: 80,
  },
  {
    company_name: 'Seated',
    company_domain: 'seated.com',
    company_industry: 'Restaurant / Rewards',
    funding_stage: 'series_b',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Restaurant rewards app - needs bot prevention for fake reservations and reward abuse',
    helix_fit_score: 78,
  },
  {
    company_name: 'Resy',
    company_domain: 'resy.com',
    company_industry: 'Restaurant Reservations',
    funding_stage: 'acquired',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Restaurant reservation platform (AmEx-owned) - needs bot prevention for reservation scalping at hot restaurants',
    helix_fit_score: 85,
  },
  {
    company_name: 'OpenTable',
    company_domain: 'opentable.com',
    company_industry: 'Restaurant Reservations',
    funding_stage: 'acquired',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Major restaurant reservation platform - bot prevention for reservation hoarding at popular restaurants',
    helix_fit_score: 82,
  },
  {
    company_name: 'Tock',
    company_domain: 'exploretock.com',
    company_industry: 'Restaurant Reservations',
    funding_stage: 'acquired',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Fine dining reservation platform - MAJOR bot problem for hot reservations like Alinea',
    helix_fit_score: 88,
  },
  {
    company_name: 'Yelp Reservations',
    company_domain: 'yelpreservations.com',
    company_industry: 'Restaurant Reservations',
    funding_stage: 'public',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Yelp reservation system - needs bot prevention',
    helix_fit_score: 75,
  },

  // AI Chat/Companions (age verification important)
  {
    company_name: 'Character.AI',
    company_domain: 'character.ai',
    company_industry: 'AI Chat',
    funding_stage: 'series_a',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'AI chatbot platform with 20M+ users - needs age verification for mature content and bot prevention for API abuse',
    helix_fit_score: 88,
  },
  {
    company_name: 'Replika',
    company_domain: 'replika.ai',
    company_industry: 'AI Companion',
    funding_stage: 'series_a',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'AI companion app - needs age verification for romantic/adult features',
    helix_fit_score: 85,
  },
  {
    company_name: 'Chai',
    company_domain: 'chai.ml',
    company_industry: 'AI Chat',
    funding_stage: 'seed',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'AI chat platform - needs age verification and bot prevention for abuse',
    helix_fit_score: 80,
  },
  {
    company_name: 'Janitor AI',
    company_domain: 'janitorai.com',
    company_industry: 'AI Chat / Adult',
    funding_stage: 'private',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'AI character chat with NSFW content - CRITICAL age verification need',
    helix_fit_score: 90,
  },
  {
    company_name: 'Crushon.AI',
    company_domain: 'crushon.ai',
    company_industry: 'AI Chat / Adult',
    funding_stage: 'private',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'AI chat platform with adult content - needs mandatory age verification',
    helix_fit_score: 88,
  },
  {
    company_name: 'Spicychat.ai',
    company_domain: 'spicychat.ai',
    company_industry: 'AI Chat / Adult',
    funding_stage: 'private',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'NSFW AI chatbot platform - needs age verification',
    helix_fit_score: 88,
  },

  // AI Generation (high API abuse risk)
  {
    company_name: 'Midjourney',
    company_domain: 'midjourney.com',
    company_industry: 'AI Art',
    funding_stage: 'private',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'AI image generation with massive demand - needs bot prevention for API/queue abuse',
    helix_fit_score: 82,
  },
  {
    company_name: 'Suno',
    company_domain: 'suno.ai',
    company_industry: 'AI Music',
    funding_stage: 'series_b',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'AI music generation - needs bot prevention for generation abuse',
    helix_fit_score: 82,
  },
  {
    company_name: 'Udio',
    company_domain: 'udio.com',
    company_industry: 'AI Music',
    funding_stage: 'seed',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'AI music creation platform - needs bot prevention for generation limits',
    helix_fit_score: 80,
  },
  {
    company_name: 'ElevenLabs',
    company_domain: 'elevenlabs.io',
    company_industry: 'AI Voice',
    funding_stage: 'series_b',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'AI voice synthesis - ironic fit for Voice Captcha to verify humans, plus bot prevention for API',
    helix_fit_score: 85,
  },
  {
    company_name: 'Runway',
    company_domain: 'runwayml.com',
    company_industry: 'AI Video',
    funding_stage: 'series_c',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'AI video generation (Gen-2) - needs bot prevention for compute abuse',
    helix_fit_score: 78,
  },
  {
    company_name: 'Pika',
    company_domain: 'pika.art',
    company_industry: 'AI Video',
    funding_stage: 'series_a',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'AI video generation platform - needs bot prevention',
    helix_fit_score: 78,
  },
  {
    company_name: 'Luma AI',
    company_domain: 'lumalabs.ai',
    company_industry: 'AI 3D/Video',
    funding_stage: 'series_b',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'AI 3D capture and video (Dream Machine) - needs bot prevention',
    helix_fit_score: 78,
  },

  // More social/community
  {
    company_name: 'Substack',
    company_domain: 'substack.com',
    company_industry: 'Newsletter / Social',
    funding_stage: 'series_b',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Newsletter platform with social features - needs bot prevention for fake signups and engagement',
    helix_fit_score: 75,
  },
  {
    company_name: 'Medium',
    company_domain: 'medium.com',
    company_industry: 'Publishing / Social',
    funding_stage: 'series_d',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Publishing platform - needs bot prevention for fake accounts and engagement',
    helix_fit_score: 72,
  },
  {
    company_name: 'Clubhouse',
    company_domain: 'clubhouse.com',
    company_industry: 'Audio Social',
    funding_stage: 'series_c',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Audio social app - perfect for Voice Captcha, needs bot prevention',
    helix_fit_score: 80,
  },
  {
    company_name: 'Twitter/X',
    company_domain: 'x.com',
    company_industry: 'Social Media',
    funding_stage: 'private',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'MASSIVE bot problem - needs real human verification at scale',
    helix_fit_score: 90,
  },
  {
    company_name: 'Bluesky',
    company_domain: 'bsky.app',
    company_industry: 'Social Media',
    funding_stage: 'series_a',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Decentralized social - needs bot/fake account prevention',
    helix_fit_score: 88,
  },

  // Gaming adjacent
  {
    company_name: 'Roblox Studio',
    company_domain: 'create.roblox.com',
    company_industry: 'Gaming / Creator',
    funding_stage: 'public',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Roblox creator tools - needs age verification for payouts and bot prevention',
    helix_fit_score: 85,
  },
  {
    company_name: 'Unity',
    company_domain: 'unity.com',
    company_industry: 'Game Engine',
    funding_stage: 'public',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Game engine with asset store - needs bot prevention for marketplace',
    helix_fit_score: 68,
  },
  {
    company_name: 'Unreal / Epic',
    company_domain: 'unrealengine.com',
    company_industry: 'Game Engine',
    funding_stage: 'private',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Game engine with marketplace - needs bot prevention',
    helix_fit_score: 68,
  },

  // Fintech / Investing
  {
    company_name: 'Public',
    company_domain: 'public.com',
    company_industry: 'Investing',
    funding_stage: 'series_d',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Social investing app - needs age verification and bot prevention',
    helix_fit_score: 78,
  },
  {
    company_name: 'Webull',
    company_domain: 'webull.com',
    company_industry: 'Trading',
    funding_stage: 'series_c',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Trading platform - needs bot prevention for automation abuse',
    helix_fit_score: 75,
  },
  {
    company_name: 'eToro',
    company_domain: 'etoro.com',
    company_industry: 'Social Trading',
    funding_stage: 'private',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Social trading platform - needs age verification and bot prevention',
    helix_fit_score: 78,
  },
  {
    company_name: 'Acorns',
    company_domain: 'acorns.com',
    company_industry: 'Investing',
    funding_stage: 'series_f',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Micro-investing app - needs bot prevention for account fraud',
    helix_fit_score: 72,
  },
  {
    company_name: 'Stash',
    company_domain: 'stash.com',
    company_industry: 'Investing',
    funding_stage: 'series_g',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Investing app - needs bot prevention',
    helix_fit_score: 70,
  },
  {
    company_name: 'SoFi',
    company_domain: 'sofi.com',
    company_industry: 'Fintech',
    funding_stage: 'public',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Financial super-app - needs bot prevention for account fraud',
    helix_fit_score: 72,
  },
  {
    company_name: 'Dave',
    company_domain: 'dave.com',
    company_industry: 'Neobank',
    funding_stage: 'public',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Banking app with advances - needs bot prevention for fraud',
    helix_fit_score: 70,
  },
  {
    company_name: 'MoneyLion',
    company_domain: 'moneylion.com',
    company_industry: 'Fintech',
    funding_stage: 'public',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Financial app - needs bot prevention',
    helix_fit_score: 68,
  },

  // E-commerce / Drops
  {
    company_name: 'Shopify Shop',
    company_domain: 'shop.app',
    company_industry: 'E-commerce',
    funding_stage: 'public',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Shopify consumer app - aggregates drops, needs bot prevention',
    helix_fit_score: 80,
  },
  {
    company_name: 'Snipes',
    company_domain: 'snipes.com',
    company_industry: 'Sneaker Retail',
    funding_stage: 'private',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Sneaker retailer with drops - needs bot prevention',
    helix_fit_score: 82,
  },
  {
    company_name: 'JD Sports',
    company_domain: 'jdsports.com',
    company_industry: 'Sneaker Retail',
    funding_stage: 'public',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Major sneaker retailer - needs bot prevention for drops',
    helix_fit_score: 80,
  },
  {
    company_name: 'Footlocker',
    company_domain: 'footlocker.com',
    company_industry: 'Sneaker Retail',
    funding_stage: 'public',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Major sneaker retailer - bot problem on releases',
    helix_fit_score: 80,
  },
  {
    company_name: 'Finish Line',
    company_domain: 'finishline.com',
    company_industry: 'Sneaker Retail',
    funding_stage: 'acquired',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Sneaker retailer - needs bot prevention',
    helix_fit_score: 78,
  },
  {
    company_name: 'Kith',
    company_domain: 'kith.com',
    company_industry: 'Streetwear',
    funding_stage: 'private',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Premium streetwear - bot problem on drops',
    helix_fit_score: 85,
  },
  {
    company_name: 'Palace',
    company_domain: 'palaceskateboards.com',
    company_industry: 'Streetwear',
    funding_stage: 'private',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Hype streetwear brand - notorious bot problem on drops',
    helix_fit_score: 85,
  },
  {
    company_name: 'Bodega',
    company_domain: 'bdgastore.com',
    company_industry: 'Streetwear',
    funding_stage: 'private',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Boutique with exclusive drops - needs bot prevention',
    helix_fit_score: 82,
  },

  // Tickets/Events
  {
    company_name: 'Eventbrite',
    company_domain: 'eventbrite.com',
    company_industry: 'Ticketing',
    funding_stage: 'public',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Event ticketing platform - needs bot prevention for popular events',
    helix_fit_score: 80,
  },
  {
    company_name: 'Universe',
    company_domain: 'universe.com',
    company_industry: 'Ticketing',
    funding_stage: 'acquired',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Event ticketing - needs bot prevention',
    helix_fit_score: 75,
  },
  {
    company_name: 'Shotgun',
    company_domain: 'shotgun.live',
    company_industry: 'Ticketing',
    funding_stage: 'series_a',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Electronic music ticketing - needs bot prevention for hot shows',
    helix_fit_score: 82,
  },
  {
    company_name: 'See Tickets',
    company_domain: 'seetickets.com',
    company_industry: 'Ticketing',
    funding_stage: 'private',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'UK/EU ticketing platform - needs bot prevention',
    helix_fit_score: 78,
  },
  {
    company_name: 'Resident Advisor',
    company_domain: 'ra.co',
    company_industry: 'Ticketing / Music',
    funding_stage: 'private',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Electronic music ticketing - scalping problem for hot shows',
    helix_fit_score: 85,
  },
];

async function addCompanies() {
  const { data: team } = await supabase
    .from('teams')
    .select('id')
    .limit(1)
    .single();

  if (!team) {
    console.error('No team found');
    return;
  }

  console.log(`Adding companies to team: ${team.id}\n`);

  let added = 0;
  let skipped = 0;

  for (const company of aiAndOtherCompanies) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('prospects')
      .select('id')
      .eq('company_domain', company.company_domain)
      .limit(1);

    if (existing && existing.length > 0) {
      console.log(`- Already exists: ${company.company_name}`);
      skipped++;
      continue;
    }

    const { error } = await supabase.from('prospects').insert({
      team_id: team.id,
      ...company,
      status: 'new',
      source: 'manual',
    });

    if (error) {
      console.error(`✗ Failed to add ${company.company_name}:`, error.message);
    } else {
      console.log(`+ Added ${company.company_name} (${company.company_domain}) - Score: ${company.helix_fit_score}`);
      added++;
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Added: ${added}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total: ${aiAndOtherCompanies.length}`);
}

addCompanies().catch(console.error);
