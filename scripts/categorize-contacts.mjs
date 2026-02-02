#!/usr/bin/env node
// Categorize contacts: VC, Angel, Sales Prospect, Irrelevant
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

// VC firm indicators
const VC_KEYWORDS = [
  'venture capital', 'private equity', 'investment', 'vc', 'pe',
  'partners', 'capital', 'ventures', 'fund', 'sequoia', 'a16z',
  'andreessen', 'accel', 'greylock', 'benchmark', 'index',
  'general catalyst', 'lightspeed', 'nea', 'bessemer',
  'founders fund', 'kleiner', 'ggv', 'insight', 'tiger'
];

const VC_TITLES = [
  /\b(partner|principal|associate|analyst)\b/i,
  /\b(managing\s*director|md)\b/i,
  /\b(investment\s*(professional|director|manager))\b/i,
  /\b(venture\s*partner|venture\s*associate)\b/i,
  /\b(general\s*partner|gp|limited\s*partner|lp)\b/i,
];

// Angel indicators
const ANGEL_TITLES = [
  /\binvestor\b/i,
  /\bboard\s*(member|director|seat)\b/i,
  /\badvisor\b/i,
  /\bangel\b/i,
  /\bmentor\b/i,
  /\bentrepreneur\s*in\s*residence\b/i,
  /\beir\b/i,
];

const EXEC_TITLES = [
  /\b(ceo|chief\s*executive)\b/i,
  /\b(cto|chief\s*technology)\b/i,
  /\b(cfo|chief\s*financial)\b/i,
  /\b(coo|chief\s*operating)\b/i,
  /\b(founder|co-founder|cofounder)\b/i,
];

// Sales prospect indicators (Helix target personas)
const SALES_TITLES = [
  /\b(ciso|chief\s*information\s*security)\b/i,
  /\b(general\s*counsel|gc|chief\s*legal|clo)\b/i,
  /\b(trust\s*(and|&)?\s*safety)\b/i,
  /\bvp.*(security|engineering|product)\b/i,
  /\bhead\s*of.*(security|fraud|trust|safety|risk)\b/i,
  /\bdirector.*(security|fraud|trust|safety|risk)\b/i,
  /\bfraud\s*(prevention|operations)\b/i,
];

// Check if company is VC-like
function isVCCompany(company, industry) {
  if (!company) return false;
  const companyLower = company.toLowerCase();
  const industryLower = (industry || '').toLowerCase();

  if (industryLower.includes('venture capital') || industryLower.includes('private equity')) {
    return true;
  }

  // Check company name against VC keywords
  for (const kw of VC_KEYWORDS) {
    if (companyLower.includes(kw)) return true;
  }

  return false;
}

// Check work history for VC experience
function hasVCHistory(workHistory) {
  if (!workHistory?.length) return null;

  for (const job of workHistory) {
    if (isVCCompany(job.company?.name, job.company?.industry)) {
      return job.company?.name;
    }
  }
  return null;
}

// Rule-based categorization
function categorizeByRules(contact, workHistory) {
  const title = contact.current_title || '';
  const company = contact.current_company || '';
  const industry = contact.industry || '';

  // Check for VC (current or past)
  if (isVCCompany(company, industry)) {
    return { category: 'vc', confidence: 0.95, reason: `Currently at VC/PE: ${company}` };
  }

  const pastVC = hasVCHistory(workHistory);
  if (pastVC) {
    return { category: 'vc', confidence: 0.85, reason: `Previously at VC/PE: ${pastVC}` };
  }

  // Check VC titles (even if company not recognized as VC)
  for (const pattern of VC_TITLES) {
    if (pattern.test(title)) {
      return { category: 'vc', confidence: 0.8, reason: `VC-typical title: ${title}` };
    }
  }

  // Check for Angel indicators
  for (const pattern of ANGEL_TITLES) {
    if (pattern.test(title)) {
      return { category: 'angel', confidence: 0.9, reason: `Angel/investor title: ${title}` };
    }
  }

  // Check for C-suite/Founder at tech company (potential angel)
  for (const pattern of EXEC_TITLES) {
    if (pattern.test(title)) {
      // Check if it's a tech/startup
      const techIndicators = ['software', 'tech', 'saas', 'ai', 'data', 'cloud', 'platform', 'digital'];
      const isTech = techIndicators.some(t =>
        company.toLowerCase().includes(t) || industry.toLowerCase().includes(t)
      );
      if (isTech) {
        return { category: 'angel', confidence: 0.7, reason: `Tech executive/founder: ${title} at ${company}` };
      }
    }
  }

  // Check for Sales prospect (Helix target personas)
  for (const pattern of SALES_TITLES) {
    if (pattern.test(title)) {
      return { category: 'sales_prospect', confidence: 0.85, reason: `Helix target persona: ${title}` };
    }
  }

  return null; // Use AI fallback
}

