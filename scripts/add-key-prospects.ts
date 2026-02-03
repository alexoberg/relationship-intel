// Script to add key prospect companies that should be in the system
// Run with: npx tsx scripts/add-key-prospects.ts

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

// Key companies that should definitely be prospects for Helix
const keyProspects = [
  {
    company_name: 'Polymarket',
    company_domain: 'polymarket.com',
    company_industry: 'Prediction Markets / Betting',
    funding_stage: 'series_b',
    company_description: 'Decentralized prediction market platform where users bet on real-world events',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Prediction market with high-stakes betting - needs bot prevention for market manipulation and age verification for gambling regulations',
  },
  {
    company_name: 'Kalshi',
    company_domain: 'kalshi.com',
    company_industry: 'Prediction Markets / Trading',
    funding_stage: 'series_a',
    company_description: 'CFTC-regulated prediction market exchange for event contracts',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Regulated prediction market exchange - needs bot prevention for market integrity and age verification for trading compliance',
  },
  {
    company_name: 'Lime',
    company_domain: 'li.me',
    company_industry: 'Micromobility / Transportation',
    funding_stage: 'series_d',
    company_description: 'Electric scooter and bike sharing platform',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Shared mobility platform with user accounts and rentals - needs bot prevention for account fraud and age verification for riders',
  },
  {
    company_name: 'Vimeo',
    company_domain: 'vimeo.com',
    company_industry: 'Video Platform',
    funding_stage: 'public',
    company_description: 'Video hosting, sharing, and services platform for creators and businesses',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Video platform with user uploads and comments - needs bot prevention for spam, fake engagement, and account abuse',
  },
  {
    company_name: 'Signal',
    company_domain: 'signal.org',
    company_industry: 'Encrypted Messaging',
    funding_stage: 'nonprofit',
    company_description: 'End-to-end encrypted messaging app focused on privacy',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Privacy-focused messaging app - needs invisible bot prevention for signup spam while maintaining privacy principles',
  },
  {
    company_name: 'Bluesky',
    company_domain: 'bsky.app',
    company_industry: 'Social Media',
    funding_stage: 'series_a',
    company_description: 'Decentralized social media platform built on the AT Protocol',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Fast-growing social platform with massive bot/spam problem - needs invisible bot prevention for signups and content posting',
  },
  {
    company_name: 'Discord',
    company_domain: 'discord.com',
    company_industry: 'Social / Gaming',
    funding_stage: 'series_h',
    company_description: 'Voice, video, and text chat platform for communities',
    helix_products: ['captcha_replacement', 'voice_captcha', 'age_verification'],
    helix_fit_reason: 'Major social platform with significant bot problem - needs bot prevention for server raids, spam, and age-gated communities',
  },
  {
    company_name: 'Roblox',
    company_domain: 'roblox.com',
    company_industry: 'Gaming / UGC Platform',
    funding_stage: 'public',
    company_description: 'Online gaming platform and game creation system',
    helix_products: ['captcha_replacement', 'voice_captcha', 'age_verification'],
    helix_fit_reason: 'Massive gaming platform for kids/teens - critical need for bot prevention (item trading, accounts) and age verification',
  },
  {
    company_name: 'Kick',
    company_domain: 'kick.com',
    company_industry: 'Live Streaming',
    funding_stage: 'series_a',
    company_description: 'Live streaming platform competing with Twitch',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Growing streaming platform with gambling content - needs bot prevention for chat/viewbots and age verification',
  },
  {
    company_name: 'Rumble',
    company_domain: 'rumble.com',
    company_industry: 'Video Platform',
    funding_stage: 'public',
    company_description: 'Video sharing platform and cloud services',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Growing video platform - needs bot prevention for view manipulation, fake engagement, and account creation',
  },
  {
    company_name: 'Fanatics',
    company_domain: 'fanatics.com',
    company_industry: 'Sports / E-commerce / Betting',
    funding_stage: 'series_e',
    company_description: 'Sports merchandise, trading cards, and betting platform',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Major sports commerce and betting company - needs bot prevention for limited drops/trading cards and age verification for betting',
  },
  {
    company_name: 'DraftKings',
    company_domain: 'draftkings.com',
    company_industry: 'Sports Betting',
    funding_stage: 'public',
    company_description: 'Digital sports entertainment and gaming company',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Major sports betting platform - critical need for bot prevention (bonus abuse, fraud) and age verification for gambling',
  },
  {
    company_name: 'FanDuel',
    company_domain: 'fanduel.com',
    company_industry: 'Sports Betting',
    funding_stage: 'acquired',
    company_description: 'Online sports betting and daily fantasy sports platform',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Major sports betting platform - needs bot prevention for account fraud and age verification for gambling compliance',
  },
  {
    company_name: 'BetMGM',
    company_domain: 'betmgm.com',
    company_industry: 'Sports Betting / Casino',
    funding_stage: 'joint_venture',
    company_description: 'Online sports betting and casino gaming platform',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Major betting/casino platform - needs bot prevention for bonus abuse and age verification for gambling',
  },
  {
    company_name: 'Hinge',
    company_domain: 'hinge.co',
    company_industry: 'Dating',
    funding_stage: 'acquired',
    company_description: 'Dating app designed to be deleted',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Popular dating app - needs bot prevention for fake profiles and catfishing',
  },
  {
    company_name: 'Bumble',
    company_domain: 'bumble.com',
    company_industry: 'Dating',
    funding_stage: 'public',
    company_description: 'Women-first dating and social networking app',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Major dating platform - needs bot prevention for fake profiles, spam, and romance scams',
  },
  // More key prospects
  {
    company_name: 'Tinder',
    company_domain: 'tinder.com',
    company_industry: 'Dating',
    funding_stage: 'public',
    company_description: 'Location-based dating app',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Largest dating app - massive bot/fake profile problem, needs invisible verification',
  },
  {
    company_name: 'Twitch',
    company_domain: 'twitch.tv',
    company_industry: 'Live Streaming',
    funding_stage: 'acquired',
    company_description: 'Live streaming platform for gamers and creators',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Major streaming platform - needs bot prevention for chat spam, viewbots, and follow bots',
  },
  {
    company_name: 'Reddit',
    company_domain: 'reddit.com',
    company_industry: 'Social Media',
    funding_stage: 'public',
    company_description: 'Social news and discussion platform',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Huge social platform with bot/manipulation problem - needs invisible bot prevention for voting, posting, accounts',
  },
  {
    company_name: 'Pinterest',
    company_domain: 'pinterest.com',
    company_industry: 'Social Media',
    funding_stage: 'public',
    company_description: 'Visual discovery and bookmarking platform',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Visual social platform - needs bot prevention for spam pins, fake engagement, account creation',
  },
  {
    company_name: 'Spotify',
    company_domain: 'spotify.com',
    company_industry: 'Music Streaming',
    funding_stage: 'public',
    company_description: 'Audio streaming and media services',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Music streaming giant - needs bot prevention for stream manipulation, fake listens, account fraud',
  },
  {
    company_name: 'SoundCloud',
    company_domain: 'soundcloud.com',
    company_industry: 'Music Streaming',
    funding_stage: 'series_f',
    company_description: 'Audio streaming platform for creators',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Music platform with bot play problem - needs invisible bot prevention for stream/play manipulation',
  },
  {
    company_name: 'Nextdoor',
    company_domain: 'nextdoor.com',
    company_industry: 'Social / Local',
    funding_stage: 'public',
    company_description: 'Neighborhood social network',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Local social network - needs bot prevention for fake neighbor accounts and address verification',
  },
  {
    company_name: 'OpenSea',
    company_domain: 'opensea.io',
    company_industry: 'NFT / Marketplace',
    funding_stage: 'series_c',
    company_description: 'NFT marketplace',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'NFT marketplace - needs bot prevention for wash trading, sniping, and account fraud',
  },
  {
    company_name: 'Coinbase',
    company_domain: 'coinbase.com',
    company_industry: 'Crypto / Finance',
    funding_stage: 'public',
    company_description: 'Cryptocurrency exchange',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Major crypto exchange - needs bot prevention for trading bots and verification for compliance',
  },
  {
    company_name: 'Robinhood',
    company_domain: 'robinhood.com',
    company_industry: 'Trading / Finance',
    funding_stage: 'public',
    company_description: 'Commission-free trading app',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Trading platform - needs bot prevention for automated trading abuse and account security',
  },
  {
    company_name: 'Cash App',
    company_domain: 'cash.app',
    company_industry: 'Fintech / Payments',
    funding_stage: 'acquired',
    company_description: 'Mobile payment service',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'P2P payment app - needs bot prevention for fraud, scams, and fake accounts',
  },
  {
    company_name: 'Venmo',
    company_domain: 'venmo.com',
    company_industry: 'Fintech / Payments',
    funding_stage: 'acquired',
    company_description: 'Mobile payment service',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'P2P payment app - needs bot prevention for payment fraud and fake accounts',
  },
  {
    company_name: 'Chime',
    company_domain: 'chime.com',
    company_industry: 'Neobank / Finance',
    funding_stage: 'series_g',
    company_description: 'Online bank and financial technology',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Digital bank - needs bot prevention for account fraud and verification',
  },
  {
    company_name: 'Uber',
    company_domain: 'uber.com',
    company_industry: 'Rideshare / Delivery',
    funding_stage: 'public',
    company_description: 'Ride-sharing and delivery platform',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Rideshare giant - needs bot prevention for fake accounts, promo abuse, and driver verification',
  },
  {
    company_name: 'Lyft',
    company_domain: 'lyft.com',
    company_industry: 'Rideshare',
    funding_stage: 'public',
    company_description: 'Ride-sharing platform',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Rideshare platform - needs bot prevention for fake accounts and promo abuse',
  },
  {
    company_name: 'DoorDash',
    company_domain: 'doordash.com',
    company_industry: 'Food Delivery',
    funding_stage: 'public',
    company_description: 'Food delivery platform',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Delivery platform - needs bot prevention for promo abuse and fake accounts',
  },
  {
    company_name: 'Instacart',
    company_domain: 'instacart.com',
    company_industry: 'Grocery Delivery',
    funding_stage: 'public',
    company_description: 'Grocery delivery platform',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Grocery delivery - needs bot prevention for deals/promo abuse and age verification for alcohol',
  },
  {
    company_name: 'Grubhub',
    company_domain: 'grubhub.com',
    company_industry: 'Food Delivery',
    funding_stage: 'acquired',
    company_description: 'Food delivery platform',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Delivery platform - needs bot prevention for promo abuse and scraping',
  },
  {
    company_name: 'TaskRabbit',
    company_domain: 'taskrabbit.com',
    company_industry: 'Gig Economy',
    funding_stage: 'acquired',
    company_description: 'Freelance labor marketplace',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Gig marketplace - needs bot prevention for fake tasker accounts and verification',
  },
  {
    company_name: 'Fiverr',
    company_domain: 'fiverr.com',
    company_industry: 'Freelance Marketplace',
    funding_stage: 'public',
    company_description: 'Freelance services marketplace',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Freelance marketplace - needs bot prevention for fake gigs, reviews, and seller verification',
  },
  {
    company_name: 'Upwork',
    company_domain: 'upwork.com',
    company_industry: 'Freelance Marketplace',
    funding_stage: 'public',
    company_description: 'Freelance talent platform',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Freelance platform - needs bot prevention for fake profiles and verification',
  },
  {
    company_name: 'Etsy',
    company_domain: 'etsy.com',
    company_industry: 'E-commerce / Marketplace',
    funding_stage: 'public',
    company_description: 'Handmade and vintage marketplace',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'E-commerce marketplace - needs bot prevention for scraping, fake reviews, and seller fraud',
  },
  {
    company_name: 'Poshmark',
    company_domain: 'poshmark.com',
    company_industry: 'Fashion Marketplace',
    funding_stage: 'acquired',
    company_description: 'Social commerce marketplace for fashion',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Fashion resale marketplace - needs bot prevention for sharing bots, fake engagement',
  },
  {
    company_name: 'StockX',
    company_domain: 'stockx.com',
    company_industry: 'Sneaker / Resale Marketplace',
    funding_stage: 'series_e',
    company_description: 'Stock market for sneakers and streetwear',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Sneaker resale marketplace - critical need for bot prevention on drops and bidding',
  },
  {
    company_name: 'GOAT',
    company_domain: 'goat.com',
    company_industry: 'Sneaker Marketplace',
    funding_stage: 'series_f',
    company_description: 'Sneaker and apparel marketplace',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Sneaker marketplace - needs bot prevention for drops and account fraud',
  },
  {
    company_name: 'Ticketmaster',
    company_domain: 'ticketmaster.com',
    company_industry: 'Ticketing',
    funding_stage: 'public',
    company_description: 'Ticket sales and distribution',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'MAJOR target - worlds largest ticketing platform with massive bot/scalper problem',
  },
  {
    company_name: 'AXS',
    company_domain: 'axs.com',
    company_industry: 'Ticketing',
    funding_stage: 'acquired',
    company_description: 'Ticketing platform for live events',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Major ticketing platform - needs bot prevention for scalpers and ticket bots',
  },
  {
    company_name: 'Dice',
    company_domain: 'dice.fm',
    company_industry: 'Ticketing',
    funding_stage: 'series_c',
    company_description: 'Music event ticketing platform',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Music ticketing platform - needs bot prevention for concert ticket scalping',
  },
  {
    company_name: 'SeatGeek',
    company_domain: 'seatgeek.com',
    company_industry: 'Ticketing',
    funding_stage: 'series_e',
    company_description: 'Mobile ticketing platform',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Ticketing platform - needs bot prevention for ticket scalping and manipulation',
  },
  {
    company_name: 'Vivid Seats',
    company_domain: 'vividseats.com',
    company_industry: 'Ticketing',
    funding_stage: 'public',
    company_description: 'Ticket marketplace',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Ticket marketplace - needs bot prevention for scalping and price manipulation',
  },
  {
    company_name: 'Epic Games',
    company_domain: 'epicgames.com',
    company_industry: 'Gaming',
    funding_stage: 'private',
    company_description: 'Video game developer and publisher (Fortnite)',
    helix_products: ['captcha_replacement', 'voice_captcha', 'age_verification'],
    helix_fit_reason: 'Major game company - needs bot prevention for cheating, account fraud, and age verification',
  },
  {
    company_name: 'Riot Games',
    company_domain: 'riotgames.com',
    company_industry: 'Gaming',
    funding_stage: 'acquired',
    company_description: 'Video game developer (League of Legends, Valorant)',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Major esports/gaming company - needs bot prevention for smurfing, botting, account fraud',
  },
  {
    company_name: 'Activision Blizzard',
    company_domain: 'activisionblizzard.com',
    company_industry: 'Gaming',
    funding_stage: 'acquired',
    company_description: 'Video game publisher',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Major game publisher - needs bot prevention for cheating, gold farming, account sales',
  },
  {
    company_name: 'EA',
    company_domain: 'ea.com',
    company_industry: 'Gaming',
    funding_stage: 'public',
    company_description: 'Video game publisher',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Major game publisher - needs bot prevention for cheating, FIFA coin farming, account fraud',
  },
  {
    company_name: 'Take-Two',
    company_domain: 'take2games.com',
    company_industry: 'Gaming',
    funding_stage: 'public',
    company_description: 'Video game publisher (GTA, NBA 2K)',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Major game publisher - needs bot prevention for modding abuse, currency farming',
  },
  {
    company_name: 'Zynga',
    company_domain: 'zynga.com',
    company_industry: 'Mobile Gaming',
    funding_stage: 'acquired',
    company_description: 'Mobile game developer',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Mobile gaming company - needs bot prevention for cheating and resource farming',
  },
  {
    company_name: 'Niantic',
    company_domain: 'nianticlabs.com',
    company_industry: 'Gaming / AR',
    funding_stage: 'series_d',
    company_description: 'AR game developer (Pokemon Go)',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'AR gaming company - needs bot prevention for GPS spoofing, botting in Pokemon Go',
  },
  {
    company_name: 'Steam',
    company_domain: 'steampowered.com',
    company_industry: 'Gaming Platform',
    funding_stage: 'private',
    company_description: 'Digital distribution platform',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Largest PC gaming platform - needs bot prevention for market manipulation, account theft, age gates',
  },
  {
    company_name: 'Telegram',
    company_domain: 'telegram.org',
    company_industry: 'Messaging',
    funding_stage: 'private',
    company_description: 'Cloud-based messaging app',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Major messaging platform - needs bot prevention for spam, fake accounts, group raids',
  },
  {
    company_name: 'WhatsApp',
    company_domain: 'whatsapp.com',
    company_industry: 'Messaging',
    funding_stage: 'acquired',
    company_description: 'Messaging app',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Worlds largest messaging app - needs bot prevention for spam, fake business accounts',
  },
  {
    company_name: 'Snapchat',
    company_domain: 'snapchat.com',
    company_industry: 'Social Media',
    funding_stage: 'public',
    company_description: 'Multimedia messaging app',
    helix_products: ['captcha_replacement', 'voice_captcha', 'age_verification'],
    helix_fit_reason: 'Major social platform - needs bot prevention for fake accounts and age verification',
  },
  {
    company_name: 'TikTok',
    company_domain: 'tiktok.com',
    company_industry: 'Social Media',
    funding_stage: 'private',
    company_description: 'Short-form video platform',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Massive social platform - needs bot prevention for fake engagement, view bots, age gates',
  },
  {
    company_name: 'LinkedIn',
    company_domain: 'linkedin.com',
    company_industry: 'Professional Network',
    funding_stage: 'acquired',
    company_description: 'Professional networking platform',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Professional network - needs bot prevention for fake profiles, connection spam, scraping',
  },
  {
    company_name: 'Glassdoor',
    company_domain: 'glassdoor.com',
    company_industry: 'Job Search',
    funding_stage: 'acquired',
    company_description: 'Job search and company reviews',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Job/review platform - needs bot prevention for fake reviews and scraping',
  },
  {
    company_name: 'Indeed',
    company_domain: 'indeed.com',
    company_industry: 'Job Search',
    funding_stage: 'acquired',
    company_description: 'Job search engine',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Job search platform - needs bot prevention for fake postings and resume scraping',
  },
  {
    company_name: 'Yelp',
    company_domain: 'yelp.com',
    company_industry: 'Reviews / Local',
    funding_stage: 'public',
    company_description: 'Local business reviews',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Review platform - needs bot prevention for fake reviews and scraping',
  },
  {
    company_name: 'Airbnb',
    company_domain: 'airbnb.com',
    company_industry: 'Travel / Marketplace',
    funding_stage: 'public',
    company_description: 'Vacation rental marketplace',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Major marketplace - needs bot prevention for fake listings, scraping, verification',
  },
  {
    company_name: 'Vrbo',
    company_domain: 'vrbo.com',
    company_industry: 'Travel / Marketplace',
    funding_stage: 'acquired',
    company_description: 'Vacation rental marketplace',
    helix_products: ['captcha_replacement', 'voice_captcha'],
    helix_fit_reason: 'Vacation rental platform - needs bot prevention for fake listings and verification',
  },
  {
    company_name: 'Booking.com',
    company_domain: 'booking.com',
    company_industry: 'Travel',
    funding_stage: 'public',
    company_description: 'Online travel agency',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Major travel platform - needs bot prevention for scraping, price manipulation',
  },
  {
    company_name: 'Expedia',
    company_domain: 'expedia.com',
    company_industry: 'Travel',
    funding_stage: 'public',
    company_description: 'Online travel agency',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Travel platform - needs bot prevention for scraping and price manipulation',
  },
  {
    company_name: 'Tripadvisor',
    company_domain: 'tripadvisor.com',
    company_industry: 'Travel / Reviews',
    funding_stage: 'public',
    company_description: 'Travel platform with reviews',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Travel review platform - needs bot prevention for fake reviews and scraping',
  },
  {
    company_name: 'Nike',
    company_domain: 'nike.com',
    company_industry: 'E-commerce / Retail',
    funding_stage: 'public',
    company_description: 'Athletic footwear and apparel',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'MAJOR target - Nike SNKRS drops have massive bot problem for limited releases',
  },
  {
    company_name: 'Adidas',
    company_domain: 'adidas.com',
    company_industry: 'E-commerce / Retail',
    funding_stage: 'public',
    company_description: 'Athletic footwear and apparel',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Major brand with limited releases - needs bot prevention for Yeezy/hype drops',
  },
  {
    company_name: 'Supreme',
    company_domain: 'supremenewyork.com',
    company_industry: 'Fashion / Streetwear',
    funding_stage: 'acquired',
    company_description: 'Streetwear brand',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Iconic streetwear brand - notorious bot problem on weekly drops',
  },
  {
    company_name: 'Target',
    company_domain: 'target.com',
    company_industry: 'Retail',
    funding_stage: 'public',
    company_description: 'Retail corporation',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Major retailer - needs bot prevention for PS5/GPU drops, scalping protection',
  },
  {
    company_name: 'Walmart',
    company_domain: 'walmart.com',
    company_industry: 'Retail',
    funding_stage: 'public',
    company_description: 'Retail corporation',
    helix_products: ['captcha_replacement', 'age_verification'],
    helix_fit_reason: 'Major retailer - needs bot prevention for hot item drops and age verification for restricted items',
  },
  {
    company_name: 'Best Buy',
    company_domain: 'bestbuy.com',
    company_industry: 'Electronics Retail',
    funding_stage: 'public',
    company_description: 'Electronics retailer',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'Electronics retailer - major target for GPU/console bots',
  },
  {
    company_name: 'Shopify',
    company_domain: 'shopify.com',
    company_industry: 'E-commerce Platform',
    funding_stage: 'public',
    company_description: 'E-commerce platform',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'E-commerce platform powering millions of stores - built-in bot protection would be huge',
  },
  {
    company_name: 'WooCommerce',
    company_domain: 'woocommerce.com',
    company_industry: 'E-commerce Platform',
    funding_stage: 'acquired',
    company_description: 'WordPress e-commerce plugin',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'E-commerce platform - plugin integration for bot prevention',
  },
  {
    company_name: 'BigCommerce',
    company_domain: 'bigcommerce.com',
    company_industry: 'E-commerce Platform',
    funding_stage: 'public',
    company_description: 'E-commerce platform',
    helix_products: ['captcha_replacement'],
    helix_fit_reason: 'E-commerce platform - built-in bot protection offering',
  },
];

