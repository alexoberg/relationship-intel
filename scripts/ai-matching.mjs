#!/usr/bin/env node
// AI-powered prospect-contact matching using Claude
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

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const TEAM_ID = 'aa2e0a01-03e4-419c-971a-0a80b187778f';

async function matchWithClaude(prospect, contacts) {
  // Build context about contacts' work history
  const contactSummaries = contacts.slice(0, 50).map(c => {
    const jobs = c.pdl_data?.experience?.slice(0, 5).map(j => 
      `${j.title?.name || 'Unknown'} at ${j.company?.name || 'Unknown'}`
    ).join(', ') || 'No work history';
    return `- ${c.full_name} (${c.current_title || 'Unknown'} @ ${c.current_company || 'Unknown'}): ${jobs}`;
  }).join('\n');

  const prompt = `You are helping match sales prospects with network connections.

PROSPECT:
- Company: ${prospect.company_name}
- Domain: ${prospect.company_domain}
- Industry: ${prospect.company_industry || 'Unknown'}
- Description: ${prospect.description || 'No description'}

CONTACTS IN NETWORK (with work history):
${contactSummaries}

Find contacts who:
1. Currently work at ${prospect.company_name} or a very similar company name
2. Previously worked at ${prospect.company_name} (alumni)
3. Work at a direct competitor or closely related company
4. Have relevant industry experience that makes them a good intro path

Return JSON only:
{
  "matches": [
    {
      "name": "Contact Name",
      "match_type": "current_employee|alumni|competitor|industry_relevant",
      "relevance_score": 0-100,
      "reasoning": "Brief explanation"
    }
  ]
}

Only include contacts with relevance_score >= 50. Max 10 matches.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.error(`Claude error for ${prospect.company_name}:`, err.message);
  }
  return { matches: [] };
}

async function main() {
  console.log('🤖 AI-POWERED PROSPECT MATCHING\n');

  // Get all prospects
  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, company_name, company_domain, company_industry, description')
    .eq('team_id', TEAM_ID);

  console.log(`Processing ${prospects?.length || 0} prospects...\n`);

  // Get all contacts with PDL data
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, full_name, current_title, current_company, company_domain, email, linkedin_url, connection_strength, pdl_data')
    .eq('team_id', TEAM_ID)
    .not('pdl_data', 'is', null);

  console.log(`Loaded ${contacts?.length || 0} contacts with work history\n`);

  // Reset connection scores
  await supabase.from('prospects').update({
    connection_score: 0,
    has_warm_intro: false,
    best_connector: null,
    connections_count: 0,
    connection_context: null,
  }).eq('team_id', TEAM_ID);

  let matchedProspects = 0;

  for (const prospect of prospects || []) {
    console.log(`\n🔍 ${prospect.company_name}...`);
    
    const result = await matchWithClaude(prospect, contacts);
    
    if (result.matches?.length > 0) {
      matchedProspects++;
      console.log(`   ✅ ${result.matches.length} matches found`);

      // Find best match
      const best = result.matches.sort((a, b) => b.relevance_score - a.relevance_score)[0];
      
      // Find contact in DB
      const matchedContact = contacts.find(c => 
        c.full_name.toLowerCase().includes(best.name.toLowerCase().split(' ')[0])
      );

      // Calculate connection score
      const connScore = Math.round(best.relevance_score * (matchedContact?.connection_strength || 0.5));

      // Build context
      const context = result.matches.map(m => `${m.name} (${m.match_type})`).join(', ');

      await supabase.from('prospects').update({
        connection_score: connScore,
        has_warm_intro: connScore >= 50,
        best_connector: best.name,
        connections_count: result.matches.length,
        connection_context: context.substring(0, 500),
      }).eq('id', prospect.id);

      // Log matches
      result.matches.forEach(m => {
        console.log(`      - ${m.name}: ${m.match_type} (${m.relevance_score}%) - ${m.reasoning}`);
      });
    } else {
      console.log(`   ⚪ No matches`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n✅ AI MATCHING COMPLETE: ${matchedProspects}/${prospects?.length} prospects matched`);

  // Show top results
  const { data: top } = await supabase
    .from('prospects')
    .select('company_name, priority_score, connection_score, connections_count, best_connector, connection_context')
    .eq('team_id', TEAM_ID)
    .gt('connection_score', 0)
    .order('priority_score', { ascending: false })
    .limit(15);

  console.log('\n🏆 TOP PROSPECTS WITH CONNECTIONS:');
  top?.forEach((p, i) => {
    console.log(`${i+1}. ${p.company_name} - Priority: ${p.priority_score}, Connections: ${p.connections_count}`);
    console.log(`   Best: ${p.best_connector} | ${p.connection_context?.substring(0, 80)}`);
  });
}

main().catch(console.error);
