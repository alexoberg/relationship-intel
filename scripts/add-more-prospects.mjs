#!/usr/bin/env node
// Add more prospect companies - enterprises & platforms
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

const NEW_PROSPECTS = [
  // Dating & Social (Age Verification + Deepfake Detection)
  {
    company_name: 'Tinder',
    company_domain: 'tinder.com',
    company_industry: 'Dating & Social',
    description: 'Leading dating app with 75M+ users',
    funding_stage: 'public',
    helix_fit_score: 95,
    helix_fit_reason: 'Age verification critical, deepfake profile detection, bot prevention',
    helix_products: ['age_verification', 'voice_captcha', 'bot_sorter'],
  },
  {
    company_name: 'Grindr',
    company_domain: 'grindr.com',
    company_industry: 'Dating & Social',
    description: 'LGBTQ+ dating app with 13M+ users',
    funding_stage: 'public',
    helix_fit_score: 95,
    helix_fit_reason: 'Age verification mandatory, identity verification, catfish prevention',
    helix_products: ['age_verification', 'voice_captcha'],
  },
  {
    company_name: 'Bumble',
    company_domain: 'bumble.com',
    company_industry: 'Dating & Social',
    description: 'Dating app where women make the first move',
    funding_stage: 'public',
    helix_fit_score: 90,
    helix_fit_reason: 'Age verification, identity verification, fake profile detection',
    helix_products: ['age_verification', 'voice_captcha'],
  },
  {
    company_name: 'Hinge',
    company_domain: 'hinge.co',
    company_industry: 'Dating & Social',
    description: 'Dating app designed to be deleted',
    funding_stage: 'acquired',
    helix_fit_score: 88,
    helix_fit_reason: 'Age verification, fake profile detection',
    helix_products: ['age_verification', 'voice_captcha'],
  },

  // Adult Content (Age Verification Critical)
  {
    company_name: 'OnlyFans',
    company_domain: 'onlyfans.com',
    company_industry: 'Creator Economy',
    description: 'Creator subscription platform, 220M+ users',
    funding_stage: 'growth',
    helix_fit_score: 98,
    helix_fit_reason: 'Age verification MANDATORY for creators & viewers, deepfake detection critical',
    helix_products: ['age_verification', 'voice_captcha'],
  },
  {
    company_name: 'Pornhub (Aylo)',
    company_domain: 'aylo.com',
    company_industry: 'Adult Entertainment',
    description: 'Largest adult content platform',
    funding_stage: 'growth',
    helix_fit_score: 98,
    helix_fit_reason: 'Age verification legally required, identity verification for creators',
    helix_products: ['age_verification'],
  },

  // Marketplaces (Bot Protection + Fraud)
  {
    company_name: 'StockX',
    company_domain: 'stockx.com',
    company_industry: 'E-commerce & Resale',
    description: 'Sneaker & streetwear resale marketplace',
    funding_stage: 'series_e',
    helix_fit_score: 95,
    helix_fit_reason: 'Sneaker bot epidemic, fraud prevention, fake product issues',
    helix_products: ['bot_sorter'],
  },
  {
    company_name: 'GOAT',
    company_domain: 'goat.com',
    company_industry: 'E-commerce & Resale',
    description: 'Sneaker and apparel marketplace',
    funding_stage: 'series_f',
    helix_fit_score: 92,
    helix_fit_reason: 'Bot protection for drops, fraud prevention',
    helix_products: ['bot_sorter'],
  },
  {
    company_name: 'Poshmark',
    company_domain: 'poshmark.com',
    company_industry: 'E-commerce & Resale',
    description: 'Fashion resale marketplace',
    funding_stage: 'acquired',
    helix_fit_score: 85,
    helix_fit_reason: 'Bot prevention, fraud detection',
    helix_products: ['bot_sorter'],
  },

  // Ticketing & Events (Bot Protection Critical)
  {
    company_name: 'Ticketmaster',
    company_domain: 'ticketmaster.com',
    company_industry: 'Ticketing & Events',
    description: 'Largest ticket sales platform worldwide',
    funding_stage: 'public',
    helix_fit_score: 98,
    helix_fit_reason: 'Ticket bot epidemic (Taylor Swift), scalper prevention critical',
    helix_products: ['bot_sorter'],
  },
  {
    company_name: 'Live Nation',
    company_domain: 'livenation.com',
    company_industry: 'Ticketing & Events',
    description: 'Live entertainment company (owns Ticketmaster)',
    funding_stage: 'public',
    helix_fit_score: 95,
    helix_fit_reason: 'Enterprise-wide bot protection for ticketing',
    helix_products: ['bot_sorter'],
  },
  {
    company_name: 'StubHub',
    company_domain: 'stubhub.com',
    company_industry: 'Ticketing & Events',
    description: 'Secondary ticket marketplace',
    funding_stage: 'acquired',
    helix_fit_score: 90,
    helix_fit_reason: 'Bot protection, fraud prevention',
    helix_products: ['bot_sorter'],
  },
  {
    company_name: 'SeatGeek',
    company_domain: 'seatgeek.com',
    company_industry: 'Ticketing & Events',
    description: 'Event ticket platform',
    funding_stage: 'series_e',
    helix_fit_score: 88,
    helix_fit_reason: 'Bot protection for ticket purchases',
    helix_products: ['bot_sorter'],
  },
  {
    company_name: 'Eventbrite',
    company_domain: 'eventbrite.com',
    company_industry: 'Ticketing & Events',
    description: 'Event management and ticketing platform',
    funding_stage: 'public',
    helix_fit_score: 85,
    helix_fit_reason: 'Bot protection for popular events',
    helix_products: ['bot_sorter'],
  },

  // Gaming (Bot Protection + Age Verification)
  {
    company_name: 'Roblox',
    company_domain: 'roblox.com',
    company_industry: 'Gaming',
    description: 'Online game platform with 70M+ daily users',
    funding_stage: 'public',
    helix_fit_score: 95,
    helix_fit_reason: 'Age verification for kids safety, bot prevention, voice chat moderation',
    helix_products: ['age_verification', 'bot_sorter', 'voice_captcha'],
  },
  {
    company_name: 'Epic Games',
    company_domain: 'epicgames.com',
    company_industry: 'Gaming',
    description: 'Fortnite, Unreal Engine, Epic Games Store',
    funding_stage: 'growth',
    helix_fit_score: 92,
    helix_fit_reason: 'Age verification, bot protection for store purchases',
    helix_products: ['age_verification', 'bot_sorter'],
  },
  {
    company_name: 'Discord',
    company_domain: 'discord.com',
    company_industry: 'Social & Gaming',
    description: 'Voice, video, and text chat platform',
    funding_stage: 'series_h',
    helix_fit_score: 90,
    helix_fit_reason: 'Age verification for NSFW servers, voice verification, bot protection',
    helix_products: ['age_verification', 'voice_captcha', 'bot_sorter'],
  },
  {
    company_name: 'Twitch',
    company_domain: 'twitch.tv',
    company_industry: 'Streaming',
    description: 'Live streaming platform (Amazon)',
    funding_stage: 'acquired',
    helix_fit_score: 88,
    helix_fit_reason: 'Age verification, bot prevention in chat, creator verification',
    helix_products: ['age_verification', 'bot_sorter'],
  },

  // Fintech (Identity Verification + Fraud)
  {
    company_name: 'Stripe',
    company_domain: 'stripe.com',
    company_industry: 'Fintech',
    description: 'Payment infrastructure for the internet',
    funding_stage: 'series_i',
    helix_fit_score: 88,
    helix_fit_reason: 'Fraud prevention, identity verification, bot protection',
    helix_products: ['bot_sorter'],
  },
  {
    company_name: 'Coinbase',
    company_domain: 'coinbase.com',
    company_industry: 'Crypto & Fintech',
    description: 'Largest US crypto exchange',
    funding_stage: 'public',
    helix_fit_score: 92,
    helix_fit_reason: 'KYC/identity verification, fraud prevention, bot protection',
    helix_products: ['bot_sorter', 'voice_captcha'],
  },
  {
    company_name: 'Robinhood',
    company_domain: 'robinhood.com',
    company_industry: 'Fintech',
    description: 'Commission-free trading app',
    funding_stage: 'public',
    helix_fit_score: 85,
    helix_fit_reason: 'Identity verification, fraud prevention',
    helix_products: ['bot_sorter', 'voice_captcha'],
  },

  // Gig Economy & Travel
  {
    company_name: 'Uber',
    company_domain: 'uber.com',
    company_industry: 'Transportation',
    description: 'Ride-sharing and delivery platform',
    funding_stage: 'public',
    helix_fit_score: 90,
    helix_fit_reason: 'Driver identity verification, fraud prevention, deepfake detection',
    helix_products: ['voice_captcha', 'bot_sorter'],
  },
  {
    company_name: 'Lyft',
    company_domain: 'lyft.com',
    company_industry: 'Transportation',
    description: 'Ride-sharing platform',
    funding_stage: 'public',
    helix_fit_score: 85,
    helix_fit_reason: 'Driver verification, fraud prevention',
    helix_products: ['voice_captcha'],
  },
  {
    company_name: 'Airbnb',
    company_domain: 'airbnb.com',
    company_industry: 'Travel & Hospitality',
    description: 'Home rental marketplace',
    funding_stage: 'public',
    helix_fit_score: 88,
    helix_fit_reason: 'Host/guest identity verification, fraud prevention',
    helix_products: ['voice_captcha', 'bot_sorter'],
  },
  {
    company_name: 'DoorDash',
    company_domain: 'doordash.com',
    company_industry: 'Food Delivery',
    description: 'Food delivery platform',
    funding_stage: 'public',
    helix_fit_score: 82,
    helix_fit_reason: 'Driver verification, fraud prevention',
    helix_products: ['voice_captcha'],
  },

  // Social Media
  {
    company_name: 'Reddit',
    company_domain: 'reddit.com',
    company_industry: 'Social Media',
    description: 'Community forum platform',
    funding_stage: 'public',
    helix_fit_score: 85,
    helix_fit_reason: 'Bot prevention, age-gated subreddits',
    helix_products: ['bot_sorter', 'age_verification'],
  },
  {
    company_name: 'X (Twitter)',
    company_domain: 'x.com',
    company_industry: 'Social Media',
    description: 'Social media platform',
    funding_stage: 'private',
    helix_fit_score: 92,
    helix_fit_reason: 'Bot epidemic, identity verification, deepfake detection',
    helix_products: ['bot_sorter', 'voice_captcha'],
  },
  {
    company_name: 'Snap Inc',
    company_domain: 'snap.com',
    company_industry: 'Social Media',
    description: 'Snapchat parent company',
    funding_stage: 'public',
    helix_fit_score: 88,
    helix_fit_reason: 'Age verification, deepfake detection in filters',
    helix_products: ['age_verification', 'voice_captcha'],
  },
  {
    company_name: 'Pinterest',
    company_domain: 'pinterest.com',
    company_industry: 'Social Media',
    description: 'Visual discovery platform',
    funding_stage: 'public',
    helix_fit_score: 75,
    helix_fit_reason: 'Bot prevention, content authenticity',
    helix_products: ['bot_sorter'],
  },

  // AI Companies (Clawdbot for their chatbots)
  {
    company_name: 'Anthropic',
    company_domain: 'anthropic.com',
    company_industry: 'AI',
    description: 'AI safety company, makers of Claude',
    funding_stage: 'series_e',
    helix_fit_score: 85,
    helix_fit_reason: 'Bot detection for API, age verification for AI chat',
    helix_products: ['bot_sorter', 'age_verification'],
  },
  {
    company_name: 'Perplexity',
    company_domain: 'perplexity.ai',
    company_industry: 'AI',
    description: 'AI-powered search engine',
    funding_stage: 'series_b',
    helix_fit_score: 82,
    helix_fit_reason: 'Bot protection for API',
    helix_products: ['bot_sorter'],
  },
  {
    company_name: 'OpenAI',
    company_domain: 'openai.com',
    company_industry: 'AI',
    description: 'Makers of ChatGPT',
    funding_stage: 'series_e',
    helix_fit_score: 88,
    helix_fit_reason: 'Bot protection for API, age verification',
    helix_products: ['bot_sorter', 'age_verification'],
  },

  // E-commerce Giants
  {
    company_name: 'Shopify',
    company_domain: 'shopify.com',
    company_industry: 'E-commerce',
    description: 'E-commerce platform for merchants',
    funding_stage: 'public',
    helix_fit_score: 90,
    helix_fit_reason: 'Bot protection for flash sales, fraud prevention',
    helix_products: ['bot_sorter'],
  },
  {
    company_name: 'eBay',
    company_domain: 'ebay.com',
    company_industry: 'E-commerce',
    description: 'Online marketplace',
    funding_stage: 'public',
    helix_fit_score: 85,
    helix_fit_reason: 'Bot prevention, fraud detection',
    helix_products: ['bot_sorter'],
  },
  {
    company_name: 'Etsy',
    company_domain: 'etsy.com',
    company_industry: 'E-commerce',
    description: 'Handmade and vintage marketplace',
    funding_stage: 'public',
    helix_fit_score: 80,
    helix_fit_reason: 'Bot prevention, seller verification',
    helix_products: ['bot_sorter'],
  },
];

