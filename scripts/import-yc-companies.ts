/**
 * Import Y Combinator companies from the last 5 years as prospects
 * Uses the YC-OSS API: https://github.com/yc-oss/api
 *
 * Run with: npx tsx scripts/import-yc-companies.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// YC batches from the last 5 years (2021-2025)
// Note: YC now has 3 batches per year (W, S, F) starting in 2024
const YC_BATCHES = [
  // 2021
  'w21', 's21',
  // 2022
  'w22', 's22',
  // 2023
  'w23', 's23',
  // 2024 (3 batches)
  'w24', 's24', 'f24',
  // 2025 (available batches)
  'w25', 's25',
];

// Industries that are good fits for Helix products
const HELIX_RELEVANT_INDUSTRIES = new Set([
  // Bot Sorter targets
  'ticketing', 'tickets', 'events', 'entertainment',
  'e-commerce', 'ecommerce', 'marketplace', 'commerce', 'retail',
  'payments', 'fintech', 'financial services', 'neobank',

  // Voice Captcha targets
  'social', 'social network', 'community', 'social media',
  'dating', 'relationships',
  'creator economy', 'creator', 'ugc', 'content',
  'messaging', 'chat', 'communication',

  // Age Verification targets
  'gaming', 'games', 'esports',
  'gambling', 'betting', 'casino', 'sports betting',
  'alcohol', 'cannabis', 'cbd',
  'adult',

  // General consumer-facing (may have fraud/bot issues)
  'consumer', 'consumer internet',
  'travel', 'hospitality',
  'food', 'delivery', 'food delivery',
  'fitness', 'health & wellness',
  'education', 'edtech',

  // Legal/Compliance (user requested inclusion)
  'legal', 'legaltech', 'legal tech', 'compliance', 'regtech',
]);

// Industries to exclude (B2B SaaS, enterprise, etc.)
const EXCLUDE_INDUSTRIES = new Set([
  'b2b', 'enterprise', 'saas',
  'healthcare', 'health tech', 'biotech', 'medical devices',
  'hardware', 'robotics', 'manufacturing', 'industrial',
  'real estate', 'proptech',
  'recruiting', 'hr tech', 'human resources',
  'developer tools', 'devtools', 'infrastructure',
  'cybersecurity', 'security', // Already have security, not prospects
  'analytics', 'data',
  'ai', 'machine learning', 'ml', // Generic AI companies
  'climate', 'cleantech', 'energy',
  'space', 'aerospace',
  'government', 'govtech',
  'construction', 'construction tech',
  'supply chain', 'logistics',
  'insurance', 'insurtech',
  'agriculture', 'agtech',
]);

interface YCCompany {
  id: number;
  name: string;
  slug: string;
  website: string;
  one_liner: string;
  long_description: string;
  team_size: number;
  industries: string[];
  subindustry: string;
  batch: string;
  status: string;
  location: string;
  country: string;
  year_founded: number;
}

function isHelixRelevant(company: YCCompany): boolean {
  const industries = (company.industries || []).map(i => i.toLowerCase());
  const subindustry = (company.subindustry || '').toLowerCase();
  const description = ((company.one_liner || '') + ' ' + (company.long_description || '')).toLowerCase();

  // Check if any industry matches our target list
  const hasRelevantIndustry = industries.some(ind =>
    HELIX_RELEVANT_INDUSTRIES.has(ind) ||
    Array.from(HELIX_RELEVANT_INDUSTRIES).some(rel => ind.includes(rel))
  );

  // Check subindustry
  const hasRelevantSubindustry = subindustry && (
    HELIX_RELEVANT_INDUSTRIES.has(subindustry) ||
    Array.from(HELIX_RELEVANT_INDUSTRIES).some(rel => subindustry.includes(rel))
  );

  // Check if explicitly excluded
  const hasExcludedIndustry = industries.some(ind =>
    EXCLUDE_INDUSTRIES.has(ind) ||
    Array.from(EXCLUDE_INDUSTRIES).some(exc => ind.includes(exc))
  );

  // Keywords in description that indicate Helix fit
  const helixKeywords = [
    'ticketing', 'ticket', 'event',
    'dating', 'social',
    'marketplace', 'e-commerce', 'ecommerce',
    'gaming', 'game',
    'verification', 'identity', 'fraud',
    'account', 'signup', 'onboarding',
    'bot', 'captcha', 'spam',
    'age', 'minor', 'adult',
    'legal', 'compliance', 'regulatory',
  ];
  const hasHelixKeywords = helixKeywords.some(kw => description.includes(kw));

  // Include if: relevant industry OR has helix keywords, AND not explicitly excluded
  // Exception: If it has a relevant industry AND excluded industry (e.g., "fintech, b2b"), check if consumer-facing
  if (hasExcludedIndustry && !hasRelevantIndustry && !hasHelixKeywords) {
    return false;
  }

  return hasRelevantIndustry || hasRelevantSubindustry || hasHelixKeywords;
}

function extractDomain(url: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function mapBatchToFundingStage(batch: string): string {
  // YC companies are typically seed/pre-seed stage
  // Recent batches might still be fundraising, older batches may have raised
  const year = parseInt('20' + batch.slice(1));
  if (year >= 2024) return 'seed';
  if (year >= 2022) return 'seed'; // Likely still seed or series_a
  return 'series_a'; // Older batches may have progressed
}

async function fetchYCBatch(batch: string): Promise<YCCompany[]> {
  try {
    const url = `https://yc-oss.github.io/api/batches/${batch}.json`;
    const response = await fetch(url);

    if (!response.ok) {
      console.log(`  ⚠️ Batch ${batch} not available (${response.status})`);
      return [];
    }

    const data = await response.json();
    return data || [];
  } catch (error) {
    console.log(`  ❌ Failed to fetch ${batch}:`, error);
    return [];
  }
}

async function main() {
  console.log('🚀 Importing Y Combinator companies (last 5 years)...\n');

  // Get team ID
  const { data: teams } = await supabase.from('teams').select('id, name').limit(1);
  if (!teams?.length) {
    console.error('No team found');
    return;
  }
  const teamId = teams[0].id;
  console.log(`Team: ${teams[0].name}\n`);

  // Get existing prospects to check for duplicates
  const { data: existingProspects } = await supabase
    .from('prospects')
    .select('company_domain')
    .eq('team_id', teamId);

  const existingDomains = new Set(
    (existingProspects || []).map(p => p.company_domain?.toLowerCase())
  );

  console.log(`Existing prospects: ${existingDomains.size}\n`);

  let totalFetched = 0;
  let totalRelevant = 0;
  let totalImported = 0;
  let totalDuplicates = 0;

  const allRelevant: { company: YCCompany; batch: string }[] = [];

  // Fetch all batches
  for (const batch of YC_BATCHES) {
    console.log(`Fetching batch ${batch.toUpperCase()}...`);

    const companies = await fetchYCBatch(batch);
    console.log(`  Found ${companies.length} companies`);
    totalFetched += companies.length;

    // Filter for Helix-relevant companies
    const relevant = companies.filter(c => {
      // Skip if no website
      if (!c.website) return false;

      // Skip dead companies
      if (c.status === 'Dead' || c.status === 'Acquired') return false;

      return isHelixRelevant(c);
    });

    console.log(`  Relevant for Helix: ${relevant.length}`);

    for (const company of relevant) {
      allRelevant.push({ company, batch });
    }
  }

  totalRelevant = allRelevant.length;
  console.log(`\n📊 Total relevant companies: ${totalRelevant}\n`);

  // Import relevant companies
  console.log('Importing prospects...\n');

  for (const { company, batch } of allRelevant) {
    const domain = extractDomain(company.website);
    if (!domain) continue;

    // Check for duplicate
    if (existingDomains.has(domain.toLowerCase())) {
      totalDuplicates++;
      continue;
    }

    // Determine Helix products based on industry
    const industries = (company.industries || []).map(i => i.toLowerCase()).join(' ');
    const description = ((company.one_liner || '') + ' ' + (company.long_description || '')).toLowerCase();
    const combined = industries + ' ' + description;

    const helixProducts: string[] = [];
    if (combined.includes('ticket') || combined.includes('event') || combined.includes('e-commerce') ||
        combined.includes('ecommerce') || combined.includes('marketplace') || combined.includes('payment')) {
      helixProducts.push('captcha_replacement');
    }
    if (combined.includes('social') || combined.includes('dating') || combined.includes('community') ||
        combined.includes('creator') || combined.includes('chat') || combined.includes('messaging')) {
      helixProducts.push('voice_captcha');
    }
    if (combined.includes('gaming') || combined.includes('game') || combined.includes('gambling') ||
        combined.includes('betting') || combined.includes('alcohol') || combined.includes('cannabis') ||
        combined.includes('age') || combined.includes('adult')) {
      helixProducts.push('age_verification');
    }

    // Insert prospect
    const { error } = await supabase.from('prospects').insert({
      team_id: teamId,
      company_name: company.name,
      company_domain: domain,
      company_industry: company.industries?.join(', ') || company.subindustry || null,
      company_description: company.one_liner || null,
      company_size: company.team_size ? `${company.team_size} employees` : null,
      funding_stage: mapBatchToFundingStage(batch),
      helix_products: helixProducts.length > 0 ? helixProducts : null,
      source: 'yc',
      source_url: `https://www.ycombinator.com/companies/${company.slug}`,
      status: 'new',
    });

    if (error) {
      if (error.code === '23505') {
        totalDuplicates++;
      } else {
        console.log(`  ❌ ${company.name}: ${error.message}`);
      }
    } else {
      totalImported++;
      existingDomains.add(domain.toLowerCase());

      if (totalImported % 50 === 0) {
        console.log(`  Imported ${totalImported} prospects...`);
      }
    }
  }

  console.log('\n=== Import Complete ===');
  console.log(`Batches fetched: ${YC_BATCHES.length}`);
  console.log(`Total companies: ${totalFetched}`);
  console.log(`Helix-relevant: ${totalRelevant}`);
  console.log(`Imported: ${totalImported}`);
  console.log(`Duplicates skipped: ${totalDuplicates}`);

  // Summary by industry
  console.log('\n=== Imported by Industry ===');
  const { data: imported } = await supabase
    .from('prospects')
    .select('company_industry')
    .eq('source', 'yc')
    .eq('team_id', teamId);

  const byIndustry: Record<string, number> = {};
  for (const p of imported || []) {
    const ind = p.company_industry || 'Unknown';
    byIndustry[ind] = (byIndustry[ind] || 0) + 1;
  }

  const sorted = Object.entries(byIndustry).sort((a, b) => b[1] - a[1]);
  for (const [industry, count] of sorted.slice(0, 20)) {
    console.log(`  ${industry}: ${count}`);
  }

  console.log('\n✅ Run scoring to evaluate new prospects:');
  console.log('   npx tsx scripts/trigger-scoring.ts');
}

main().catch(console.error);
