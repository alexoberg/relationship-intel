#!/usr/bin/env node
/**
 * Complete Helix Scoring for All Prospects
 * Uses AI to analyze each company and determine Helix product fit
 */
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic();

const TEAM_ID = 'aa2e0a01-03e4-419c-971a-0a80b187778f';
const BATCH_SIZE = 5;

// Helix product descriptions for AI context
const HELIX_PRODUCTS = {
  captcha_replacement: {
    name: 'Captcha Replacement',
    description: 'Bot protection solution replacing traditional CAPTCHAs. Best for e-commerce, ticketing, travel, and financial services companies using CDNs like Fastly or bot protection like PerimeterX.',
    signals: ['high-traffic website', 'bot attacks', 'account takeover', 'scraping concerns', 'uses Fastly/PerimeterX/Cloudflare']
  },
  voice_captcha: {
    name: 'Voice Captcha',
    description: 'Unique human verification via voice. Best for social platforms, marketplaces, dating apps, forums needing to verify unique humans (anti-fake-accounts).',
    signals: ['user-generated content', 'fake accounts problem', 'bot manipulation', 'social platform', 'marketplace fraud']
  },
  age_verification: {
    name: 'Age Verification',
    description: 'Privacy-preserving age verification. Best for gaming, gambling, adult content, alcohol/cannabis platforms requiring age gates.',
    signals: ['age-restricted content', 'gaming with minors', 'gambling', 'adult content', 'COPPA compliance', 'alcohol/cannabis sales']
  }
};

async function analyzeProspects(prospects) {
  const prospectInfo = prospects.map(p => ({
    id: p.id,
    company_name: p.company_name,
    domain: p.company_domain,
    industry: p.company_industry,
    description: p.company_description || 'No description available',
    employee_count: p.employee_count_range,
    location: p.company_location,
    connections_count: p.connections_count || 0,
    has_warm_intro: p.has_warm_intro,
  }));

  const prompt = `Analyze these companies for Helix product fit. Helix offers three products:

1. **Captcha Replacement** - Bot protection replacing CAPTCHAs
   - Best for: e-commerce, ticketing, travel, financial services, high-traffic sites
   - Signals: needs bot protection, uses Fastly/PerimeterX/Cloudflare, has scraping/scalping issues

2. **Voice Captcha** - Unique human verification via voice
   - Best for: social platforms, marketplaces, dating apps, forums, community sites
   - Signals: fake accounts problem, bot manipulation, needs unique human verification

3. **Age Verification** - Privacy-preserving age verification
   - Best for: gaming, gambling, adult content, alcohol/cannabis platforms
   - Signals: age-restricted content, COPPA compliance, minors protection needed

For each company, determine:
- Which Helix products fit (can be multiple, or none)
- A confidence score (0-1) for each product
- A brief reason explaining WHY Helix fits their business

Companies to analyze:
${JSON.stringify(prospectInfo, null, 2)}

Return ONLY valid JSON:
{
  "results": [
    {
      "id": "uuid",
      "products": ["captcha_replacement", "voice_captcha", "age_verification"],
      "primary_product": "captcha_replacement",
      "confidence": 0.8,
      "reason": "Brief 1-2 sentence explanation of why Helix fits",
      "priority_score": 85
    }
  ]
}

Rules:
- products array should only include products that genuinely fit (can be empty [])
- primary_product is the best fit product (or null if none fit)
- confidence is for the primary product (0-1)
- reason explains the business case for Helix (be specific to their industry/use case)
- priority_score is overall prospect priority (0-100) based on: product fit, company size, warm intro availability

Be conservative - only assign products where there's a clear business case.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');

  return JSON.parse(jsonMatch[0]).results;
}

async function main() {
  console.log('=== Complete Helix Scoring for All Prospects ===\n');

  // Get all prospects
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('*')
    .eq('team_id', TEAM_ID);

  if (error) throw error;

  // Filter to those needing scoring
  const needsScoring = prospects.filter(p =>
    !p.helix_fit_reason || p.helix_fit_reason === '' || p.helix_fit_reason === 'No specific Helix product fit identified'
  );

  console.log(`Total prospects: ${prospects.length}`);
  console.log(`Need Helix scoring: ${needsScoring.length}\n`);

  if (needsScoring.length === 0) {
    console.log('All prospects already have Helix scores!');
    return;
  }

  let processed = 0;
  let updated = 0;
  let withProducts = 0;

  for (let i = 0; i < needsScoring.length; i += BATCH_SIZE) {
    const batch = needsScoring.slice(i, i + BATCH_SIZE);

    try {
      const results = await analyzeProspects(batch);

      for (const result of results) {
        // Note: priority_score is a computed column, don't update it
        const updateData = {
          helix_products: result.products || [],
          helix_fit_reason: result.reason || 'No specific Helix product fit identified',
        };

        const { error: updateError } = await supabase
          .from('prospects')
          .update(updateData)
          .eq('id', result.id);

        if (updateError) {
          console.error(`Error updating ${result.id}:`, updateError.message);
        } else {
          processed++;
          updated++;
          if (result.products && result.products.length > 0) {
            withProducts++;
            const prospect = batch.find(p => p.id === result.id);
            console.log(`✓ ${prospect?.company_name}: ${result.products.join(', ')} (${result.priority_score})`);
          }
        }
      }

      console.log(`Processed ${Math.min(i + BATCH_SIZE, needsScoring.length)}/${needsScoring.length}`);

      // Rate limit
      await new Promise(r => setTimeout(r, 1000));

    } catch (err) {
      console.error(`Batch error at ${i}:`, err.message);
    }
  }

  console.log('\n=== Helix Scoring Complete ===');
  console.log(`Processed: ${processed}`);
  console.log(`Updated: ${updated}`);
  console.log(`With product fit: ${withProducts}`);

  // Final stats
  const { data: finalStats } = await supabase
    .from('prospects')
    .select('helix_products, helix_fit_reason, priority_score')
    .eq('team_id', TEAM_ID);

  const withReason = finalStats.filter(p => p.helix_fit_reason && p.helix_fit_reason !== 'No specific Helix product fit identified').length;
  const withProds = finalStats.filter(p => p.helix_products && p.helix_products.length > 0).length;

  console.log('\n=== Final Database Stats ===');
  console.log(`Prospects with helix_fit_reason: ${withReason}/${finalStats.length}`);
  console.log(`Prospects with helix_products: ${withProds}/${finalStats.length}`);

  // Product breakdown
  const productCounts = { captcha_replacement: 0, voice_captcha: 0, age_verification: 0 };
  for (const p of finalStats) {
    for (const prod of (p.helix_products || [])) {
      if (productCounts[prod] !== undefined) productCounts[prod]++;
    }
  }
  console.log('\nProduct distribution:');
  Object.entries(productCounts).forEach(([prod, count]) => {
    console.log(`  ${prod}: ${count}`);
  });
}

main().catch(console.error);
