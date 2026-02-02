/**
 * Expanded Listener scan with more keywords and sources
 * Run with: npx tsx scripts/run-expanded-scan.ts
 */

import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const parser = new Parser();

// HN API
const HN_API = 'https://hacker-news.firebaseio.com/v0';

// Expanded RSS Feeds
const RSS_FEEDS = [
  // Tech news
  'https://techcrunch.com/feed/',
  'https://www.wired.com/feed/rss',
  'https://www.theverge.com/rss/index.xml',
  'https://arstechnica.com/feed/',
  'https://venturebeat.com/feed/',
  'https://thenextweb.com/feed/',
  // Security
  'https://krebsonsecurity.com/feed/',
  'https://www.bleepingcomputer.com/feed/',
  'https://www.darkreading.com/rss.xml',
  'https://threatpost.com/feed/',
  // Startups
  'https://news.crunchbase.com/feed/',
  // Gaming
  'https://www.gamesindustry.biz/feed',
  'https://www.gamedeveloper.com/rss.xml',
];

// Domain blocklist
const DOMAIN_BLOCKLIST = new Set([
  'github.com', 'twitter.com', 'x.com', 'linkedin.com', 'facebook.com',
  'youtube.com', 'medium.com', 'substack.com', 'reddit.com', 'news.ycombinator.com',
  'google.com', 'aws.amazon.com', 'azure.microsoft.com', 'cloudflare.com',
  'techcrunch.com', 'wired.com', 'theverge.com', 'arstechnica.com',
  'nytimes.com', 'wsj.com', 'bbc.com', 'cnn.com', 'bloomberg.com',
  'wikipedia.org', 'archive.org', 'imgur.com', 'gist.github.com',
  'apple.com', 'microsoft.com', 'amazon.com', 'meta.com',
  'venturebeat.com', 'krebsonsecurity.com', 'bleepingcomputer.com',
  'thenextweb.com', 'crunchbase.com', 'gamesindustry.biz', 'gamedeveloper.com',
  'darkreading.com', 'threatpost.com', 'news.crunchbase.com',
  'dropbox.com', 'notion.so', 'slack.com', 'discord.com', 'zoom.us',
  'stripe.com', 'paypal.com', 'visa.com', 'mastercard.com',
]);

