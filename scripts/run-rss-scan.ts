/**
 * RSS News scan - looks for Helix-relevant companies in tech news
 * Run with: npx tsx scripts/run-rss-scan.ts
 */

import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const parser = new Parser();

// RSS Feeds to scan
const RSS_FEEDS = [
  'https://techcrunch.com/feed/',
  'https://www.wired.com/feed/rss',
  'https://www.theverge.com/rss/index.xml',
  'https://arstechnica.com/feed/',
  'https://venturebeat.com/feed/',
  'https://krebsonsecurity.com/feed/',
  'https://www.bleepingcomputer.com/feed/',
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
]);

// Keywords that indicate Helix product fit
const HELIX_KEYWORDS = [
  // Bot/CAPTCHA problems
  { keyword: 'bot attack', products: ['captcha_replacement'], weight: 5 },
  { keyword: 'bot problem', products: ['captcha_replacement'], weight: 5 },
  { keyword: 'scraping', products: ['captcha_replacement'], weight: 3 },
  { keyword: 'captcha', products: ['captcha_replacement'], weight: 4 },
  { keyword: 'recaptcha', products: ['captcha_replacement'], weight: 4 },
  { keyword: 'credential stuffing', products: ['captcha_replacement'], weight: 5 },
  { keyword: 'account takeover', products: ['captcha_replacement'], weight: 5 },
  { keyword: 'brute force', products: ['captcha_replacement'], weight: 4 },

  // Fake account problems
  { keyword: 'fake accounts', products: ['voice_captcha'], weight: 5 },
  { keyword: 'fake users', products: ['voice_captcha'], weight: 5 },
  { keyword: 'spam accounts', products: ['voice_captcha'], weight: 4 },
  { keyword: 'bot accounts', products: ['voice_captcha'], weight: 4 },
  { keyword: 'fake profiles', products: ['voice_captcha'], weight: 5 },
  { keyword: 'catfishing', products: ['voice_captcha'], weight: 4 },
  { keyword: 'romance scam', products: ['voice_captcha'], weight: 4 },

  // Ticketing/scalping
  { keyword: 'scalper', products: ['voice_captcha'], weight: 5 },
  { keyword: 'ticket bot', products: ['voice_captcha'], weight: 5 },
  { keyword: 'sold out', products: ['voice_captcha'], weight: 3 },
  { keyword: 'scalping', products: ['voice_captcha'], weight: 5 },
  { keyword: 'resale', products: ['voice_captcha'], weight: 2 },

  // Age verification
  { keyword: 'age verification', products: ['age_verification'], weight: 5 },
  { keyword: 'age gate', products: ['age_verification'], weight: 4 },
  { keyword: 'COPPA', products: ['age_verification'], weight: 5 },
  { keyword: 'minors', products: ['age_verification'], weight: 3 },
  { keyword: 'underage', products: ['age_verification'], weight: 4 },
  { keyword: 'child safety', products: ['age_verification'], weight: 4 },
  { keyword: 'kids online', products: ['age_verification'], weight: 3 },

  // Fraud
  { keyword: 'fraud', products: ['captcha_replacement', 'voice_captcha'], weight: 3 },
  { keyword: 'chargeback', products: ['captcha_replacement'], weight: 4 },
  { keyword: 'promo abuse', products: ['voice_captcha'], weight: 4 },

  // Industry signals
  { keyword: 'ticketing platform', products: ['voice_captcha', 'captcha_replacement'], weight: 4 },
  { keyword: 'dating app', products: ['voice_captcha'], weight: 4 },
  { keyword: 'dating platform', products: ['voice_captcha'], weight: 4 },
  { keyword: 'social platform', products: ['voice_captcha'], weight: 3 },
  { keyword: 'gaming platform', products: ['age_verification'], weight: 3 },
  { keyword: 'online gambling', products: ['age_verification'], weight: 5 },
  { keyword: 'sports betting', products: ['age_verification'], weight: 5 },
  { keyword: 'cannabis', products: ['age_verification'], weight: 4 },
  { keyword: 'alcohol delivery', products: ['age_verification'], weight: 4 },
  { keyword: 'e-commerce', products: ['captcha_replacement'], weight: 2 },
  { keyword: 'marketplace', products: ['voice_captcha', 'captcha_replacement'], weight: 2 },
];

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

  const keywords = matched.map(m => m.keyword);
  const products = [...new Set(matched.flatMap(m => m.products))];
  const score = Math.min(100, matched.reduce((sum, m) => sum + m.weight * 10, 20));

  return { keywords, products, score };
}

