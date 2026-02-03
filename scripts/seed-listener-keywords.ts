/**
 * Seed Listener Keywords - Populates the listener_keywords table
 *
 * This is the CRITICAL first step to make the listener work.
 * Without keywords, the listener matches nothing.
 *
 * Run with: npx tsx scripts/seed-listener-keywords.ts
 *
 * In production (Vercel), run:
 *   - Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
 *   - npx tsx scripts/seed-listener-keywords.ts
 *
 * Or trigger via authenticated API call:
 *   POST /api/listener/keywords/seed
 */

import { createClient } from '@supabase/supabase-js';

// Keywords seed data (same as src/data/listener-keywords-seed.ts)
const LISTENER_KEYWORDS = [
  // BOT SORTER - Anti-bot, scraping, automation
  { keyword: 'bot attack', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'bot traffic', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'bot detection', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'bot prevention', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'bot mitigation', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'anti-bot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'antibot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'bot protection', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'web scraping', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'scraper', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'scrapers', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'scraping attack', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'content scraping', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'data scraping', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'price scraping', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'anti-scraping', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'crawler', category: 'pain_signal', weight: 3, helixProducts: ['captcha_replacement'] },
  { keyword: 'web crawler', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'aggressive crawler', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'ai crawler', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'llm crawler', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'gptbot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'claudebot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'automation abuse', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'automated attack', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'ticket scalping', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'ticket bot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'ticket bots', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'scalper bot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'sneaker bot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'rate limit', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'rate limiting', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'api abuse', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'captcha', category: 'pain_signal', weight: 3, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'recaptcha', category: 'pain_signal', weight: 3, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'hcaptcha', category: 'pain_signal', weight: 3, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'captcha bypass', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'captcha solver', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'ddos', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'layer 7 attack', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },

  // VOICE CAPTCHA - Phone/voice verification
  { keyword: 'voice verification', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'phone verification', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'voice authentication', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'sms verification', category: 'pain_signal', weight: 4, helixProducts: ['voice_captcha'] },
  { keyword: 'sms otp', category: 'pain_signal', weight: 4, helixProducts: ['voice_captcha'] },
  { keyword: 'otp bypass', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'sms pumping', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'sms toll fraud', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'sim swap', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'virtual phone number', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'burner phone', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'disposable number', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },

  // AGE GATE - Age verification
  { keyword: 'age verification', category: 'pain_signal', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'age gate', category: 'pain_signal', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'age check', category: 'pain_signal', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'age restricted', category: 'pain_signal', weight: 4, helixProducts: ['age_verification'] },
  { keyword: 'age assurance', category: 'pain_signal', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'minor verification', category: 'pain_signal', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'underage', category: 'pain_signal', weight: 4, helixProducts: ['age_verification'] },
  { keyword: 'alcohol delivery', category: 'pain_signal', weight: 4, helixProducts: ['age_verification'] },
  { keyword: 'cannabis delivery', category: 'pain_signal', weight: 4, helixProducts: ['age_verification'] },
  { keyword: 'gambling verification', category: 'pain_signal', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'online gambling', category: 'pain_signal', weight: 4, helixProducts: ['age_verification'] },
  { keyword: 'sports betting', category: 'pain_signal', weight: 4, helixProducts: ['age_verification'] },
  { keyword: 'coppa', category: 'regulatory', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'child safety', category: 'regulatory', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'kosa', category: 'regulatory', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'kids online safety', category: 'regulatory', weight: 5, helixProducts: ['age_verification'] },
  { keyword: 'online safety bill', category: 'regulatory', weight: 5, helixProducts: ['age_verification'] },

  // FRAUD / FAKE ACCOUNTS
  { keyword: 'fake account', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'fake accounts', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'fake user', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'fake users', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'bot account', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'bot accounts', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'spam account', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'account fraud', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'account takeover', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'credential stuffing', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'brute force', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'signup abuse', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'signup fraud', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'registration fraud', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'promo abuse', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'referral abuse', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'coupon abuse', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'identity fraud', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha', 'age_verification'] },
  { keyword: 'synthetic identity', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha', 'age_verification'] },
  { keyword: 'payment fraud', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'carding', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'card testing', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },

  // PLATFORM ABUSE
  { keyword: 'social media bot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'fake engagement', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'fake followers', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'fake review', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'fake reviews', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'review fraud', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'astroturfing', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement', 'voice_captcha'] },
  { keyword: 'content spam', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'comment spam', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },

  // GENERAL SECURITY
  { keyword: 'trust and safety', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement', 'voice_captcha', 'age_verification'] },
  { keyword: 'fraud prevention', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement', 'voice_captcha', 'age_verification'] },
  { keyword: 'fraud detection', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement', 'voice_captcha', 'age_verification'] },
  { keyword: 'device fingerprint', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'fingerprint spoofing', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'proxy abuse', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },
  { keyword: 'residential proxy', category: 'pain_signal', weight: 4, helixProducts: ['captcha_replacement'] },

  // AI-related abuse
  { keyword: 'ai bot', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'ai bots', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'llm abuse', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'ai spam', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'ai scraping', category: 'pain_signal', weight: 5, helixProducts: ['captcha_replacement'] },
  { keyword: 'deepfake', category: 'pain_signal', weight: 4, helixProducts: ['voice_captcha'] },
  { keyword: 'voice clone', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },
  { keyword: 'voice cloning', category: 'pain_signal', weight: 5, helixProducts: ['voice_captcha'] },

  // COMPETITORS
  { keyword: 'cloudflare bot', category: 'competitor', weight: 3, helixProducts: ['captcha_replacement'] },
  { keyword: 'akamai bot', category: 'competitor', weight: 3, helixProducts: ['captcha_replacement'] },
  { keyword: 'imperva', category: 'competitor', weight: 3, helixProducts: ['captcha_replacement'] },
  { keyword: 'datadome', category: 'competitor', weight: 3, helixProducts: ['captcha_replacement'] },
  { keyword: 'perimeterx', category: 'competitor', weight: 3, helixProducts: ['captcha_replacement'] },
  { keyword: 'kasada', category: 'competitor', weight: 3, helixProducts: ['captcha_replacement'] },
  { keyword: 'twilio verify', category: 'competitor', weight: 3, helixProducts: ['voice_captcha'] },
  { keyword: 'yoti', category: 'competitor', weight: 3, helixProducts: ['age_verification'] },
  { keyword: 'veriff', category: 'competitor', weight: 3, helixProducts: ['age_verification'] },
  { keyword: 'onfido', category: 'competitor', weight: 3, helixProducts: ['age_verification'] },
];

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing environment variables:');
    console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
    console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
    console.error('\nSet these environment variables and try again.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  console.log('🔧 Seeding listener keywords...\n');

  // Check current state
  const { count: existingCount } = await supabase
    .from('listener_keywords')
    .select('*', { count: 'exact', head: true });

  console.log(`Current keywords in database: ${existingCount || 0}`);
  console.log(`Keywords to seed: ${LISTENER_KEYWORDS.length}`);

  // Upsert keywords
  const toInsert = LISTENER_KEYWORDS.map(kw => ({
    keyword: kw.keyword.toLowerCase().trim(),
    category: kw.category,
    weight: kw.weight,
    helix_products: kw.helixProducts,
    is_active: true,
  }));

  const { data, error } = await supabase
    .from('listener_keywords')
    .upsert(toInsert, {
      onConflict: 'keyword',
      ignoreDuplicates: false,
    })
    .select('id');

  if (error) {
    console.error('❌ Failed to seed keywords:', error.message);
    process.exit(1);
  }

  // Get final count
  const { count: newCount } = await supabase
    .from('listener_keywords')
    .select('*', { count: 'exact', head: true });

  console.log('\n✅ Keywords seeded successfully!');
  console.log(`   Upserted: ${data?.length || 0}`);
  console.log(`   Total in database: ${newCount || 0}`);

  // Show category breakdown
  const { data: stats } = await supabase
    .from('listener_keywords')
    .select('category');

  if (stats) {
    const byCategory = stats.reduce((acc, kw) => {
      acc[kw.category] = (acc[kw.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('\n   By category:');
    for (const [category, count] of Object.entries(byCategory)) {
      console.log(`   - ${category}: ${count}`);
    }
  }

  console.log('\n🚀 The listener should now start finding matches!');
  console.log('   To trigger a manual scan, call: POST /api/listener/runs { source: "hn" }');
}

main().catch(console.error);