// EXPANDED Keywords for Helix products
const HELIX_KEYWORDS = [
  // === BOT/CAPTCHA PROBLEMS ===
  { keyword: 'bot attack', products: ['captcha_replacement'], weight: 5 },
  { keyword: 'bot problem', products: ['captcha_replacement'], weight: 5 },
  { keyword: 'bot traffic', products: ['captcha_replacement'], weight: 4 },
  { keyword: 'bot detection', products: ['captcha_replacement'], weight: 3 },
  { keyword: 'bot prevention', products: ['captcha_replacement'], weight: 3 },
  { keyword: 'bot protection', products: ['captcha_replacement'], weight: 3 },
  { keyword: 'anti-bot', products: ['captcha_replacement'], weight: 4 },
  { keyword: 'scraping', products: ['captcha_replacement'], weight: 3 },
  { keyword: 'web scraping', products: ['captcha_replacement'], weight: 3 },
  { keyword: 'captcha', products: ['captcha_replacement'], weight: 3 },
  { keyword: 'recaptcha', products: ['captcha_replacement'], weight: 4 },
  { keyword: 'hcaptcha', products: ['captcha_replacement'], weight: 4 },
  { keyword: 'credential stuffing', products: ['captcha_replacement'], weight: 5 },
  { keyword: 'account takeover', products: ['captcha_replacement'], weight: 5 },
  { keyword: 'brute force', products: ['captcha_replacement'], weight: 4 },
  { keyword: 'automated attack', products: ['captcha_replacement'], weight: 4 },
  { keyword: 'DDoS', products: ['captcha_replacement'], weight: 3 },

  // === FAKE ACCOUNT PROBLEMS ===
  { keyword: 'fake accounts', products: ['voice_captcha'], weight: 5 },
  { keyword: 'fake users', products: ['voice_captcha'], weight: 5 },
  { keyword: 'fake profiles', products: ['voice_captcha'], weight: 5 },
  { keyword: 'spam accounts', products: ['voice_captcha'], weight: 4 },
  { keyword: 'bot accounts', products: ['voice_captcha'], weight: 4 },
  { keyword: 'catfishing', products: ['voice_captcha'], weight: 5 },
  { keyword: 'romance scam', products: ['voice_captcha'], weight: 5 },
  { keyword: 'sybil attack', products: ['voice_captcha'], weight: 5 },
  { keyword: 'astroturfing', products: ['voice_captcha'], weight: 4 },
  { keyword: 'sock puppet', products: ['voice_captcha'], weight: 4 },
  { keyword: 'impersonation', products: ['voice_captcha'], weight: 3 },
  { keyword: 'identity fraud', products: ['voice_captcha'], weight: 4 },

  // === TICKETING/SCALPING ===
  { keyword: 'scalper', products: ['voice_captcha'], weight: 5 },
  { keyword: 'scalping', products: ['voice_captcha'], weight: 5 },
  { keyword: 'ticket bot', products: ['voice_captcha'], weight: 5 },
  { keyword: 'ticket scalp', products: ['voice_captcha'], weight: 5 },
  { keyword: 'sold out in seconds', products: ['voice_captcha'], weight: 5 },
  { keyword: 'bots bought', products: ['voice_captcha'], weight: 5 },
  { keyword: 'sneaker bot', products: ['voice_captcha'], weight: 5 },
  { keyword: 'resale bot', products: ['voice_captcha'], weight: 5 },
  { keyword: 'limited drop', products: ['voice_captcha'], weight: 3 },
  { keyword: 'hyped release', products: ['voice_captcha'], weight: 3 },
  { keyword: 'concert tickets', products: ['voice_captcha'], weight: 2 },
  { keyword: 'ticket resale', products: ['voice_captcha'], weight: 3 },
  { keyword: 'secondary market', products: ['voice_captcha'], weight: 2 },

  // === AGE VERIFICATION ===
  { keyword: 'age verification', products: ['age_verification'], weight: 5 },
  { keyword: 'age gate', products: ['age_verification'], weight: 4 },
  { keyword: 'age check', products: ['age_verification'], weight: 4 },
  { keyword: 'verify age', products: ['age_verification'], weight: 4 },
  { keyword: 'COPPA', products: ['age_verification'], weight: 5 },
  { keyword: 'KOSA', products: ['age_verification'], weight: 5 },
  { keyword: 'child safety', products: ['age_verification'], weight: 4 },
  { keyword: 'kids online', products: ['age_verification'], weight: 3 },
  { keyword: 'minors', products: ['age_verification'], weight: 3 },
  { keyword: 'underage', products: ['age_verification'], weight: 4 },
  { keyword: 'parental consent', products: ['age_verification'], weight: 4 },
  { keyword: 'age-restricted', products: ['age_verification'], weight: 4 },
  { keyword: 'adult content', products: ['age_verification'], weight: 4 },
  { keyword: 'age-gated', products: ['age_verification'], weight: 4 },
  { keyword: 'ESRB', products: ['age_verification'], weight: 3 },
  { keyword: 'PEGI', products: ['age_verification'], weight: 3 },
  { keyword: 'gambling regulation', products: ['age_verification'], weight: 4 },
  { keyword: 'sports betting', products: ['age_verification'], weight: 4 },
  { keyword: 'online gambling', products: ['age_verification'], weight: 5 },
  { keyword: 'cannabis', products: ['age_verification'], weight: 4 },
  { keyword: 'alcohol delivery', products: ['age_verification'], weight: 4 },
  { keyword: 'vape', products: ['age_verification'], weight: 4 },

  // === FRAUD/ABUSE ===
  { keyword: 'fraud', products: ['captcha_replacement', 'voice_captcha'], weight: 2 },
  { keyword: 'checkout fraud', products: ['captcha_replacement'], weight: 4 },
  { keyword: 'payment fraud', products: ['captcha_replacement'], weight: 3 },
  { keyword: 'chargeback', products: ['captcha_replacement'], weight: 4 },
  { keyword: 'promo abuse', products: ['voice_captcha'], weight: 4 },
  { keyword: 'coupon abuse', products: ['voice_captcha'], weight: 4 },
  { keyword: 'referral fraud', products: ['voice_captcha'], weight: 4 },
  { keyword: 'signup bonus abuse', products: ['voice_captcha'], weight: 4 },
  { keyword: 'multi-accounting', products: ['voice_captcha'], weight: 5 },

  // === INDUSTRY SIGNALS ===
  { keyword: 'ticketing platform', products: ['voice_captcha', 'captcha_replacement'], weight: 4 },
  { keyword: 'ticketing startup', products: ['voice_captcha', 'captcha_replacement'], weight: 4 },
  { keyword: 'event ticketing', products: ['voice_captcha', 'captcha_replacement'], weight: 4 },
  { keyword: 'dating app', products: ['voice_captcha'], weight: 4 },
  { keyword: 'dating platform', products: ['voice_captcha'], weight: 4 },
  { keyword: 'dating startup', products: ['voice_captcha'], weight: 4 },
  { keyword: 'social platform', products: ['voice_captcha'], weight: 3 },
  { keyword: 'social network', products: ['voice_captcha'], weight: 3 },
  { keyword: 'social app', products: ['voice_captcha'], weight: 3 },
  { keyword: 'gaming platform', products: ['age_verification'], weight: 3 },
  { keyword: 'gaming startup', products: ['age_verification'], weight: 3 },
  { keyword: 'mobile game', products: ['age_verification'], weight: 2 },
  { keyword: 'esports', products: ['age_verification'], weight: 3 },
  { keyword: 'fantasy sports', products: ['age_verification', 'voice_captcha'], weight: 4 },
  { keyword: 'e-commerce', products: ['captcha_replacement'], weight: 2 },
  { keyword: 'marketplace', products: ['voice_captcha', 'captcha_replacement'], weight: 2 },
  { keyword: 'sneaker', products: ['captcha_replacement', 'voice_captcha'], weight: 3 },
  { keyword: 'collectibles', products: ['captcha_replacement', 'voice_captcha'], weight: 3 },
  { keyword: 'trading cards', products: ['captcha_replacement'], weight: 3 },
  { keyword: 'NFT', products: ['captcha_replacement', 'voice_captcha'], weight: 3 },
  { keyword: 'crypto exchange', products: ['captcha_replacement'], weight: 3 },
  { keyword: 'fintech', products: ['captcha_replacement'], weight: 2 },
  { keyword: 'neobank', products: ['captcha_replacement'], weight: 3 },
];