// Try to extract company domains mentioned in article text
function extractMentionedDomains(text: string): string[] {
  const domains: string[] = [];

  // Look for .com, .io, .co, etc. mentions
  const domainRegex = /\b([a-z0-9-]+\.(com|io|co|app|ai|xyz|net|org))\b/gi;
  const matches = text.match(domainRegex) || [];

  for (const match of matches) {
    const domain = match.toLowerCase();
    if (!DOMAIN_BLOCKLIST.has(domain) && domain.length > 4) {
      domains.push(domain);
    }
  }

  return [...new Set(domains)];
}

async function main() {
  console.log('🔍 Running RSS scan on tech news feeds...\n');

  // Get team ID
  const { data: teams } = await supabase.from('teams').select('id, name').limit(1);
  if (!teams?.length) {
    console.error('No team found');
    return;
  }
  const teamId = teams[0].id;
  console.log(`Team: ${teams[0].name}\n`);

  // Create a run record
  const { data: run } = await supabase
    .from('listener_runs')
    .insert({
      source_type: 'news_article',
      run_type: 'manual',
      status: 'running',
    })
    .select()
    .single();

  let itemsScanned = 0;
  let discoveriesCreated = 0;
  let duplicatesSkipped = 0;
  let autoPromoted = 0;
  const discoveries: any[] = [];

  const now = Date.now();
  const maxAgeMs = 48 * 60 * 60 * 1000; // 48 hours

  for (const feedUrl of RSS_FEEDS) {
    try {
      console.log(`\nScanning: ${feedUrl}`);
      const feed = await parser.parseURL(feedUrl);

      for (const item of (feed.items || []).slice(0, 30)) {
        if (!item.title) continue;

        // Check age
        const pubDate = item.pubDate ? new Date(item.pubDate) : null;
        if (pubDate && (now - pubDate.getTime()) > maxAgeMs) continue;

        itemsScanned++;

        // Combine title, description, content for analysis
        const searchText = `${item.title} ${item.contentSnippet || ''} ${item.content || ''}`;
        const { keywords, products, score } = findKeywordMatches(searchText);

        if (keywords.length === 0) continue;

        // Try to extract domains mentioned
        const mentionedDomains = extractMentionedDomains(searchText);
        const articleDomain = item.link ? extractDomain(item.link) : null;

        // Use mentioned domains if found, otherwise skip (we need a company to target)
        const targetDomains = mentionedDomains.length > 0 ? mentionedDomains : (articleDomain ? [articleDomain] : []);

        if (targetDomains.length === 0) continue;

        for (const domain of targetDomains.slice(0, 3)) { // Max 3 domains per article
          // Check for existing discovery
          const { data: existing } = await supabase
            .from('listener_discoveries')
            .select('id')
            .eq('company_domain', domain)
            .eq('source_url', item.link)
            .single();

          if (existing) {
            duplicatesSkipped++;
            continue;
          }

          // Create discovery
          const { data: discovery, error } = await supabase
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

          if (error) {
            if (error.code === '23505') {
              duplicatesSkipped++;
            } else {
              console.error(`Error: ${error.message}`);
            }
            continue;
          }

          discoveriesCreated++;
          discoveries.push(discovery);
          console.log(`  ✅ ${domain} - ${keywords.slice(0, 3).join(', ')} (${score}%)`);

          // Auto-promote high confidence discoveries
          if (score >= 80) {
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
                  helix_fit_reason: `News: ${keywords.slice(0, 3).join(', ')} - "${item.title?.substring(0, 100)}"`,
                  source: 'listener',
                  source_url: item.link,
                  status: 'new',
                })
                .select()
                .single();

              if (prospect) {
                await supabase
                  .from('listener_discoveries')
                  .update({
                    status: 'promoted',
                    promoted_prospect_id: prospect.id,
                  })
                  .eq('id', discovery.id);

                autoPromoted++;
                console.log(`     ⬆️ Auto-promoted to prospects`);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(`Failed to parse ${feedUrl}:`, err);
    }
  }

  // Update run record
  await supabase
    .from('listener_runs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      items_scanned: itemsScanned,
      discoveries_created: discoveriesCreated,
      duplicates_skipped: duplicatesSkipped,
      auto_promoted: autoPromoted,
    })
    .eq('id', run?.id);

  console.log('\n=== RSS Scan Complete ===');
  console.log(`Articles scanned: ${itemsScanned}`);
  console.log(`Discoveries created: ${discoveriesCreated}`);
  console.log(`Auto-promoted: ${autoPromoted}`);
  console.log(`Duplicates skipped: ${duplicatesSkipped}`);

  if (discoveries.length > 0) {
    console.log('\n=== New Discoveries ===');
    for (const d of discoveries) {
      console.log(`  ${d.company_domain} (${d.confidence_score}%) - ${d.keywords_matched?.slice(0, 3).join(', ')}`);
    }
  }
}

main().catch(console.error);
