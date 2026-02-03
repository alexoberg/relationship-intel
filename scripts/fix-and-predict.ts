// Script to fix incorrect helix_fit_reasons and predict scores based on lookalikes
// Run with: npx tsx scripts/fix-and-predict.ts

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';

const envContent = readFileSync('.env.local', 'utf-8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const supabase = createClient(envVars.NEXT_PUBLIC_SUPABASE_URL, envVars.SUPABASE_SERVICE_ROLE_KEY);
const anthropic = new Anthropic({ apiKey: envVars.ANTHROPIC_API_KEY });

// Manual fixes for known incorrect data
const MANUAL_FIXES: Record<string, {
  company_industry?: string;
  helix_fit_reason: string;
  helix_fit_score: number;
  helix_products: string[];
  predicted_fit?: boolean;
  predicted_rating?: number;
}> = {
  // Seated is ticketing/rewards, not restaurant reservations
  'seated.com': {
    company_industry: 'Ticketing / Rewards',
    helix_fit_reason: 'Dining rewards platform where users earn cashback for restaurant reservations - needs bot prevention for fake reservation abuse and reward fraud',
    helix_fit_score: 85,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  // Resy is restaurant reservations - scalping is a real problem
  'resy.com': {
    helix_fit_reason: 'Restaurant reservation platform (AmEx-owned) - MAJOR bot problem for hard-to-get reservations at hot restaurants like Carbone, Don Angie',
    helix_fit_score: 88,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 9,
  },
  // Tock - fine dining reservations
  'exploretock.com': {
    helix_fit_reason: 'Fine dining reservation platform - notorious bot problem for restaurants like Alinea, French Laundry where reservations sell out instantly',
    helix_fit_score: 90,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 9,
  },
  // OpenTable
  'opentable.com': {
    helix_fit_reason: 'Major restaurant reservation platform - bots hoard reservations at popular restaurants then no-show or resell',
    helix_fit_score: 85,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  // Discord - massive platform
  'discord.com': {
    helix_fit_reason: 'MASSIVE platform 150M+ users - spam bots, server raids, fake accounts, needs age gates for NSFW servers',
    helix_fit_score: 95,
    helix_products: ['captcha_replacement', 'voice_captcha', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 10,
  },
  // Character.AI - huge user base, age verification critical
  'character.ai': {
    helix_fit_reason: 'AI chatbot platform with 20M+ users, many minors - CRITICAL age verification need for mature content, plus bot prevention for API abuse',
    helix_fit_score: 90,
    helix_products: ['captcha_replacement', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 9,
  },
  // Janitor AI - NSFW AI
  'janitorai.com': {
    helix_fit_reason: 'NSFW AI character chat platform - MANDATORY age verification for adult content, plus bot prevention',
    helix_fit_score: 92,
    helix_products: ['captcha_replacement', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 9,
  },
  // Replika
  'replika.ai': {
    helix_fit_reason: 'AI companion app with romantic/adult features - needs age verification for mature content and bot prevention',
    helix_fit_score: 88,
    helix_products: ['captcha_replacement', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  // ElevenLabs - voice cloning
  'elevenlabs.io': {
    helix_fit_reason: 'AI voice synthesis platform - ironic perfect fit for Voice Captcha (verify human before cloning voice), plus bot prevention for API abuse',
    helix_fit_score: 88,
    helix_products: ['captcha_replacement', 'voice_captcha'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  // Arena Club
  'arenaclub.com': {
    helix_fit_reason: 'Derek Jeter\'s sports card marketplace - needs bot prevention for card drops and auctions, similar to StockX model',
    helix_fit_score: 92,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 9,
  },
  // Goldin
  'goldin.co': {
    helix_fit_reason: 'Ken Goldin\'s high-end collectibles auction house (from Netflix show) - needs bot prevention for auction sniping',
    helix_fit_score: 90,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 9,
  },
  // PWCC
  'pwccmarketplace.com': {
    helix_fit_reason: 'Major trading card marketplace and vault service - needs bot prevention for auctions and account creation',
    helix_fit_score: 88,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  // Loupe
  'getloupe.com': {
    helix_fit_reason: 'Live sports card breaking platform - needs bot prevention for live sales where cards sell in seconds',
    helix_fit_score: 88,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  // Dapper Labs
  'dapperlabs.com': {
    helix_fit_reason: 'NBA Top Shot creator - MASSIVE bot problem on pack drops, users run bots to snipe rare moments',
    helix_fit_score: 90,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 9,
  },
  // Immutable
  'immutable.com': {
    helix_fit_reason: 'Web3 gaming platform (Gods Unchained, Guild of Guardians) - needs bot prevention for marketplace and game economies',
    helix_fit_score: 88,
    helix_products: ['captcha_replacement', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  // PrizePicks
  'prizepicks.com': {
    helix_fit_reason: 'Largest daily fantasy sports platform - needs age verification (21+ in most states) and bot prevention for entry manipulation',
    helix_fit_score: 92,
    helix_products: ['captcha_replacement', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 9,
  },
  // Underdog Fantasy
  'underdogfantasy.com': {
    helix_fit_reason: 'Fast-growing fantasy sports platform - needs age verification for gambling compliance and bot prevention',
    helix_fit_score: 90,
    helix_products: ['captcha_replacement', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 9,
  },
  // Sleeper
  'sleeper.com': {
    helix_fit_reason: 'Social fantasy sports app with 6M+ users - needs bot prevention for league manipulation and age gates for betting features',
    helix_fit_score: 88,
    helix_products: ['captcha_replacement', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  // Betr
  'betr.app': {
    helix_fit_reason: 'Jake Paul\'s micro-betting platform - needs age verification (21+) and bot prevention for betting abuse',
    helix_fit_score: 90,
    helix_products: ['captcha_replacement', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 9,
  },
  // Fliff
  'fliff.com': {
    helix_fit_reason: 'Social sportsbook gaming platform - needs age verification for gambling and bot prevention',
    helix_fit_score: 88,
    helix_products: ['captcha_replacement', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  // Cannabis platforms - all need age verification
  'eaze.com': {
    helix_fit_reason: 'Cannabis delivery platform - MANDATORY 21+ age verification required by law',
    helix_fit_score: 92,
    helix_products: ['captcha_replacement', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 9,
  },
  'weedmaps.com': {
    helix_fit_reason: 'Cannabis marketplace and discovery - age verification required by law for all users',
    helix_fit_score: 90,
    helix_products: ['captcha_replacement', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 9,
  },
  'dutchie.com': {
    helix_fit_reason: 'Cannabis dispensary e-commerce platform - age verification mandatory for compliance',
    helix_fit_score: 90,
    helix_products: ['captcha_replacement', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 9,
  },
  'iheartjane.com': {
    helix_fit_reason: 'Cannabis ordering platform - age verification required for regulatory compliance',
    helix_fit_score: 88,
    helix_products: ['captcha_replacement', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  'leafly.com': {
    helix_fit_reason: 'Cannabis information and ordering platform - needs age verification for content and purchases',
    helix_fit_score: 88,
    helix_products: ['captcha_replacement', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  // Alcohol delivery
  'drizly.com': {
    helix_fit_reason: 'Alcohol delivery platform (Uber-owned) - age verification required by law for all orders',
    helix_fit_score: 90,
    helix_products: ['captcha_replacement', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 9,
  },
  'minibardelivery.com': {
    helix_fit_reason: 'Alcohol delivery platform - age verification required by law',
    helix_fit_score: 88,
    helix_products: ['captcha_replacement', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  'vivino.com': {
    helix_fit_reason: 'Wine marketplace and rating app - needs age verification for purchases',
    helix_fit_score: 85,
    helix_products: ['captcha_replacement', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  // Sneaker/Streetwear
  'kith.com': {
    helix_fit_reason: 'Premium streetwear retailer - notorious bot problem on drops, similar to Supreme',
    helix_fit_score: 90,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 9,
  },
  'palaceskateboards.com': {
    helix_fit_reason: 'Hype streetwear brand - massive bot problem on drops, items sell out in seconds',
    helix_fit_score: 90,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 9,
  },
  'bdgastore.com': {
    helix_fit_reason: 'Streetwear boutique with exclusive drops - needs bot prevention like other hype retailers',
    helix_fit_score: 85,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  'snipes.com': {
    helix_fit_reason: 'Sneaker retailer with limited releases - needs bot prevention for drops',
    helix_fit_score: 85,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  'jdsports.com': {
    helix_fit_reason: 'Major sneaker retailer - bot problem on limited releases',
    helix_fit_score: 82,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 7,
  },
  'footlocker.com': {
    helix_fit_reason: 'Major sneaker retailer - faces bot problem on Jordan/Yeezy releases',
    helix_fit_score: 82,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 7,
  },
  // Social/Dating
  'bereal.com': {
    helix_fit_reason: 'Authentic social app - whole point is real humans, perfect for bot prevention and Voice Captcha',
    helix_fit_score: 88,
    helix_products: ['captcha_replacement', 'voice_captcha'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  'lemon8-app.com': {
    helix_fit_reason: 'TikTok sister app growing fast in US - needs bot prevention for fake accounts and engagement',
    helix_fit_score: 85,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  'thisislex.app': {
    helix_fit_reason: 'LGBTQ+ dating and community app - needs verification for user safety and authenticity',
    helix_fit_score: 85,
    helix_products: ['captcha_replacement', 'voice_captcha'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  'kippo.love': {
    helix_fit_reason: 'Dating app for gamers - needs bot/fake profile prevention like other dating apps',
    helix_fit_score: 85,
    helix_products: ['captcha_replacement', 'voice_captcha'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  'coffeemeetsbagel.com': {
    helix_fit_reason: 'Dating app with curated matches - needs fake profile prevention and verification',
    helix_fit_score: 85,
    helix_products: ['captcha_replacement', 'voice_captcha'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  'clubhouse.com': {
    helix_fit_reason: 'Audio social app - PERFECT fit for Voice Captcha (already voice-based), needs bot prevention',
    helix_fit_score: 88,
    helix_products: ['captcha_replacement', 'voice_captcha'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  // Gaming
  'overwolf.com': {
    helix_fit_reason: 'Gaming overlay platform with 35M+ users - needs bot prevention for mod distribution and accounts',
    helix_fit_score: 85,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  'manticoregames.com': {
    helix_fit_reason: 'Core gaming platform (Roblox competitor) - needs bot prevention and age verification like Roblox',
    helix_fit_score: 88,
    helix_products: ['captcha_replacement', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  'minehut.com': {
    helix_fit_reason: 'Minecraft server hosting with young users - needs bot prevention and age verification for child safety',
    helix_fit_score: 85,
    helix_products: ['captcha_replacement', 'age_verification'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  'guilded.gg': {
    helix_fit_reason: 'Gaming community platform (Roblox-owned) - needs bot prevention for spam and raids',
    helix_fit_score: 82,
    helix_products: ['captcha_replacement', 'voice_captcha'],
    predicted_fit: true,
    predicted_rating: 7,
  },
  // AI platforms
  'midjourney.com': {
    helix_fit_reason: 'AI image generation with massive demand - needs bot prevention for queue abuse and generation limits',
    helix_fit_score: 85,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  'suno.ai': {
    helix_fit_reason: 'AI music generation platform - needs bot prevention for generation abuse',
    helix_fit_score: 82,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 7,
  },
  'udio.com': {
    helix_fit_reason: 'AI music creation platform - needs bot prevention for generation limits',
    helix_fit_score: 82,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 7,
  },
  'runwayml.com': {
    helix_fit_reason: 'AI video generation (Gen-2/Gen-3) - needs bot prevention for compute abuse',
    helix_fit_score: 80,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 7,
  },
  'pika.art': {
    helix_fit_reason: 'AI video generation platform - needs bot prevention for compute abuse',
    helix_fit_score: 80,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 7,
  },
  // Ticketing
  'ra.co': {
    helix_fit_reason: 'Resident Advisor - electronic music ticketing with massive scalping problem for hot shows like Berghain',
    helix_fit_score: 90,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 9,
  },
  'seetickets.com': {
    helix_fit_reason: 'UK/EU ticketing platform - needs bot prevention for scalping',
    helix_fit_score: 85,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 8,
  },
  'universe.com': {
    helix_fit_reason: 'Event ticketing platform - needs bot prevention for popular events',
    helix_fit_score: 82,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 7,
  },
  // Fintech/Investing
  'public.com': {
    helix_fit_reason: 'Social investing app - needs bot prevention for fake accounts and market manipulation',
    helix_fit_score: 78,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 7,
  },
  'webull.com': {
    helix_fit_reason: 'Trading platform - needs bot prevention for automation abuse',
    helix_fit_score: 75,
    helix_products: ['captcha_replacement'],
    predicted_fit: false,
    predicted_rating: 5,
  },
  'etoro.com': {
    helix_fit_reason: 'Social trading platform - needs bot prevention for fake accounts/manipulation',
    helix_fit_score: 75,
    helix_products: ['captcha_replacement'],
    predicted_fit: false,
    predicted_rating: 5,
  },
  // Reviews/Social
  'letterboxd.com': {
    helix_fit_reason: 'Movie review social app with 10M+ users - needs bot prevention for fake reviews and engagement',
    helix_fit_score: 78,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 7,
  },
  'medium.com': {
    helix_fit_reason: 'Publishing platform - needs bot prevention for fake accounts and engagement farming',
    helix_fit_score: 72,
    helix_products: ['captcha_replacement'],
    predicted_fit: false,
    predicted_rating: 5,
  },
  // E-commerce
  'shop.app': {
    helix_fit_reason: 'Shopify consumer app - aggregates hype drops from Shopify stores, needs bot prevention',
    helix_fit_score: 82,
    helix_products: ['captcha_replacement'],
    predicted_fit: true,
    predicted_rating: 7,
  },
};

async function fixAndPredict() {
  console.log('🔧 Fixing incorrect data and adding predictions...\n');

  // Apply manual fixes
  let fixed = 0;
  for (const [domain, fix] of Object.entries(MANUAL_FIXES)) {
    const updateData: Record<string, unknown> = {
      helix_fit_reason: fix.helix_fit_reason,
      helix_fit_score: fix.helix_fit_score,
      helix_products: fix.helix_products,
    };

    if (fix.company_industry) {
      updateData.company_industry = fix.company_industry;
    }

    // Add predicted fields if prospect hasn't been reviewed
    if (fix.predicted_fit !== undefined) {
      updateData.is_good_fit = fix.predicted_fit;
    }

    const { error, count } = await supabase
      .from('prospects')
      .update(updateData)
      .eq('company_domain', domain)
      .is('reviewed_at', null); // Only update unreviewed

    if (error) {
      console.error(`Error updating ${domain}:`, error.message);
    } else {
      console.log(`✓ Fixed: ${domain} (score: ${fix.helix_fit_score}, predicted_fit: ${fix.predicted_fit}, predicted_rating: ${fix.predicted_rating})`);
      fixed++;
    }
  }

  console.log(`\n✅ Fixed ${fixed} prospects with better data\n`);

  // Now get remaining unreviewed prospects that need AI prediction
  const { data: remaining } = await supabase
    .from('prospects')
    .select('id, company_name, company_domain, company_industry, helix_fit_reason')
    .is('reviewed_at', null)
    .is('is_good_fit', null);

  console.log(`Remaining prospects needing prediction: ${remaining?.length || 0}`);

  if (remaining && remaining.length > 0) {
    // Use Claude to predict fit based on the user's reviewed lookalikes
    console.log('\n🤖 Using AI to predict fit for remaining prospects...\n');

    const BATCH_SIZE = 10;
    for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
      const batch = remaining.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(remaining.length / BATCH_SIZE)}...`);

      const prompt = `Based on the user's reviewed prospects, predict if these companies are a good fit and what rating (1-10) they would give.

USER'S HIGH-RATED PROSPECTS (8-10):
- Ticketing: DICE (9), Vivid Seats (8), Tock (9), Resident Advisor (9), AXS (8), Fever (9), Eventbrite (9), Ticketmaster (9), SeatGeek (8), Shotgun (8)
- Sneaker/Streetwear: GOAT (10), StockX (10), Supreme (9), Comet (9), Kith (8), Nike SNKRS (10), Laced (8)
- Collectibles: Misprint (10), Collectibles.com (9), Courtyard.io (9), Fanatics Collect (9), OpenSea (8), Whatnot (9)
- Adult/Age-gated: Pornhub (10), OnlyFans (10), Fansly (9), Fanvue (9), Spicychat.ai (9)
- Dating: Feeld (10), Grindr (9), First Round's On Me (8)
- Gaming: Roblox (10), Riot Games (8), Kick (9), LootRush (8)
- Messaging: Signal (10), Telegram (9)
- Prediction Markets: Polymarket (9), Kalshi (9), Betr (9)
- Marketplaces: Fiverr (9), Upwork (8)
- Creator: Patreon (10)
- Social: Bluesky (10)
- AI: Anthropic (9)

USER'S MEDIUM-RATED (5-7):
- Large platforms they're unsure about
- Some fintech

USER'S LOW-RATED (1-4):
- B2B/Enterprise
- Non-US companies
- Generic fintech
- Tools without clear consumer use case

PROSPECTS TO PREDICT:
${JSON.stringify(batch.map(p => ({
  id: p.id,
  name: p.company_name,
  domain: p.company_domain,
  industry: p.company_industry,
  reason: p.helix_fit_reason
})), null, 2)}

For each, predict:
- is_good_fit: true/false (would user rate 6+?)
- predicted_rating: 1-10

Return JSON:
{
  "predictions": [
    {"id": "uuid", "is_good_fit": true, "predicted_rating": 8, "reasoning": "Similar to X which user rated Y"}
  ]
}`;

      try {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }],
        });

        const text = response.content[0].type === 'text' ? response.content[0].text : '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const { predictions } = JSON.parse(jsonMatch[0]);
          for (const pred of predictions) {
            await supabase
              .from('prospects')
              .update({ is_good_fit: pred.is_good_fit })
              .eq('id', pred.id);

            const prospect = batch.find(p => p.id === pred.id);
            console.log(`  ${pred.is_good_fit ? '✓' : '✗'} ${prospect?.company_name}: ${pred.predicted_rating}/10 - ${pred.reasoning?.substring(0, 50) || ''}...`);
          }
        }
      } catch (error) {
        console.error(`Error in batch: ${error}`);
      }

      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Final stats
  const { data: stats } = await supabase
    .from('prospects')
    .select('is_good_fit, reviewed_at')
    .is('reviewed_at', null);

  const predicted = stats?.filter(p => p.is_good_fit !== null) || [];
  const unpredicted = stats?.filter(p => p.is_good_fit === null) || [];

  console.log('\n=== Final Stats ===');
  console.log(`Predicted good fit: ${predicted.filter(p => p.is_good_fit).length}`);
  console.log(`Predicted not fit: ${predicted.filter(p => !p.is_good_fit).length}`);
  console.log(`Still need prediction: ${unpredicted.length}`);
}

fixAndPredict().catch(console.error);