async function main() {
  console.log('🏢 ADDING MORE PROSPECT COMPANIES\n');

  let added = 0, updated = 0, errors = 0;

  for (const prospect of NEW_PROSPECTS) {
    try {
      // Check if exists
      const { data: existing } = await supabase
        .from('prospects')
        .select('id')
        .eq('team_id', TEAM_ID)
        .eq('company_domain', prospect.company_domain)
        .single();

      const prospectData = {
        team_id: TEAM_ID,
        ...prospect,
      };

      if (existing) {
        // Update
        await supabase
          .from('prospects')
          .update(prospectData)
          .eq('id', existing.id);
        updated++;
        console.log(`📝 Updated: ${prospect.company_name}`);
      } else {
        // Insert
        await supabase
          .from('prospects')
          .insert(prospectData);
        added++;
        console.log(`✅ Added: ${prospect.company_name} (${prospect.helix_fit_score}% fit)`);
      }
    } catch (err) {
      errors++;
      console.log(`❌ ${prospect.company_name}: ${err.message}`);
    }
  }

  console.log(`\n✅ COMPLETE: Added ${added}, Updated ${updated}, Errors ${errors}`);

  // Show top prospects
  const { data: top } = await supabase
    .from('prospects')
    .select('company_name, helix_fit_score, helix_fit_reason, funding_stage')
    .eq('team_id', TEAM_ID)
    .order('helix_fit_score', { ascending: false })
    .limit(20);

  console.log('\n🏆 TOP 20 BY HELIX FIT:');
  top?.forEach((p, i) => {
    console.log(`${i+1}. ${p.company_name} (${p.helix_fit_score}%) - ${p.funding_stage}`);
    console.log(`   ${p.helix_fit_reason}`);
  });

  // Count total
  const { count } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', TEAM_ID);

  console.log(`\n📊 Total prospects: ${count}`);
}

main().catch(console.error);
