/**
 * Cleanup prospects:
 * 1. Eliminate dead/defunct companies
 * 2. Ensure all active prospects have helix_fit_reason
 * 3. Ensure helix_products array is populated
 * 4. Verify connections are correct
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const anthropic = new Anthropic();

const teamId = 'aa2e0a01-03e4-419c-971a-0a80b187778f';
const BATCH_SIZE = 25;

// Known dead/acquired/pivoted companies to eliminate
const DEAD_COMPANIES = [
  'vine', 'quibi', 'mixer', 'google+', 'googleplus', 'blab', 'meerkat',
  'periscope', 'houseparty', 'yik yak', 'yikyak', 'secret', 'path',
  'friendster', 'myspace', 'digg', 'stumbleupon', 'del.icio.us', 'delicious',
  'foursquare city guide', 'swarm by foursquare', 'clipper', 'rdio', 'grooveshark',
  'songza', 'turntable.fm', 'ping', 'google wave', 'google reader',
  'posterous', 'spring.me', 'formspring', 'ask.fm old', 'friendfeed',
];

async function main() {
  console.log('=== PROSPECT CLEANUP ===\n');

  // Step 1: Get learnings for scoring
  const { data: settings } = await supabase
    .from('team_settings')
    .select('value')
    .eq('team_id', teamId)
    .eq('key', 'ai_scoring_learnings')
    .single();

  const learnings = settings?.value?.learnings;
  console.log('Loaded AI learnings');

  // Step 2: Find prospects needing cleanup
  const { data: needsReason } = await supabase
    .from('prospects')
    .select('id, company_name, company_domain, company_industry, company_description, helix_products')
    .eq('team_id', teamId)
    .neq('status', 'not_a_fit')
    .or('helix_fit_reason.is.null,helix_products.is.null,helix_products.eq.{}');

  console.log(`Prospects needing scoring/cleanup: ${needsReason?.length || 0}`);

  // Step 3: Check for known dead companies
  const { data: allProspects } = await supabase
    .from('prospects')
    .select('id, company_name, company_domain')
    .eq('team_id', teamId)
    .neq('status', 'not_a_fit');

  let deadCount = 0;
  for (const p of allProspects || []) {
    const nameLower = p.company_name.toLowerCase();
    const domainLower = p.company_domain?.toLowerCase() || '';

    if (DEAD_COMPANIES.some(d => nameLower.includes(d) || domainLower.includes(d))) {
      await supabase.from('prospects').update({
        status: 'not_a_fit',
        helix_fit_reason: 'Company is defunct/shut down',
        helix_fit_score: 0,
      }).eq('id', p.id);
      console.log(`Marked dead: ${p.company_name}`);
      deadCount++;
    }
  }
  console.log(`\nMarked ${deadCount} dead companies as not_a_fit`);

  // Step 4: Score prospects without proper data in batches
  if (!needsReason || needsReason.length === 0) {
    console.log('\nNo prospects need scoring!');
    return;
  }

  let scored = 0;
  let eliminated = 0;

  for (let i = 0; i < needsReason.length; i += BATCH_SIZE) {
    const batch = needsReason.slice(i, i + BATCH_SIZE);

    const prospectInfo = batch.map(p => ({
      id: p.id,
      company_name: p.company_name,
      domain: p.company_domain,
      industry: p.company_industry || 'Unknown',
      description: p.company_description || 'No description',
    }));

    const prompt = `You are evaluating companies for Helix's identity verification products.

HELIX PRODUCTS:
1. Bot Sorter (captcha_replacement) - Replaces CAPTCHAs. Best for: ticketing, e-commerce, account creation
2. Voice Captcha (voice_captcha) - Voice-based verification. Best for: social platforms, dating apps, marketplaces
3. Age Verification (age_verification) - Privacy-preserving age gates. Best for: gaming, gambling, alcohol/cannabis

USER LEARNINGS TO APPLY:
${learnings?.scoringGuidance || 'Prioritize mid-market companies in gaming, ticketing, dating. Avoid mega-tech and pure B2B SaaS.'}

ALSO CHECK:
- Is this company still operating? (If clearly defunct/shut down, mark is_fit: false)
- Is this a real consumer-facing company that would need identity verification?

Companies:
${JSON.stringify(prospectInfo, null, 2)}

Return JSON:
{
  "results": [
    {
      "id": "uuid",
      "is_fit": true,
      "is_dead": false,
      "score": 70,
      "products": ["captcha_replacement", "voice_captcha"],
      "reason": "Specific reason why Helix products fit this company"
    }
  ]
}

IMPORTANT: products array must use exact values: captcha_replacement, voice_captcha, age_verification`;

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
          if (result.is_fit === false || result.is_dead === true) {
            await supabase.from('prospects').update({
              status: 'not_a_fit',
              helix_fit_score: 0,
              helix_fit_reason: result.is_dead ? 'Company appears defunct' : (result.reason || 'No clear Helix fit'),
              helix_products: [],
            }).eq('id', result.id);
            eliminated++;
          } else {
            // Normalize products
            const products = (result.products || []).map((p: string) => {
              const lower = p.toLowerCase();
              if (lower.includes('bot') || lower === 'captcha_replacement') return 'captcha_replacement';
              if (lower.includes('voice') || lower === 'voice_captcha') return 'voice_captcha';
              if (lower.includes('age') || lower === 'age_verification') return 'age_verification';
              return null;
            }).filter(Boolean);

            await supabase.from('prospects').update({
              helix_fit_score: result.score || 60,
              helix_fit_reason: result.reason,
              helix_products: products.length > 0 ? products : ['captcha_replacement'], // Default
            }).eq('id', result.id);
            scored++;
          }
        }
      }
    } catch (err: any) {
      console.log(`Batch error: ${err.message}`);
    }

    console.log(`Processed ${Math.min(i + BATCH_SIZE, needsReason.length)}/${needsReason.length} - Scored: ${scored}, Eliminated: ${eliminated}`);

    // Rate limit
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n=== CLEANUP COMPLETE ===');
  console.log(`Dead companies removed: ${deadCount}`);
  console.log(`Prospects scored: ${scored}`);
  console.log(`Prospects eliminated: ${eliminated}`);

  // Final stats
  const { count: finalActive } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .neq('status', 'not_a_fit');

  const { count: finalWithReason } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .neq('status', 'not_a_fit')
    .not('helix_fit_reason', 'is', null);

  console.log(`\nFinal active prospects: ${finalActive}`);
  console.log(`With fit reason: ${finalWithReason}`);

  // Step 5: Verify and clean up connections
  console.log('\n=== VERIFYING CONNECTIONS ===');

  // Get all prospect_connections
  const { data: connections } = await supabase
    .from('prospect_connections')
    .select('id, prospect_id, connector_name, target_name')
    .limit(5000);

  // Get all valid prospect IDs
  const { data: validProspects } = await supabase
    .from('prospects')
    .select('id')
    .eq('team_id', teamId);

  const validProspectIds = new Set((validProspects || []).map(p => p.id));

  // Find orphaned connections (prospect no longer exists or is not_a_fit)
  let orphanedCount = 0;
  for (const conn of connections || []) {
    if (!validProspectIds.has(conn.prospect_id)) {
      // Delete orphaned connection
      await supabase.from('prospect_connections').delete().eq('id', conn.id);
      orphanedCount++;
    }
  }
  console.log(`Cleaned up ${orphanedCount} orphaned connections`);

  // Update connection stats on prospects
  const { data: prospectsWithConns } = await supabase
    .from('prospects')
    .select(`
      id,
      connections_count,
      prospect_connections (id)
    `)
    .eq('team_id', teamId)
    .neq('status', 'not_a_fit');

  let updatedConnCounts = 0;
  for (const p of prospectsWithConns || []) {
    const actualCount = (p.prospect_connections || []).length;
    if (p.connections_count !== actualCount) {
      await supabase.from('prospects').update({
        connections_count: actualCount,
        has_warm_intro: actualCount > 0,
      }).eq('id', p.id);
      updatedConnCounts++;
    }
  }
  console.log(`Updated connection counts for ${updatedConnCounts} prospects`);

  console.log('\n=== ALL CLEANUP COMPLETE ===');
}

main().catch(console.error);
