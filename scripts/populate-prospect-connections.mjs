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
  console.log('=== Populating Prospect Connections from Work History ===\n');

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
    .select('id, full_name, current_title, current_company, linkedin_url, email, job_history, best_connector, connection_strength')
    .eq('team_id', TEAM_ID)
    .not('job_history', 'is', null);

  if (cErr) throw cErr;
  console.log(`Found ${contacts.length} contacts with job_history\n`);

  // Build index: company_name (lowercase) -> contacts
  const companyToContacts = new Map();

  for (const contact of contacts) {
    const jobHistory = contact.job_history || [];

    // Index by current company
    if (contact.current_company) {
      const key = contact.current_company.toLowerCase().trim();
      if (!companyToContacts.has(key)) companyToContacts.set(key, []);
      companyToContacts.get(key).push({
        contact,
        is_current: true,
        job_title: contact.current_title,
      });
    }

    // Index by past companies from job_history
    for (const job of jobHistory) {
      if (job.company) {
        const key = job.company.toLowerCase().trim();
        if (!companyToContacts.has(key)) companyToContacts.set(key, []);
        companyToContacts.get(key).push({
          contact,
          is_current: job.is_current || false,
          job_title: job.title,
        });
      }
    }
  }

  console.log(`Indexed ${companyToContacts.size} unique company names\n`);

  // Clear existing connections
  await supabase.from('prospect_connections').delete().eq('prospect_id', prospects[0]?.id || '').neq('prospect_id', 'x');
  console.log('Cleared existing connections\n');

  // Match prospects to contacts
  let totalConnections = 0;
  let prospectsWithConnections = 0;

  for (const prospect of prospects) {
    const prospectName = prospect.company_name.toLowerCase().trim();
    const connections = [];

    // Direct name match
    if (companyToContacts.has(prospectName)) {
      for (const entry of companyToContacts.get(prospectName)) {
        connections.push(entry);
      }
    }

    // Fuzzy matching: check if prospect name contains or is contained in indexed company names
    for (const [companyKey, entries] of companyToContacts) {
      if (companyKey === prospectName) continue; // Already matched

      // Match variations like "Google" vs "Google LLC" or "Meta" vs "Meta Platforms"
      const prospectWords = prospectName.split(/\s+/);
      const companyWords = companyKey.split(/\s+/);

      // If the first word matches and it's significant (>3 chars)
      if (prospectWords[0].length > 3 && companyWords[0].length > 3 &&
          prospectWords[0] === companyWords[0]) {
        for (const entry of entries) {
          if (!connections.find(c => c.contact.id === entry.contact.id)) {
            connections.push(entry);
          }
        }
      }
    }

    if (connections.length === 0) continue;

    prospectsWithConnections++;

    // Dedupe by contact id
    const uniqueContacts = new Map();
    for (const conn of connections) {
      if (!uniqueContacts.has(conn.contact.id)) {
        uniqueContacts.set(conn.contact.id, conn);
      }
    }

    // Insert connections
    const insertData = [];
    for (const [contactId, conn] of uniqueContacts) {
      insertData.push({
        prospect_id: prospect.id,
        team_id: TEAM_ID,
        target_name: conn.contact.full_name,
        target_title: conn.job_title || conn.contact.current_title,
        target_linkedin_url: conn.contact.linkedin_url,
        target_email: conn.contact.email,
        connector_name: conn.contact.best_connector || 'Network',
        relationship_type: conn.is_current ? 'current_employee' : 'alumni',
        relationship_strength: Math.round((conn.contact.connection_strength || 0.5) * 100),
        connection_context: conn.is_current
          ? `Currently works at ${prospect.company_name}`
          : `Previously worked at ${prospect.company_name}`,
      });
    }

    if (insertData.length > 0) {
      const { error: insertErr } = await supabase
        .from('prospect_connections')
        .insert(insertData);

      if (insertErr) {
        console.error(`Error inserting connections for ${prospect.company_name}:`, insertErr.message);
      } else {
        totalConnections += insertData.length;
        console.log(`${prospect.company_name}: ${insertData.length} connections`);
      }
    }

    // Update prospect with connection count
    await supabase
      .from('prospects')
      .update({
        has_warm_intro: true,
        connections_count: uniqueContacts.size,
        best_connector: insertData[0]?.connector_name,
      })
      .eq('id', prospect.id);
  }

  console.log('\n=== Summary ===');
  console.log(`Prospects with connections: ${prospectsWithConnections}`);
  console.log(`Total connections inserted: ${totalConnections}`);
}

main().catch(console.error);
