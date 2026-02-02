#!/usr/bin/env node
// Use Claude to find more companies that fit Helix's products
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
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

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const TEAM_ID = 'aa2e0a01-03e4-419c-971a-0a80b187778f';

async function main() {
  console.log('🤖 AI-POWERED COMPANY DISCOVERY\n');

  // Get existing prospects
  const { data: existing } = await supabase
    .from('prospects')
    .select('company_name, company_domain')
    .eq('team_id', TEAM_ID);

  const existingNames = existing?.map(p => p.company_name.toLowerCase()) || [];
  const existingDomains = existing?.map(p => p.company_domain?.toLowerCase()) || [];

  console.log(`Current prospects: ${existingNames.length}\n`);

  const prompt = `You are helping find sales prospects for Helix, a company with three products:

1. **Bot Sorter** - CAPTCHA replacement that detects bots without friction
   - Best for: ticketing (concert bots), sneaker drops, flash sales, e-commerce, gaming

2. **Voice Captcha** - Deepfake detection for voice/video verification
   - Best for: identity verification, customer support, banking, any voice-based authentication

3. **Age Verification** - Verify users are 18+ without collecting personal data
   - Best for: dating apps, adult content, gambling, alcohol/cannabis, age-restricted gaming

CURRENT PROSPECTS (already have these):
${existingNames.slice(0, 50).join(', ')}

TASK: Suggest 50 NEW companies that would be great fits for Helix's products. Focus on:
- Companies with bot problems (ticketing, e-commerce, gaming)
- Dating/social apps needing age or identity verification
- Fintech needing fraud prevention
- Gaming platforms with young users
- Marketplaces with scalping/bot issues
- Gambling/betting platforms
- Streaming services
- Any company dealing with deepfakes or fake accounts

For each company, provide:
1. Company name
2. Domain (e.g., company.com)
3. Industry
4. Brief description (1 sentence)
5. Funding stage (seed, series_a, series_b, series_c, series_d, series_e, growth, public, acquired)
6. Helix fit score (0-100)
7. Helix fit reason (why they need our products)
8. Which Helix products (array of: bot_sorter, voice_captcha, age_verification)

IMPORTANT:
- Only suggest companies NOT in the current prospects list
- Focus on companies with clear product-market fit
- Include a mix of large enterprises and growth-stage startups
- Prioritize companies with urgent needs (regulatory, bot epidemic, etc.)

Return as JSON array:
[
  {
    "company_name": "Example Co",
    "company_domain": "example.com",
    "company_industry": "Gaming",
    "description": "Online gaming platform",
    "funding_stage": "series_c",
    "helix_fit_score": 90,
    "helix_fit_reason": "Heavy bot activity in-game economy",
    "helix_products": ["bot_sorter", "age_verification"]
  }
]`;

  console.log('Asking Claude for company suggestions...\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.type === 'text' ? response.content[0].text : '';

  // Extract JSON array
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error('Failed to parse AI response');
    console.log('Raw response:', text.slice(0, 1000));
    return;
  }

  const suggestions = JSON.parse(jsonMatch[0]);
  console.log(`Claude suggested ${suggestions.length} companies\n`);

  let added = 0, skipped = 0;

  for (const company of suggestions) {
    // Skip if already exists
    if (existingNames.includes(company.company_name.toLowerCase()) ||
        existingDomains.includes(company.company_domain?.toLowerCase())) {
      console.log(`⏭️  Skip (exists): ${company.company_name}`);
      skipped++;
      continue;
    }

    try {
      await supabase.from('prospects').insert({
        team_id: TEAM_ID,
        company_name: company.company_name,
        company_domain: company.company_domain,
        company_industry: company.company_industry,
        description: company.description,
        funding_stage: company.funding_stage,
        helix_fit_score: company.helix_fit_score,
        helix_fit_reason: company.helix_fit_reason,
        helix_products: company.helix_products,
      });

      added++;
      console.log(`✅ Added: ${company.company_name} (${company.helix_fit_score}%)`);
      console.log(`   ${company.helix_fit_reason}`);

      // Track for next iteration
      existingNames.push(company.company_name.toLowerCase());
      existingDomains.push(company.company_domain?.toLowerCase());
    } catch (err) {
      console.log(`❌ ${company.company_name}: ${err.message}`);
    }
  }

  console.log(`\n✅ COMPLETE: Added ${added}, Skipped ${skipped}`);

  // Final count
  const { count } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', TEAM_ID);

  console.log(`\n📊 Total prospects: ${count}`);

  // Show by category
  const { data: byIndustry } = await supabase
    .from('prospects')
    .select('company_industry')
    .eq('team_id', TEAM_ID);

  const industries = {};
  byIndustry?.forEach(p => {
    const ind = p.company_industry || 'Unknown';
    industries[ind] = (industries[ind] || 0) + 1;
  });

  console.log('\n📈 BY INDUSTRY:');
  Object.entries(industries)
    .sort((a, b) => b[1] - a[1])
    .forEach(([ind, count]) => {
      console.log(`   ${ind}: ${count}`);
    });
}

main().catch(console.error);