// AI categorization
async function categorizeWithAI(contact, workHistory) {
  const workHistoryText = (workHistory || [])
    .slice(0, 5)
    .map(job => `- ${job.title?.name || 'Unknown'} at ${job.company?.name || 'Unknown'}`)
    .join('\n');

  const prompt = `Categorize this contact for a B2B sales and fundraising tool.

CONTACT:
Name: ${contact.full_name}
Title: ${contact.current_title || 'Unknown'}
Company: ${contact.current_company || 'Unknown'}

WORK HISTORY:
${workHistoryText || 'Not available'}

CATEGORIES (pick one):
1. vc - Works or has EVER worked at a VC/PE firm
2. angel - Has investor/board title OR is C-suite/founder at tech startup (but NO VC history)
3. sales_prospect - Decision maker for enterprise security: CISO, GC, Trust & Safety, VP Security
4. irrelevant - Individual contributor, student, non-decision maker, unrelated industry

RESPOND WITH JSON ONLY:
{"category": "vc|angel|sales_prospect|irrelevant", "confidence": 0.0-1.0, "reason": "brief explanation"}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 150,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      category: parsed.category,
      confidence: parsed.confidence || 0.7,
      reason: parsed.reason || 'AI categorization',
    };
  } catch (err) {
    console.error(`AI error: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log('🏷️  CONTACT CATEGORIZATION\n');
  console.log('Categories: VC | Angel | Sales Prospect | Irrelevant\n');

  // Get current stats
  const { data: allContacts } = await supabase
    .from('contacts')
    .select('category')
    .eq('team_id', TEAM_ID);

  const stats = { vc: 0, angel: 0, sales_prospect: 0, irrelevant: 0, uncategorized: 0 };
  allContacts?.forEach(c => {
    stats[c.category || 'uncategorized'] = (stats[c.category || 'uncategorized'] || 0) + 1;
  });

  console.log('CURRENT STATUS:');
  console.log(`  Total: ${allContacts?.length || 0}`);
  Object.entries(stats).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count}`);
  });

  // Get uncategorized contacts with PDL data
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, full_name, current_title, current_company, pdl_data')
    .eq('team_id', TEAM_ID)
    .or('category.is.null,category.eq.uncategorized')
    .not('pdl_data', 'is', null)
    .limit(500);

  if (error) {
    console.error(`Error: ${error.message}`);
    return;
  }

  console.log(`\nProcessing ${contacts?.length || 0} uncategorized contacts with PDL data...\n`);

  let categorized = { vc: 0, angel: 0, sales_prospect: 0, irrelevant: 0 };
  let ruleBased = 0, aiBased = 0;

  for (const contact of contacts || []) {
    const workHistory = contact.pdl_data?.experience || [];

    // Try rules first
    let result = categorizeByRules(contact, workHistory);

    if (result) {
      ruleBased++;
    } else {
      // AI fallback
      result = await categorizeWithAI(contact, workHistory);
      if (result) aiBased++;

      // Rate limit for AI
      await new Promise(r => setTimeout(r, 200));
    }

    if (result && result.category) {
      const { error: updateError } = await supabase
        .from('contacts')
        .update({
          category: result.category,
          category_confidence: result.confidence,
          category_reason: result.reason,
        })
        .eq('id', contact.id);

      if (!updateError) {
        categorized[result.category] = (categorized[result.category] || 0) + 1;
        const emoji = { vc: '💼', angel: '👼', sales_prospect: '🎯', irrelevant: '➖' };
        console.log(`${emoji[result.category] || '?'} ${contact.full_name}: ${result.category}`);
        console.log(`   → ${result.reason}`);
      }
    }
  }

  console.log(`\n✅ CATEGORIZATION COMPLETE:`);
  console.log(`   Rule-based: ${ruleBased}`);
  console.log(`   AI-based: ${aiBased}`);
  console.log(`\n   Results:`);
  Object.entries(categorized).forEach(([cat, count]) => {
    if (count > 0) console.log(`   ${cat}: ${count}`);
  });

  // Final stats
  const { data: finalContacts } = await supabase
    .from('contacts')
    .select('category')
    .eq('team_id', TEAM_ID);

  const finalStats = { vc: 0, angel: 0, sales_prospect: 0, irrelevant: 0, uncategorized: 0 };
  finalContacts?.forEach(c => {
    finalStats[c.category || 'uncategorized'] = (finalStats[c.category || 'uncategorized'] || 0) + 1;
  });

  console.log(`\n📊 FINAL STATUS:`);
  Object.entries(finalStats).forEach(([cat, count]) => {
    const pct = Math.round((count / (finalContacts?.length || 1)) * 100);
    console.log(`   ${cat}: ${count} (${pct}%)`);
  });
}

main().catch(console.error);