interface HNItem {
  id: number;
  title?: string;
  url?: string;
  text?: string;
  by?: string;
  time?: number;
  type?: string;
  score?: number;
}

async function fetchHNItem(id: number): Promise<HNItem | null> {
  try {
    const res = await fetch(`${HN_API}/item/${id}.json`);
    return res.json();
  } catch {
    return null;
  }
}

function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    let domain = parsed.hostname.replace(/^www\./, '');
    if (DOMAIN_BLOCKLIST.has(domain)) return null;
    return domain;
  } catch {
    return null;
  }
}

function findKeywordMatches(text: string): { keywords: string[], products: string[], score: number } {
  const textLower = text.toLowerCase();
  const matched: { keyword: string, products: string[], weight: number }[] = [];

  for (const kw of HELIX_KEYWORDS) {
    if (textLower.includes(kw.keyword.toLowerCase())) {
      matched.push(kw);
    }
  }

  if (matched.length === 0) return { keywords: [], products: [], score: 0 };

  const keywords = [...new Set(matched.map(m => m.keyword))];
  const products = [...new Set(matched.flatMap(m => m.products))];
  const score = Math.min(100, matched.reduce((sum, m) => sum + m.weight * 8, 20));

  return { keywords, products, score };
}

function extractMentionedDomains(text: string): string[] {
  const domains: string[] = [];
  const domainRegex = /\b([a-z0-9][-a-z0-9]*[a-z0-9]\.(com|io|co|app|ai|xyz|net|org|gg|live|tv|me))\b/gi;
  const matches = text.match(domainRegex) || [];

  for (const match of matches) {
    const domain = match.toLowerCase();
    if (!DOMAIN_BLOCKLIST.has(domain) && domain.length > 4) {
      domains.push(domain);
    }
  }

  return [...new Set(domains)];
}

