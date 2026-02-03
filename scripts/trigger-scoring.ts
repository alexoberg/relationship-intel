/**
 * Trigger Helix Fit Scoring via direct API call
 * Run with: npx tsx scripts/trigger-scoring.ts
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anthropicKey = process.env.ANTHROPIC_API_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const anthropic = new Anthropic({ apiKey: anthropicKey });

const BATCH_SIZE = 5;

async function main() {
  console.log('🎯 Running Helix Fit Scoring...\n');

  // Get team ID
  const { data: teams } = await supabase.from('teams').select('id, name').limit(1);
  if (!teams?.length) {
    console.error('No team found');
    return;
  }
  const teamId = teams[0].id;
  console.log(`Team: ${teams[0].name}\n`);

  // Get prospects needing scoring
  const { data: prospects } = await supabase
    .from('prospects')
    .select('*')
    .eq('team_id', teamId)
    .neq('status', 'not_a_fit')
    .or('helix_fit_reason.is.null,helix_fit_reason.eq.');

  if (!prospects?.length) {
    console.log('All prospects already scored!');
    return;
  }

  console.log(`Found ${prospects.length} prospects needing scoring\n`);

  let processed = 0;
  let withFit = 0;
  let markedNotFit = 0;

  // Process in batches
  for (let i = 0; i < prospects.length; i += BATCH_SIZE) {
    const batch = prospects.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(prospects.length / BATCH_SIZE)}...`);

    const prospectInfo = batch.map(p => ({
      id: p.id,
      company_name: p.company_name,
      domain: p.company_domain,
      industry: p.company_industry,
      description: p.description || p.company_description || 'No description',
    }));

    const prompt = `You are evaluating companies for Helix's identity verification products. Be specific about WHY each product fits.

HELIX PRODUCTS:
1. **Bot Sorter** - Replaces CAPTCHAs with frictionless bot detection. Best for: ticketing (anti-scalping), e-commerce (checkout fraud), account creation flows
2. **Voice Captcha** - Unique voice-based human verification. Best for: social platforms (fake account prevention), dating apps (authenticity), marketplaces (trust)
3. **Age Verification** - Privacy-preserving age gates without collecting DOB. Best for: gaming (age-gated content), gambling, alcohol/cannabis, adult content

CRITICAL REQUIREMENTS FROM SALES TEAM FEEDBACK:
1. **US-based companies ONLY** - Reject non-US headquartered companies
2. **Must be actively operating** - Check if company is defunct/bankrupt/shutdown
3. **Consumer platforms only** - REJECT: B2B SaaS, dev tools, agencies, service businesses, enterprise software
4. **No "creator tools"** - Tools FOR creators are different from platforms WITH creators (reject the former)

HIGH PRIORITY VERTICALS (score 80+):
- Prediction markets / betting platforms (Polymarket, Kalshi-style)
- Collectibles / trading card marketplaces (sports cards, trading cards)
- Messaging apps with spam problems
- Age-gated content platforms (adult content, gambling, cannabis)
- Gaming platforms (especially with child safety/COPPA needs)
- Ticketing platforms (scalping prevention)
- Dating apps (authenticity verification)
- Social networks with bot/fake account problems

MEDIUM PRIORITY (score 60-79):
- Gig economy / freelance marketplaces
- E-commerce with limited drops / hype releases
- Travel platforms (scraping/price manipulation)
- Streaming platforms

LOW PRIORITY / LIKELY REJECT:
- Mega-tech (Meta, Google) - too big, won't buy from startup
- Pure B2B / enterprise software
- Dev tools / APIs / infrastructure
- Marketing agencies / creative studios
- Non-US based companies
- Defunct / bankrupt companies

For each company, determine:
- Which specific Helix product(s) fit and WHY (be specific about the use case)
- Score 1-100 based on priority level above
- If NO clear fit or fails critical requirements, set is_fit to false

Companies: ${JSON.stringify(prospectInfo, null, 2)}

Return JSON:
{
  "results": [
    {
      "id": "uuid",
      "is_fit": true,
      "score": 85,
      "products": ["bot_sorter"],
      "reason": "Specific explanation of why this product fits their business"
    }
  ]
}

Be STRICT - reject companies that don't meet critical requirements.`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log('  No JSON in response, skipping batch');
        continue;
      }

      const results = JSON.parse(jsonMatch[0]).results;

      for (const result of results) {
        if (result.is_fit === false) {
          // Mark as not a fit
          await supabase.from('prospects').update({
            status: 'not_a_fit',
            helix_fit_reason: 'No clear Helix product fit identified',
            helix_fit_score: 0,
            helix_products: [],
          }).eq('id', result.id);
          markedNotFit++;
          console.log(`  ❌ ${batch.find(p => p.id === result.id)?.company_name} - Not a fit`);
        } else {
          // Map product names
          const products = (result.products || []).map((p: string) => {
            const lower = p.toLowerCase();
            if (lower.includes('bot') || lower.includes('captcha_replacement')) return 'captcha_replacement';
            if (lower.includes('voice')) return 'voice_captcha';
            if (lower.includes('age')) return 'age_verification';
            return p;
          });

          await supabase.from('prospects').update({
            helix_products: products,
            helix_fit_reason: result.reason,
            helix_fit_score: result.score || 70,
          }).eq('id', result.id);
          withFit++;
          console.log(`  ✅ ${batch.find(p => p.id === result.id)?.company_name} - ${result.reason.substring(0, 60)}...`);
        }
        processed++;
      }
    } catch (error) {
      console.error(`  Error processing batch: ${error}`);
    }

    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n=== Scoring Complete ===');
  console.log(`Processed: ${processed}`);
  console.log(`With fit: ${withFit}`);
  console.log(`Marked not fit: ${markedNotFit}`);
}

main().catch(console.error);
