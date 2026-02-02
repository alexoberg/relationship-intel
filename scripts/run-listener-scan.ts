/**
 * Direct Listener scan - bypasses API auth by running scan logic directly
 * Run with: npx tsx scripts/run-listener-scan.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Hacker News API
const HN_API = 'https://hacker-news.firebaseio.com/v0';

// Domain blocklist - skip these common/infrastructure domains
const DOMAIN_BLOCKLIST = new Set([
  'github.com', 'twitter.com', 'x.com', 'linkedin.com', 'facebook.com',
  'youtube.com', 'medium.com', 'substack.com', 'reddit.com', 'news.ycombinator.com',
  'google.com', 'aws.amazon.com', 'azure.microsoft.com', 'cloudflare.com',
  'techcrunch.com', 'wired.com', 'theverge.com', 'arstechnica.com',
  'nytimes.com', 'wsj.com', 'bbc.com', 'cnn.com', 'bloomberg.com',
  'wikipedia.org', 'archive.org', 'imgur.com', 'gist.github.com',
]);

// Keywords that indicate Helix product fit
const HELIX_KEYWORDS = [
  // Bot/CAPTCHA problems
  { keyword: 'bot attack', products: ['captcha_replacement'], weight: 4 },
  { keyword: 'bot problem', products: ['captcha_replacement'], weight: 4 },
  { keyword: 'scraping problem', products: ['captcha_replacement'], weight: 3 },
  { keyword: 'captcha', products: ['captcha_replacement'], weight: 3 },
  { keyword: 'recaptcha', products: ['captcha_replacement'], weight: 4 },
  { keyword: 'hcaptcha', products: ['captcha_replacement'], weight: 4 },
  { keyword: 'credential stuffing', products: ['captcha_replacement'], weight: 4 },
  { keyword: 'account takeover', products: ['captcha_replacement'], weight: 4 },

  // Fake account problems
  { keyword: 'fake accounts', products: ['voice_captcha'], weight: 5 },
  { keyword: 'fake users', products: ['voice_captcha'], weight: 5 },
  { keyword: 'spam accounts', products: ['voice_captcha'], weight: 4 },
  { keyword: 'bot accounts', products: ['voice_captcha'], weight: 4 },

  // Ticketing/scalping
  { keyword: 'scalper', products: ['voice_captcha'], weight: 5 },
  { keyword: 'ticket bot', products: ['voice_captcha'], weight: 5 },
  { keyword: 'sold out in seconds', products: ['voice_captcha'], weight: 5 },
  { keyword: 'bots bought', products: ['voice_captcha'], weight: 5 },

  // Age verification
  { keyword: 'age verification', products: ['age_verification'], weight: 5 },
  { keyword: 'age gate', products: ['age_verification'], weight: 4 },
  { keyword: 'COPPA', products: ['age_verification'], weight: 5 },
  { keyword: 'minors', products: ['age_verification'], weight: 3 },
  { keyword: 'underage', products: ['age_verification'], weight: 4 },

  // Industry signals
  { keyword: 'ticketing', products: ['voice_captcha', 'captcha_replacement'], weight: 3 },
  { keyword: 'dating app', products: ['voice_captcha'], weight: 4 },
  { keyword: 'social network', products: ['voice_captcha'], weight: 3 },
  { keyword: 'gaming', products: ['age_verification'], weight: 3 },
  { keyword: 'gambling', products: ['age_verification'], weight: 4 },
  { keyword: 'e-commerce', products: ['captcha_replacement'], weight: 3 },
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

  const keywords = matched.map(m => m.keyword);
  const products = [...new Set(matched.flatMap(m => m.products))];
  const score = Math.min(100, matched.reduce((sum, m) => sum + m.weight * 10, 20));

  return { keywords, products, score };
}

async function main() {
  console.log('🔍 Running Listener scan on Hacker News...\n');

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
      source_type: 'hn_post',
      run_type: 'manual',
      status: 'running',
    })
    .select()
    .single();

  // Fetch HN front page
  console.log('Fetching HN top stories...');
  const topRes = await fetch(`${HN_API}/topstories.json`);
  const topIds: number[] = await topRes.json();

  // Also get Ask HN and Show HN
  const askRes = await fetch(`${HN_API}/askstories.json`);
  const askIds: number[] = await askRes.json();

  const showRes = await fetch(`${HN_API}/showstories.json`);
  const showIds: number[] = await showRes.json();

  const allIds = [...topIds.slice(0, 100), ...askIds.slice(0, 50), ...showIds.slice(0, 50)];
  const uniqueIds = [...new Set(allIds)];

  console.log(`Processing ${uniqueIds.length} stories...\n`);

  let itemsScanned = 0;
  let discoveriesCreated = 0;
  let duplicatesSkipped = 0;
  const discoveries: any[] = [];

  for (const id of uniqueIds) {
    const item = await fetchHNItem(id);
    if (!item || !item.title) continue;

    itemsScanned++;

    // Combine title and text for keyword matching
    const searchText = `${item.title} ${item.text || ''}`;
    const { keywords, products, score } = findKeywordMatches(searchText);

    if (keywords.length === 0) continue;

    // Extract domain from URL if present
    let domain: string | null = null;
    if (item.url) {
      domain = extractDomain(item.url);
    }

    // If no domain from URL, try to find company mentions in title
    // This is simplified - real implementation would use NER
    if (!domain) {
      // Skip items without clear company domain
      continue;
    }

    // Check for existing discovery
    const { data: existing } = await supabase
      .from('listener_discoveries')
      .select('id')
      .eq('company_domain', domain)
      .eq('source_url', `https://news.ycombinator.com/item?id=${item.id}`)
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

    if (error) {
      if (error.code === '23505') {
        duplicatesSkipped++;
      } else {
        console.error(`Error creating discovery: ${error.message}`);
      }
      continue;
    }

    discoveriesCreated++;
    discoveries.push(discovery);
    console.log(`✅ ${domain} - ${keywords.join(', ')} (${score}%)`);

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
            .update({
              status: 'promoted',
              promoted_prospect_id: prospect.id,
            })
            .eq('id', discovery.id);

          console.log(`   ⬆️ Auto-promoted to prospects`);
        }
      }
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
    })
    .eq('id', run?.id);

  console.log('\n=== Scan Complete ===');
  console.log(`Items scanned: ${itemsScanned}`);
  console.log(`Discoveries created: ${discoveriesCreated}`);
  console.log(`Duplicates skipped: ${duplicatesSkipped}`);

  if (discoveries.length > 0) {
    console.log('\n=== New Discoveries ===');
    for (const d of discoveries) {
      console.log(`  ${d.company_domain} (${d.confidence_score}%) - ${d.keywords_matched?.join(', ')}`);
    }
  }
}

main().catch(console.error);