async function addKeyProspects() {
  // Get the team ID
  const { data: team } = await supabase
    .from('teams')
    .select('id')
    .limit(1)
    .single();

  if (!team) {
    console.error('No team found');
    return;
  }

  console.log(`Adding key prospects to team ${team.id}...\n`);

  for (const prospect of keyProspects) {
    // Check if already exists
    const { data: existing } = await supabase
      .from('prospects')
      .select('id, status')
      .eq('company_domain', prospect.company_domain)
      .eq('team_id', team.id)
      .single();

    if (existing) {
      console.log(`✓ ${prospect.company_name} already exists (status: ${existing.status})`);

      // Update if marked as not_a_fit incorrectly
      if (existing.status === 'not_a_fit') {
        const { error } = await supabase
          .from('prospects')
          .update({
            status: 'new',
            helix_products: prospect.helix_products,
            helix_fit_reason: prospect.helix_fit_reason,
            helix_fit_score: 85,
          })
          .eq('id', existing.id);

        if (!error) {
          console.log(`  → Restored ${prospect.company_name} to 'new' status`);
        }
      }
      continue;
    }

    // Calculate a fit score based on products
    const fitScore = 70 + (prospect.helix_products.length * 10);

    const { error } = await supabase
      .from('prospects')
      .insert({
        team_id: team.id,
        company_name: prospect.company_name,
        company_domain: prospect.company_domain,
        company_industry: prospect.company_industry,
        funding_stage: prospect.funding_stage,
        company_description: prospect.company_description,
        helix_products: prospect.helix_products,
        helix_fit_reason: prospect.helix_fit_reason,
        helix_fit_score: fitScore,
        status: 'new',
        source: 'manual',
      });

    if (error) {
      console.error(`✗ Failed to add ${prospect.company_name}:`, error.message);
    } else {
      console.log(`+ Added ${prospect.company_name} (${prospect.company_domain})`);
    }
  }

  console.log('\nDone!');
}

addKeyProspects().catch(console.error);
