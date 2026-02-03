/**
 * Debug Listener - Check what's happening with the HN scanner
 * Run with: npx tsx scripts/debug-listener.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing environment variables. Make sure .env is loaded.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const HN_API = 'https://hacker-news.firebaseio.com/v0';

// Domain blocklist - same as production
const DOMAIN_BLOCKLIST = new Set([
  'github.com', 'gitlab.com', 'bitbucket.org', 'medium.com', 'substack.com',
  'twitter.com', 'x.com', 'linkedin.com', 'facebook.com', 'instagram.com',
  'youtube.com', 'reddit.com', 'discord.com', 'discord.gg', 'slack.com',
  'news.ycombinator.com', 'ycombinator.com', 'techcrunch.com', 'wired.com',
  'theverge.com', 'arstechnica.com', 'nytimes.com', 'wsj.com', 'bbc.com',
  'bloomberg.com', 'wikipedia.org', 'archive.org', 'google.com', 'amazon.com',
  'aws.amazon.com', 'cloudflare.com', 'microsoft.com', 'apple.com',
  'stackoverflow.com', 'npmjs.com', 'pypi.org', 'docs.google.com',
  'drive.google.com', 'notion.so', 'figma.com', 'dropbox.com',
]);

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

interface HNUser {
  id: string;
  about?: string;
  karma?: number;
}

async function fetchHNItem(id: number): Promise<HNItem | null> {
  try {
    const res = await fetch(`${HN_API}/item/${id}.json`);
    return res.json();
  } catch {
    return null;
  }
}

async function fetchHNUser(username: string): Promise<HNUser | null> {
  try {
    const res = await fetch(`${HN_API}/user/${username}.json`);
    return res.json();
  } catch {
    return null;
  }
}

function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    let domain = parsed.hostname.replace(/^www\./, '');
    return domain;
  } catch {
    return null;
  }
}

function isCompanyDomain(domain: string): boolean {
  if (DOMAIN_BLOCKLIST.has(domain)) return false;
  for (const blocked of DOMAIN_BLOCKLIST) {
    if (domain.endsWith('.' + blocked)) return false;
  }
  if (!domain.includes('.')) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(domain)) return false;
  return true;
}

async function main() {
  console.log('='.repeat(60));
  console.log('🔍 LISTENER DEBUG REPORT');
  console.log('='.repeat(60));
  console.log();

  // 1. Check if keywords are seeded
  console.log('1. CHECKING KEYWORDS DATABASE');
  console.log('-'.repeat(40));

  const { data: keywords, error: kwError } = await supabase
    .from('listener_keywords')
    .select('keyword, category, weight, is_active')
    .eq('is_active', true)
    .order('weight', { ascending: false })
    .limit(20);

  if (kwError) {
    console.log(`❌ Error fetching keywords: ${kwError.message}`);
  } else if (!keywords || keywords.length === 0) {
    console.log('❌ NO KEYWORDS FOUND! The listener_keywords table is empty.');
    console.log('   This is likely the main issue - keywords need to be seeded.');
    console.log('   Run: POST /api/listener/keywords/seed (while logged in)');
  } else {
    console.log(`✅ Found ${keywords.length}+ active keywords`);
    console.log('   Top keywords:');
    keywords.slice(0, 10).forEach(k => {
      console.log(`     - "${k.keyword}" (weight: ${k.weight}, category: ${k.category})`);
    });
  }

  const { count: totalKeywords } = await supabase
    .from('listener_keywords')
    .select('*', { count: 'exact', head: true });

  console.log(`   Total keywords in DB: ${totalKeywords || 0}`);
  console.log();

  // 2. Check for existing runs
  console.log('2. CHECKING RUN HISTORY');
  console.log('-'.repeat(40));

  const { data: runs, error: runError } = await supabase
    .from('listener_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(5);

  if (runError) {
    console.log(`❌ Error fetching runs: ${runError.message}`);
  } else if (!runs || runs.length === 0) {
    console.log('❌ NO RUNS FOUND! The listener has never run.');
    console.log('   Either the cron is not triggering, or Inngest is not set up.');
  } else {
    console.log(`✅ Found ${runs.length} recent runs:`);
    runs.forEach(r => {
      console.log(`   - ${r.started_at}: ${r.status} (scanned: ${r.items_scanned}, discoveries: ${r.discoveries_created})`);
      if (r.error_details && r.error_details.length > 0) {
        console.log(`     Errors: ${JSON.stringify(r.error_details).slice(0, 100)}...`);
      }
    });
  }
  console.log();

  // 3. Check existing discoveries
  console.log('3. CHECKING DISCOVERIES');
  console.log('-'.repeat(40));

  const { data: discoveries, count: discCount } = await supabase
    .from('listener_discoveries')
    .select('*', { count: 'exact' })
    .order('discovered_at', { ascending: false })
    .limit(5);

  console.log(`   Total discoveries: ${discCount || 0}`);
  if (discoveries && discoveries.length > 0) {
    console.log('   Recent discoveries:');
    discoveries.forEach(d => {
      console.log(`   - ${d.company_domain}: ${d.confidence_score}% (${d.status})`);
      console.log(`     Keywords: ${d.keywords_matched?.join(', ')}`);
    });
  }
  console.log();

  // 4. Check existing prospects from listener
  console.log('4. CHECKING LISTENER PROSPECTS');
  console.log('-'.repeat(40));

  const { data: prospects, count: prospectCount } = await supabase
    .from('prospects')
    .select('*', { count: 'exact' })
    .eq('source', 'listener')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log(`   Total prospects from listener: ${prospectCount || 0}`);
  if (prospects && prospects.length > 0) {
    console.log('   Recent listener prospects:');
    prospects.forEach(p => {
      console.log(`   - ${p.company_name} (${p.company_domain}): score ${p.helix_fit_score}`);
    });
  }
  console.log();

  // 5. Check teams
  console.log('5. CHECKING TEAMS');
  console.log('-'.repeat(40));

  const { data: teams } = await supabase.from('teams').select('id, name').limit(5);
  if (!teams || teams.length === 0) {
    console.log('❌ NO TEAMS FOUND! The listener needs a team ID to work.');
  } else {
    console.log(`✅ Found ${teams.length} team(s):`);
    teams.forEach(t => console.log(`   - ${t.name} (${t.id})`));
  }
  console.log();

  // 6. Live test - scan a few HN stories
  console.log('6. LIVE HN SCAN TEST');
  console.log('-'.repeat(40));

  // Get keywords for matching
  const { data: allKeywords } = await supabase
    .from('listener_keywords')
    .select('keyword')
    .eq('is_active', true);

  const keywordList = allKeywords?.map(k => k.keyword.toLowerCase()) || [];

  if (keywordList.length === 0) {
    console.log('   Skipping live test - no keywords to match against');
  } else {
    console.log(`   Testing with ${keywordList.length} keywords...`);
    console.log();

    // Fetch top stories
    const topRes = await fetch(`${HN_API}/topstories.json`);
    const topIds: number[] = await topRes.json();

    let matched = 0;
    let withDomain = 0;
    let blockedDomain = 0;
    let noDomain = 0;
    let profileChecks = 0;
    let profilesWithCompany = 0;

    const matchedItems: Array<{
      title: string;
      domain: string | null;
      keywords: string[];
      url?: string;
    }> = [];

    console.log(`   Scanning first 50 stories...`);

    for (const id of topIds.slice(0, 50)) {
      const item = await fetchHNItem(id);
      if (!item || !item.title) continue;

      const searchText = `${item.title} ${item.text || ''}`.toLowerCase();
      const matchedKeywords = keywordList.filter(kw => searchText.includes(kw));

      if (matchedKeywords.length > 0) {
        matched++;

        let domain: string | null = null;
        let domainBlocked = false;

        if (item.url) {
          const extracted = extractDomain(item.url);
          if (extracted) {
            if (isCompanyDomain(extracted)) {
              domain = extracted;
              withDomain++;
            } else {
              blockedDomain++;
              domainBlocked = true;
            }
          }
        }

        if (!domain && item.by) {
          profileChecks++;
          const user = await fetchHNUser(item.by);
          if (user?.about) {
            // Simple domain extraction from profile
            const urlMatch = user.about.match(/https?:\/\/[^\s<>"]+/);
            if (urlMatch) {
              const profileDomain = extractDomain(urlMatch[0]);
              if (profileDomain && isCompanyDomain(profileDomain)) {
                domain = profileDomain;
                profilesWithCompany++;
              }
            }
          }
        }

        if (!domain) {
          noDomain++;
        }

        matchedItems.push({
          title: item.title?.slice(0, 60) + '...',
          domain,
          keywords: matchedKeywords.slice(0, 3),
          url: item.url,
        });
      }
    }

    console.log();
    console.log('   RESULTS:');
    console.log(`   - Stories with keyword matches: ${matched}`);
    console.log(`   - With company domain from URL: ${withDomain}`);
    console.log(`   - With blocked domain (github, etc): ${blockedDomain}`);
    console.log(`   - Profiles checked: ${profileChecks}`);
    console.log(`   - Profiles with extractable company: ${profilesWithCompany}`);
    console.log(`   - No domain found: ${noDomain}`);
    console.log();

    if (matchedItems.length > 0) {
      console.log('   MATCHED ITEMS:');
      matchedItems.slice(0, 10).forEach(item => {
        console.log(`   - "${item.title}"`);
        console.log(`     Domain: ${item.domain || '(none)'} | Keywords: ${item.keywords.join(', ')}`);
      });
    } else {
      console.log('   ⚠️ No keyword matches found in top 50 stories!');
      console.log('   This could be normal if no relevant content is on HN right now.');
    }
  }

  console.log();
  console.log('='.repeat(60));
  console.log('DIAGNOSIS SUMMARY');
  console.log('='.repeat(60));

  const issues: string[] = [];

  if (!totalKeywords || totalKeywords === 0) {
    issues.push('Keywords not seeded - this is the primary issue');
  }

  if (!runs || runs.length === 0) {
    issues.push('No runs recorded - cron/Inngest may not be working');
  }

  if (issues.length === 0) {
    console.log('✅ No obvious issues found. The listener appears to be configured correctly.');
    console.log('   If still no prospects, it may be because:');
    console.log('   - Most HN posts link to github/medium/etc (blocked domains)');
    console.log('   - Few posts contain the configured keywords');
    console.log('   - User profiles rarely have extractable company domains');
  } else {
    console.log('❌ ISSUES FOUND:');
    issues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));
  }
}

main().catch(console.error);
