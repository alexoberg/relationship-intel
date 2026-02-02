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

async function main() {
  console.log('=== Smart Prospect Matching with Work History ===\n');

  // Get all prospects
  const { data: prospects, error: pErr } = await supabase
    .from('prospects')
    .select('id, company_name, company_domain')
    .eq('team_id', TEAM_ID);

  if (pErr) throw pErr;
  console.log(`Found ${prospects.length} prospects`);

  // Get all contacts with job_history
  const { data: contacts, error: cErr } = await supabase
    .from('contacts')
    .select('id, full_name, current_company, job_history, best_connector, connection_strength')
    .eq('team_id', TEAM_ID)
    .not('job_history', 'is', null);

  if (cErr) throw cErr;
  console.log(`Found ${contacts.length} contacts with job_history\n`);

  // Build a map of all company names from work history
  const contactCompanies = new Map(); // company_name -> [{contact_id, contact_name, is_current, title, connectors}]

  for (const contact of contacts) {
    const jobHistory = contact.job_history || [];

    for (const job of jobHistory) {
      const companyName = job.company?.toLowerCase()?.trim();
      if (!companyName) continue;

      if (!contactCompanies.has(companyName)) {
        contactCompanies.set(companyName, []);
      }
      contactCompanies.get(companyName).push({
        contact_id: contact.id,
        contact_name: contact.full_name,
        is_current: job.is_current,
        title: job.title,
        best_connector: contact.best_connector,
        connection_strength: contact.connection_strength,
      });
    }
  }

  console.log(`Found ${contactCompanies.size} unique company names in work history\n`);

  // Build prospect company name list for AI matching
  const prospectCompanyList = prospects.map(p => ({
    id: p.id,
    name: p.company_name,
    domain: p.company_domain,
  }));

  // Get unique company names from contacts (for AI batch processing)
  const uniqueContactCompanies = Array.from(contactCompanies.keys());

  console.log('Using AI to match company names...\n');

  // Process in batches of 50 contact companies at a time
  const BATCH_SIZE = 50;
  const matches = []; // {prospect_id, contact_ids[], company_name}

  for (let i = 0; i < uniqueContactCompanies.length; i += BATCH_SIZE) {
    const batch = uniqueContactCompanies.slice(i, i + BATCH_SIZE);

    const prompt = `Match company names from work history to prospect companies.

PROSPECT COMPANIES:
${JSON.stringify(prospectCompanyList.map(p => p.name), null, 2)}

WORK HISTORY COMPANIES TO MATCH:
${JSON.stringify(batch, null, 2)}

For each work history company, find if it matches any prospect company (same company, different name format).
Examples of matches:
- "Salesforce" matches "Salesforce, Inc."
- "Google" matches "Google LLC"
- "Meta" matches "Facebook" (same company)

Return ONLY valid JSON:
{
  "matches": [
    {"work_company": "company name from work history", "prospect_company": "matching prospect name or null if no match"}
  ]
}

Only include actual matches. If no prospects match, return empty matches array.`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        for (const m of result.matches || []) {
          if (m.prospect_company) {
            const prospect = prospects.find(p =>
              p.company_name.toLowerCase() === m.prospect_company.toLowerCase()
            );
            if (prospect) {
              const contactsAtCompany = contactCompanies.get(m.work_company) || [];
              matches.push({
                prospect_id: prospect.id,
                prospect_name: prospect.company_name,
                work_company: m.work_company,
                contacts: contactsAtCompany,
              });
            }
          }
        }
      }

      console.log(`Processed ${Math.min(i + BATCH_SIZE, uniqueContactCompanies.length)}/${uniqueContactCompanies.length} companies...`);
      await new Promise(r => setTimeout(r, 500));

    } catch (err) {
      console.error(`Batch error:`, err.message);
    }
  }

  console.log(`\nFound ${matches.length} prospect-company matches from work history\n`);

  // Aggregate by prospect
  const prospectMatches = new Map(); // prospect_id -> {contacts: Set, connections}

  for (const match of matches) {
    if (!prospectMatches.has(match.prospect_id)) {
      prospectMatches.set(match.prospect_id, {
        prospect_name: match.prospect_name,
        contacts: new Map(),
      });
    }
    const pm = prospectMatches.get(match.prospect_id);
    for (const c of match.contacts) {
      if (!pm.contacts.has(c.contact_id)) {
        pm.contacts.set(c.contact_id, c);
      }
    }
  }

  console.log('=== Prospects with Warm Intros (from work history) ===\n');

  let updatedCount = 0;
  for (const [prospectId, data] of prospectMatches) {
    const contactList = Array.from(data.contacts.values());
    const currentEmployees = contactList.filter(c => c.is_current);
    const alumni = contactList.filter(c => !c.is_current);

    console.log(`${data.prospect_name}:`);
    console.log(`  ${currentEmployees.length} current employees, ${alumni.length} alumni`);

    // Find best connector
    let bestConnector = null;
    let bestStrength = 0;
    for (const c of contactList) {
      if (c.connection_strength && c.connection_strength > bestStrength) {
        bestStrength = c.connection_strength;
        bestConnector = c.best_connector || c.contact_name;
      }
    }

    // Update prospect
    const { error: updateErr } = await supabase
      .from('prospects')
      .update({
        has_warm_intro: true,
        connections_count: contactList.length,
        best_connector: bestConnector,
      })
      .eq('id', prospectId);

    if (!updateErr) updatedCount++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`Prospects with warm intros: ${prospectMatches.size}`);
  console.log(`Updated in database: ${updatedCount}`);
}

main().catch(console.error);
