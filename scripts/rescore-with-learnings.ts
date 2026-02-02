/**
 * Re-score unreviewed prospects using AI learnings from user feedback
 * Eliminates companies that don't fit based on learned patterns
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const anthropic = new Anthropic();

const teamId = 'aa2e0a01-03e4-419c-971a-0a80b187778f';
const BATCH_SIZE = 20;

async function main() {
  // Get learnings
  const { data: settings } = await supabase
    .from('team_settings')
    .select('value')
    .eq('team_id', teamId)
    .eq('key', 'ai_scoring_learnings')
    .single();

  const learnings = settings?.value?.learnings;
  if (!learnings) {
    console.log('No learnings found!');
    return;
  }
  console.log('Loaded learnings');

  // Get unreviewed prospects
  const { data: prospects, count } = await supabase
    .from('prospects')
    .select('id, company_name, company_domain, company_industry, company_description, funding_stage', { count: 'exact' })
    .eq('team_id', teamId)
    .is('reviewed_at', null)
    .neq('status', 'not_a_fit');

  console.log('Unreviewed prospects:', count);

  let eliminated = 0;
  let rescored = 0;
  let processed = 0;

  // Process in batches
  for (let i = 0; i < (prospects?.length || 0); i += BATCH_SIZE) {
    const batch = prospects!.slice(i, i + BATCH_SIZE);
    processed += batch.length;

    const prospectInfo = batch.map(p => ({
      id: p.id,
      company_name: p.company_name,
      domain: p.company_domain,
      industry: p.company_industry || 'Unknown',
      description: p.company_description || 'No description',
      funding: p.funding_stage || 'Unknown',
    }));

    const prompt = `You are evaluating companies for Helix's identity verification products. Apply strict filtering based on user feedback.

HELIX PRODUCTS:
1. Bot Sorter - Replaces CAPTCHAs (ticketing, e-commerce, account creation)
2. Voice Captcha - Voice-based human verification (social platforms, dating apps, marketplaces)
3. Age Verification - Privacy-preserving age gates (gaming, gambling, alcohol/cannabis)

CRITICAL USER LEARNINGS - APPLY STRICTLY:
${learnings.scoringGuidance}

AUTO-REJECT these patterns:
- Mega-tech companies (Google, Meta, Amazon, Apple, Microsoft subsidiaries) - too big
- Direct identity verification competitors (Stripe Identity, Jumio, Onfido, etc.)
- Non-US headquartered companies
- Pure B2B SaaS with no consumer-facing component
- Healthcare/biotech companies
- Enterprise infrastructure companies
- Companies with no clear bot/fraud/age verification need

PRIORITIZE:
- Mid-market gaming companies (Series A-C)
- Ticketing platforms of any size
- Dating/social apps
- Music/streaming with bot problems
- E-commerce with checkout fraud issues

Companies to evaluate:
${JSON.stringify(prospectInfo, null, 2)}

For EACH company, decide:
- is_fit: false if it matches ANY auto-reject pattern
- is_fit: true only if clear product fit AND sales viable

Return JSON array:
{
  "results": [
    {"id": "uuid", "is_fit": true, "score": 75, "reason": "brief reason"}
  ]
}`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const results = JSON.parse(jsonMatch[0]).results;

        for (const result of results) {
          if (result.is_fit === false) {
            await supabase.from('prospects').update({
              status: 'not_a_fit',
              helix_fit_score: 0,
              helix_fit_reason: result.reason || 'Auto-filtered based on user learnings',
            }).eq('id', result.id);
            eliminated++;
          } else {
            const score = result.score || 50;
            await supabase.from('prospects').update({
              helix_fit_score: score,
              helix_fit_reason: result.reason,
            }).eq('id', result.id);
            rescored++;
          }
        }
      }
    } catch (err: any) {
      console.log('Batch error:', err.message);
    }

    console.log(`Processed ${processed}/${prospects?.length} - Eliminated: ${eliminated}, Kept: ${rescored}`);

    // Rate limit
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n=== FINAL RESULTS ===');
  console.log('Total processed:', processed);
  console.log('Eliminated:', eliminated);
  console.log('Kept for review:', rescored);
}

main().catch(console.error);
