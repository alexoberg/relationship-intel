#!/usr/bin/env node
// Smart prospect-contact matching with PDL work history
import { createClient } from '@supabase/supabase-js';
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

const TEAM_ID = 'aa2e0a01-03e4-419c-971a-0a80b187778f';

// Normalize company name for matching
function normalizeCompany(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[,.]|inc\b|llc\b|corp\b|ltd\b|co\b|company\b|the\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Normalize domain for matching
function normalizeDomain(domain) {
  if (!domain) return '';
  return domain.toLowerCase()
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}

// Check if two company names are similar enough
function companiesMatch(a, b) {
  const normA = normalizeCompany(a);
  const normB = normalizeCompany(b);
  if (!normA || !normB) return false;

  // Exact match after normalization
  if (normA === normB) return true;

  // One contains the other (for cases like "Alterra" vs "Alterra Mountain")
  if (normA.length >= 4 && normB.length >= 4) {
    if (normA.includes(normB) || normB.includes(normA)) return true;
  }

  return false;
}

async function main() {
  console.log('🧠 SMART PROSPECT-CONTACT MATCHING\n');
  console.log('Using: domain matching + company name + PDL work history\n');

  // Reset all connection data
  console.log('Resetting all connection scores...');
  await supabase.from('prospects').update({
    connection_score: 0,
    has_warm_intro: false,
    best_connector: null,
    connections_count: 0,
    connection_context: null,
  }).eq('team_id', TEAM_ID);

  // Clear existing prospect_connections
  await supabase.from('prospect_connections').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Get all prospects
  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, company_name, company_domain')
    .eq('team_id', TEAM_ID);

  console.log(`Processing ${prospects?.length || 0} prospects...\n`);

  // Get all contacts with PDL data
  const { data: allContacts } = await supabase
    .from('contacts')
    .select('id, full_name, current_title, current_company, company_domain, email, linkedin_url, connection_strength, pdl_data')
    .eq('team_id', TEAM_ID);

  console.log(`Loaded ${allContacts?.length || 0} contacts for matching\n`);

  let matchedProspects = 0;
  let totalConnections = 0;

  for (const prospect of prospects || []) {
    const matches = [];
    const normProspectDomain = normalizeDomain(prospect.company_domain);
    const normProspectName = normalizeCompany(prospect.company_name);

    for (const contact of allContacts || []) {
      let matchType = null;
      let matchCompany = null;
      let isCurrent = false;

      // 1. Domain match (current employer)
      if (normProspectDomain && normalizeDomain(contact.company_domain) === normProspectDomain) {
        matchType = 'current_employee';
        matchCompany = contact.current_company;
        isCurrent = true;
      }

      // 2. Company name match (current employer)
      else if (companiesMatch(prospect.company_name, contact.current_company)) {
        matchType = 'current_employee';
        matchCompany = contact.current_company;
        isCurrent = true;
      }

      // 3. PDL work history match (former employee)
      else if (contact.pdl_data?.experience?.length) {
        for (const job of contact.pdl_data.experience) {
          const jobDomain = job.company?.website?.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

          if (normProspectDomain && jobDomain && normalizeDomain(jobDomain) === normProspectDomain) {
            matchType = 'former_employee';
            matchCompany = job.company?.name || job.title?.organization;
            break;
          }

          if (companiesMatch(prospect.company_name, job.company?.name)) {
            matchType = 'former_employee';
            matchCompany = job.company?.name;
            break;
          }
        }
      }

      if (matchType) {
        matches.push({
          contact,
          matchType,
          matchCompany,
          isCurrent,
          strength: contact.connection_strength || 0,
        });
      }
    }

    if (matches.length === 0) continue;

    matchedProspects++;
    const currentEmployees = matches.filter(m => m.isCurrent).length;
    const alumni = matches.filter(m => !m.isCurrent).length;

    console.log(`✅ ${prospect.company_name}: ${currentEmployees} current + ${alumni} alumni = ${matches.length} total`);

    // Sort by: current employees first, then by connection strength
    matches.sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
      return b.strength - a.strength;
    });

    const best = matches[0];

    // Get connector info for best contact
    const { data: connInfo } = await supabase
      .from('contact_connections')
      .select('connector_name, connection_strength')
      .eq('contact_id', best.contact.id)
      .order('connection_strength', { ascending: false })
      .limit(1);

    // Calculate connection score
    // Current employees worth more than alumni
    const currentBonus = currentEmployees > 0 ? 20 : 0;
    const baseScore = Math.round((best.strength || 0) * 100);
    const connScore = Math.min(100, baseScore + currentBonus);

    // Create context string
    let context = '';
    if (currentEmployees > 0) {
      context = `${currentEmployees} current employee${currentEmployees > 1 ? 's' : ''}`;
    }
    if (alumni > 0) {
      context += context ? ` + ${alumni} alumni` : `${alumni} alumni`;
    }

    // Update prospect
    await supabase.from('prospects').update({
      connection_score: connScore,
      has_warm_intro: connScore >= 50,
      best_connector: connInfo?.[0]?.connector_name || best.contact.full_name,
      connections_count: matches.length,
      connection_context: context,
    }).eq('id', prospect.id);

    // Save individual connections (top 10)
    const topMatches = matches.slice(0, 10);
    for (const match of topMatches) {
      totalConnections++;
      await supabase.from('prospect_connections').insert({
        prospect_id: prospect.id,
        target_name: match.contact.full_name,
        target_title: match.contact.current_title,
        target_linkedin_url: match.contact.linkedin_url,
        target_email: match.contact.email,
        connector_name: connInfo?.[0]?.connector_name || 'Direct',
        connection_type: match.matchType,
        connection_strength: match.strength,
        shared_context: match.isCurrent ? 'Current employee' : `Former employee at ${match.matchCompany}`,
      });
    }
  }

  console.log(`\n✅ MATCHING COMPLETE:`);
  console.log(`   Prospects with connections: ${matchedProspects}`);
  console.log(`   Total connections saved: ${totalConnections}`);

  // Show top 15 by priority
  console.log('\n🏆 TOP 15 BY PRIORITY:');
  const { data: top } = await supabase
    .from('prospects')
    .select('company_name, priority_score, helix_fit_score, connection_score, connections_count, best_connector, connection_context')
    .eq('team_id', TEAM_ID)
    .order('priority_score', { ascending: false })
    .limit(15);

  top?.forEach((p, i) => {
    const warm = p.connection_score >= 50 ? '🤝' : '  ';
    console.log(`${i+1}. ${warm} ${p.company_name}`);
    console.log(`      Priority: ${p.priority_score} | Fit: ${p.helix_fit_score} | Conn: ${p.connection_score}`);
    console.log(`      ${p.connections_count} contacts (${p.connection_context}) via ${p.best_connector || 'n/a'}`);
  });
}

main().catch(console.error);