async function scanHN(teamId: string): Promise<{ scanned: number, created: number, promoted: number }> {
  console.log('\n📡 Scanning Hacker News...');

  const topRes = await fetch(`${HN_API}/topstories.json`);
  const topIds: number[] = await topRes.json();

  const askRes = await fetch(`${HN_API}/askstories.json`);
  const askIds: number[] = await askRes.json();

  const showRes = await fetch(`${HN_API}/showstories.json`);
  const showIds: number[] = await showRes.json();

  const newRes = await fetch(`${HN_API}/newstories.json`);
  const newIds: number[] = await newRes.json();

  const allIds = [...new Set([
    ...topIds.slice(0, 100),
    ...askIds.slice(0, 50),
    ...showIds.slice(0, 50),
    ...newIds.slice(0, 100),
  ])];

  let scanned = 0, created = 0, promoted = 0;

  for (const id of allIds) {
    const item = await fetchHNItem(id);
    if (!item || !item.title) continue;
    scanned++;

    const searchText = `${item.title} ${item.text || ''}`;
    const { keywords, products, score } = findKeywordMatches(searchText);
    if (keywords.length === 0) continue;

    let domain: string | null = null;
    if (item.url) domain = extractDomain(item.url);
    if (!domain) {
      const mentioned = extractMentionedDomains(searchText);
      if (mentioned.length > 0) domain = mentioned[0];
    }
    if (!domain) continue;

    // Check for existing
    const { data: existing } = await supabase
      .from('listener_discoveries')
      .select('id')
      .eq('company_domain', domain)
      .eq('source_url', `https://news.ycombinator.com/item?id=${item.id}`)
      .single();

    if (existing) continue;

    const { data: discovery } = await supabase
      .from('listener_discoveries')
      .insert({
        company_domain: domain,
        company_name: domain.split('.')[0],
        source_type: 'hn_post',
        source_url: `https://news.ycombinator.com/item?id=${item.id}`,
        source_title: item.title,
        trigger_text: item.title.substring(0, 500),
        keywords_matched: keywords,
        keyword_category: 'pain_signal',
        confidence_score: score,
        helix_products: products,
        source_published_at: item.time ? new Date(item.time * 1000).toISOString() : null,
      })
      .select()
      .single();

    if (!discovery) continue;
    created++;
    console.log(`  ✅ ${domain} - ${keywords.slice(0, 3).join(', ')} (${score}%)`);

    // Auto-promote high confidence
    if (score >= 70) {
      const { data: existingProspect } = await supabase
        .from('prospects')
        .select('id')
        .eq('company_domain', domain)
        .eq('team_id', teamId)
        .single();

      if (!existingProspect) {
        const { data: prospect } = await supabase
          .from('prospects')
          .insert({
            team_id: teamId,
            company_name: domain.split('.')[0],
            company_domain: domain,
            helix_products: products,
            helix_fit_score: score,
            helix_fit_reason: `Listener: ${keywords.join(', ')}`,
            source: 'listener',
            source_url: `https://news.ycombinator.com/item?id=${item.id}`,
            status: 'new',
          })
          .select()
          .single();

        if (prospect) {
          await supabase
            .from('listener_discoveries')
            .update({ status: 'promoted', promoted_prospect_id: prospect.id })
            .eq('id', discovery.id);
          promoted++;
          console.log(`     ⬆️ Auto-promoted`);
        }
      }
    }
  }

  return { scanned, created, promoted };
}

