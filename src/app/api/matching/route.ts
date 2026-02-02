import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const TEAM_ID = 'aa2e0a01-03e4-419c-971a-0a80b187778f';

async function matchWithClaude(prospect: any, contacts: any[]) {
  const contactSummaries = contacts.slice(0, 50).map(c => {
    const jobs = c.pdl_data?.experience?.slice(0, 5).map((j: any) => 
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

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    console.error(`Claude error for ${prospect.company_name}:`, err);
  }
  return { matches: [] };
}

// POST /api/matching - Run AI matching
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { prospect_id, prospect_ids } = body;

    let query = supabase
      .from('prospects')
      .select('id, company_name, company_domain, company_industry, description')
      .eq('team_id', TEAM_ID);

    if (prospect_id) {
      query = query.eq('id', prospect_id);
    } else if (prospect_ids?.length) {
      query = query.in('id', prospect_ids);
    }

    const { data: prospects, error: prospectError } = await query;
    if (prospectError) throw prospectError;

    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, full_name, current_title, current_company, company_domain, email, linkedin_url, connection_strength, pdl_data')
      .eq('team_id', TEAM_ID)
      .not('pdl_data', 'is', null);

    const results = [];

    for (const prospect of prospects || []) {
      const result = await matchWithClaude(prospect, contacts || []);
      
      if (result.matches?.length > 0) {
        const best = result.matches.sort((a: any, b: any) => b.relevance_score - a.relevance_score)[0];
        const matchedContact = contacts?.find(c => 
          c.full_name.toLowerCase().includes(best.name.toLowerCase().split(' ')[0])
        );

        const connScore = Math.round(best.relevance_score * (matchedContact?.connection_strength || 0.5));
        const context = result.matches.map((m: any) => `${m.name} (${m.match_type})`).join(', ');

        await supabase.from('prospects').update({
          connection_score: connScore,
          has_warm_intro: connScore >= 50,
          best_connector: best.name,
          connections_count: result.matches.length,
          connection_context: context.substring(0, 500),
        }).eq('id', prospect.id);

        results.push({
          prospect: prospect.company_name,
          matches: result.matches.length,
          best_connector: best.name,
          connection_score: connScore,
        });
      } else {
        results.push({ prospect: prospect.company_name, matches: 0 });
      }
    }

    return NextResponse.json({ success: true, processed: prospects?.length || 0, results });

  } catch (error) {
    console.error('Matching error:', error);
    return NextResponse.json({ error: 'Matching failed' }, { status: 500 });
  }
}

// GET /api/matching - Get matching status
export async function GET() {
  const { data } = await supabase
    .from('prospects')
    .select('company_name, connection_score, connections_count, best_connector')
    .eq('team_id', TEAM_ID)
    .gt('connection_score', 0)
    .order('connection_score', { ascending: false })
    .limit(20);

  return NextResponse.json({ matched_prospects: data?.length || 0, top_matches: data });
}
