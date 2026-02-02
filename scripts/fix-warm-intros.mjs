#!/usr/bin/env node
/**
 * Comprehensive warm intro matching:
 * 1. Match by current company_domain (current employees)
 * 2. Match by job_history domain (alumni)
 * 3. Match by company name variations
 */
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

const TEAM_ID = 'aa2e0a01-03e4-419c-971a-0a80b187778f';

async function main() {
  console.log('=== Comprehensive Warm Intro Matching ===\n');

  // Get all prospects
  const { data: prospects } = await supabase.from('prospects')
    .select('id, company_name, company_domain')
    .eq('team_id', TEAM_ID);
  console.log(`Found ${prospects.length} prospects`);

  // Get all contacts with relevant data
  const { data: contacts } = await supabase.from('contacts')
    .select('id, full_name, current_company, company_domain, job_history, best_connector, connection_strength, linkedin_url, email')
    .eq('team_id', TEAM_ID);
  console.log(`Found ${contacts.length} contacts\n`);

  // Build lookup maps
  // 1. Current company domain -> contacts
  const currentDomainMap = new Map();
  // 2. Job history domain -> contacts
  const historyDomainMap = new Map();
  // 3. Company name (lowercase) -> contacts
  const companyNameMap = new Map();

  for (const c of contacts) {
    // Current domain
    if (c.company_domain) {
      const domain = c.company_domain.toLowerCase().replace(/^www\./, '');
      if (!currentDomainMap.has(domain)) currentDomainMap.set(domain, []);
      currentDomainMap.get(domain).push({ ...c, matchType: 'current_employee' });
    }

    // Current company name
    if (c.current_company) {
      const name = c.current_company.toLowerCase().trim();
      if (!companyNameMap.has(name)) companyNameMap.set(name, []);
      companyNameMap.get(name).push({ ...c, matchType: 'current_employee' });
    }

    // Job history
    for (const job of (c.job_history || [])) {
      if (job.domain) {
        const domain = job.domain.toLowerCase().replace(/^www\./, '');
        if (!historyDomainMap.has(domain)) historyDomainMap.set(domain, []);
        historyDomainMap.get(domain).push({ ...c, job, matchType: job.is_current ? 'current_employee' : 'alumni' });
      }
      if (job.company) {
        const name = job.company.toLowerCase().trim();
        if (!companyNameMap.has(name)) companyNameMap.set(name, []);
        companyNameMap.get(name).push({ ...c, job, matchType: job.is_current ? 'current_employee' : 'alumni' });
      }
    }
  }

  console.log(`Current domain map: ${currentDomainMap.size} domains`);
  console.log(`History domain map: ${historyDomainMap.size} domains`);
  console.log(`Company name map: ${companyNameMap.size} names\n`);

  // Clear existing connections
  const { error: deleteErr } = await supabase
    .from('prospect_connections')
    .delete()
    .eq('team_id', TEAM_ID);
  if (deleteErr) console.log('Delete error:', deleteErr.message);

  let totalConnections = 0;
  let prospectsWithConnections = 0;

  for (const prospect of prospects) {
    const matches = new Map(); // contact_id -> best match info

    const prospectDomain = prospect.company_domain?.toLowerCase().replace(/^www\./, '');
    const prospectName = prospect.company_name?.toLowerCase().trim();

    // 1. Match by current company_domain
    if (prospectDomain && currentDomainMap.has(prospectDomain)) {
      for (const m of currentDomainMap.get(prospectDomain)) {
        if (!matches.has(m.id) || m.matchType === 'current_employee') {
          matches.set(m.id, m);
        }
      }
    }

    // 2. Match by job history domain
    if (prospectDomain && historyDomainMap.has(prospectDomain)) {
      for (const m of historyDomainMap.get(prospectDomain)) {
        if (!matches.has(m.id)) {
          matches.set(m.id, m);
        }
      }
    }

    // 3. Match by company name
    if (prospectName && companyNameMap.has(prospectName)) {
      for (const m of companyNameMap.get(prospectName)) {
        if (!matches.has(m.id)) {
          matches.set(m.id, m);
        }
      }
    }

    // 4. Fuzzy name matching (first word if > 4 chars)
    if (prospectName) {
      const firstWord = prospectName.split(/\s+/)[0];
      if (firstWord.length > 4) {
        for (const [name, contactsList] of companyNameMap) {
          if (name.startsWith(firstWord) || firstWord.startsWith(name.split(/\s+/)[0])) {
            for (const m of contactsList) {
              if (!matches.has(m.id)) {
                matches.set(m.id, m);
              }
            }
          }
        }
      }
    }

    if (matches.size === 0) continue;
    prospectsWithConnections++;

    // Insert connections
    const insertData = [];
    for (const [contactId, m] of matches) {
      insertData.push({
        prospect_id: prospect.id,
        team_id: TEAM_ID,
        target_name: m.full_name,
        target_title: m.job?.title || m.current_company,
        target_linkedin_url: m.linkedin_url,
        target_email: m.email,
        connector_name: m.best_connector || 'Network',
        relationship_type: m.matchType,
        relationship_strength: Math.round((m.connection_strength || 0.5) * 100),
        connection_context: m.matchType === 'current_employee'
          ? `Currently works at ${prospect.company_name}`
          : `Previously worked at ${prospect.company_name}`,
      });
    }

    const { error: insertErr } = await supabase
      .from('prospect_connections')
      .insert(insertData);

    if (insertErr) {
      console.error(`Error for ${prospect.company_name}:`, insertErr.message);
    } else {
      totalConnections += insertData.length;
      if (insertData.length > 10) {
        console.log(`${prospect.company_name}: ${insertData.length} connections`);
      }
    }

    // Update prospect
    const currentCount = insertData.filter(d => d.relationship_type === 'current_employee').length;
    const alumniCount = insertData.filter(d => d.relationship_type === 'alumni').length;

    await supabase.from('prospects').update({
      has_warm_intro: true,
      connections_count: matches.size,
      best_connector: insertData[0]?.connector_name,
      connection_context: `${currentCount} current, ${alumniCount} alumni`,
    }).eq('id', prospect.id);
  }

  console.log('\n=== Summary ===');
  console.log(`Prospects with connections: ${prospectsWithConnections}`);
  console.log(`Total connections: ${totalConnections}`);

  // Verify the previously missing ones
  console.log('\n=== Verifying previously missing ===');
  const checkCompanies = ['X (Twitter)', 'Robinhood', 'Reddit', 'Affirm', 'Instagram'];
  for (const name of checkCompanies) {
    const { data: p } = await supabase.from('prospects')
      .select('company_name, has_warm_intro, connections_count')
      .ilike('company_name', `%${name.split(' ')[0]}%`)
      .eq('team_id', TEAM_ID)
      .limit(1);
    if (p?.[0]) {
      console.log(`${p[0].company_name}: ${p[0].has_warm_intro ? '✅' : '❌'} (${p[0].connections_count} connections)`);
    }
  }
}

main().catch(console.error);