async function scanRSS(teamId: string): Promise<{ scanned: number, created: number, promoted: number }> {
  console.log('\n📰 Scanning RSS feeds...');

  const now = Date.now();
  const maxAgeMs = 72 * 60 * 60 * 1000; // 72 hours
  let scanned = 0, created = 0, promoted = 0;

  for (const feedUrl of RSS_FEEDS) {
    try {
      console.log(`  Scanning: ${new URL(feedUrl).hostname}`);
      const feed = await parser.parseURL(feedUrl);

      for (const item of (feed.items || []).slice(0, 50)) {
        if (!item.title) continue;

        const pubDate = item.pubDate ? new Date(item.pubDate) : null;
        if (pubDate && (now - pubDate.getTime()) > maxAgeMs) continue;

        scanned++;
        const searchText = `${item.title} ${item.contentSnippet || ''} ${item.content || ''}`;
        const { keywords, products, score } = findKeywordMatches(searchText);
        if (keywords.length === 0) continue;

        const mentionedDomains = extractMentionedDomains(searchText);
        if (mentionedDomains.length === 0) continue;

        for (const domain of mentionedDomains.slice(0, 2)) {
          const { data: existing } = await supabase
            .from('listener_discoveries')
            .select('id')
            .eq('company_domain', domain)
            .eq('source_url', item.link)
            .single();

          if (existing) continue;

          const { data: discovery } = await supabase
            .from('listener_discoveries')
            .insert({
              company_domain: domain,
              company_name: domain.split('.')[0],
              source_type: 'news_article',
              source_url: item.link,
              source_title: item.title?.substring(0, 500),
              trigger_text: (item.contentSnippet || item.title)?.substring(0, 500),
              keywords_matched: keywords,
              keyword_category: 'pain_signal',
              confidence_score: score,
              helix_products: products,
              source_published_at: pubDate?.toISOString() || null,
            })
            .select()
            .single();

          if (!discovery) continue;
          created++;
          console.log(`    ✅ ${domain} - ${keywords.slice(0, 3).join(', ')} (${score}%)`);

          // Auto-promote
          if (score >= 70) {
            const { data: existingProspect } = await supabase
              .from('prospects')
              .select('id')
              .eq('company_domain', domain)
              .eq('team_id', teamId)
              .single();

            if (!existingProspect) {
              const { data: prospect } = await supabase
                .from('prospects')
                .insert({
                  team_id: teamId,
                  company_name: domain.split('.')[0],
                  company_domain: domain,
                  helix_products: products,
                  helix_fit_score: score,
                  helix_fit_reason: `News: ${keywords.slice(0, 3).join(', ')} - "${item.title?.substring(0, 60)}"`,
                  source: 'listener',
                  source_url: item.link,
                  status: 'new',
                })
                .select()
                .single();

              if (prospect) {
                await supabase
                  .from('listener_discoveries')
                  .update({ status: 'promoted', promoted_prospect_id: prospect.id })
                  .eq('id', discovery.id);
                promoted++;
                console.log(`       ⬆️ Auto-promoted`);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(`    Failed: ${err}`);
    }
  }

  return { scanned, created, promoted };
}

async function main() {
  console.log('🔍 Running EXPANDED Listener scan...\n');
  console.log(`Keywords: ${HELIX_KEYWORDS.length}`);
  console.log(`RSS Feeds: ${RSS_FEEDS.length}`);

  const { data: teams } = await supabase.from('teams').select('id, name').limit(1);
  if (!teams?.length) {
    console.error('No team found');
    return;
  }
  const teamId = teams[0].id;
  console.log(`Team: ${teams[0].name}`);

  // Create run record
  const { data: run } = await supabase
    .from('listener_runs')
    .insert({
      source_type: 'hn_post',
      run_type: 'manual',
      status: 'running',
    })
    .select()
    .single();

  const hnResults = await scanHN(teamId);
  const rssResults = await scanRSS(teamId);

  // Update run
  await supabase
    .from('listener_runs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      items_scanned: hnResults.scanned + rssResults.scanned,
      discoveries_created: hnResults.created + rssResults.created,
      auto_promoted: hnResults.promoted + rssResults.promoted,
    })
    .eq('id', run?.id);

  console.log('\n=== EXPANDED Scan Complete ===');
  console.log(`HN: ${hnResults.scanned} scanned, ${hnResults.created} discovered, ${hnResults.promoted} promoted`);
  console.log(`RSS: ${rssResults.scanned} scanned, ${rssResults.created} discovered, ${rssResults.promoted} promoted`);
  console.log(`TOTAL: ${hnResults.created + rssResults.created} new discoveries, ${hnResults.promoted + rssResults.promoted} auto-promoted`);
}

main().catch(console.error);
