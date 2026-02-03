import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

// Load .env.local manually
const envContent = fs.readFileSync('.env.local', 'utf-8');
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    process.env[key.trim()] = valueParts.join('=').trim();
  }
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

interface SwarmContact {
  profile: {
    id: string;
    full_name: string;
    current_title?: string;
    linkedin_url?: string;
    work_email?: string;
    current_company_name?: string;
    current_company_website?: string;
  };
  connections: Array<{
    connector_id: string;
    connector_name: string;
    connection_strength: number;
    connection_strength_normalized: number;
    sources: Array<{ origin: string }>;
  }>;
}

interface CSVContact {
  'First Name': string;
  'Last Name': string;
  'Current job title': string;
  'Current company': string;
  'Company url': string;
  'Company industry': string;
  'Company location': string;
  'Company size': string;
  'LinkedIn': string;
  'The Swarm': string;
  'Emails': string;
  'Location': string;
}

async function loadSwarmData(): Promise<SwarmContact[]> {
  const dataPath = path.join(process.cwd(), 'data', 'swarm-contacts.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  return data;
}

async function loadCSVData(): Promise<Map<string, CSVContact>> {
  const dataDir = path.join(process.cwd(), 'data');
  const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.csv'));

  const contactsByLinkedIn = new Map<string, CSVContact>();
  const contactsByEmail = new Map<string, CSVContact>();

  for (const file of files) {
    console.log(`Loading CSV: ${file}`);
    const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true }) as CSVContact[];

    for (const record of records) {
      if (record.LinkedIn) {
        contactsByLinkedIn.set(record.LinkedIn.toLowerCase(), record);
      }
      if (record.Emails) {
        // Split emails and add each one
        const emails = record.Emails.split(',').map(e => e.trim().toLowerCase());
        for (const email of emails) {
          if (email) contactsByEmail.set(email, record);
        }
      }
    }
  }

  console.log(`Loaded ${contactsByLinkedIn.size} contacts by LinkedIn, ${contactsByEmail.size} by email`);
  return contactsByLinkedIn;
}

async function restore() {
  console.log('=== Restoring Enriched Data ===\n');

  // Load backup data
  console.log('Loading backup data...');
  const swarmData = await loadSwarmData();
  const csvDataByLinkedIn = await loadCSVData();

  console.log(`Loaded ${swarmData.length} contacts from Swarm JSON`);

  // Create lookup maps from Swarm data
  const swarmByLinkedIn = new Map<string, SwarmContact>();
  const swarmByEmail = new Map<string, SwarmContact>();
  const swarmById = new Map<string, SwarmContact>();

  for (const contact of swarmData) {
    if (contact.profile.linkedin_url) {
      swarmByLinkedIn.set(contact.profile.linkedin_url.toLowerCase(), contact);
    }
    if (contact.profile.work_email) {
      swarmByEmail.set(contact.profile.work_email.toLowerCase(), contact);
    }
    if (contact.profile.id) {
      swarmById.set(contact.profile.id, contact);
    }
  }

  // Get all contacts from database
  console.log('\nFetching contacts from database...');
  const { data: dbContacts, error } = await supabase
    .from('contacts')
    .select('id, email, linkedin_url, full_name, current_title, current_company, current_company_industry, enriched, swarm_profile_id');

  if (error) {
    console.error('Error fetching contacts:', error);
    return;
  }

  console.log(`Found ${dbContacts?.length || 0} contacts in database`);

  // Stats
  let matchedByLinkedIn = 0;
  let matchedByEmail = 0;
  let matchedBySwarmId = 0;
  let updated = 0;
  let alreadyEnriched = 0;
  let noMatch = 0;

  // Process each database contact
  for (const dbContact of dbContacts || []) {
    let swarmContact: SwarmContact | undefined;
    let csvContact: CSVContact | undefined;
    let matchSource = '';

    // Try to match by swarm_profile_id first
    if (dbContact.swarm_profile_id) {
      swarmContact = swarmById.get(dbContact.swarm_profile_id);
      if (swarmContact) {
        matchedBySwarmId++;
        matchSource = 'swarm_id';
      }
    }

    // Try to match by LinkedIn URL
    if (!swarmContact && dbContact.linkedin_url) {
      const linkedInLower = dbContact.linkedin_url.toLowerCase();
      swarmContact = swarmByLinkedIn.get(linkedInLower);
      csvContact = csvDataByLinkedIn.get(linkedInLower);
      if (swarmContact || csvContact) {
        matchedByLinkedIn++;
        matchSource = 'linkedin';
      }
    }

    // Try to match by email
    if (!swarmContact && dbContact.email) {
      const emailLower = dbContact.email.toLowerCase();
      swarmContact = swarmByEmail.get(emailLower);
      if (swarmContact) {
        matchedByEmail++;
        matchSource = 'email';
      }
    }

    if (!swarmContact && !csvContact) {
      noMatch++;
      continue;
    }

    // Build update object
    const updates: Record<string, unknown> = {
      enriched: true,
      enriched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Update from Swarm data
    if (swarmContact) {
      if (swarmContact.profile.current_title && !dbContact.current_title) {
        updates.current_title = swarmContact.profile.current_title;
      }
      if (swarmContact.profile.current_company_name && !dbContact.current_company) {
        updates.current_company = swarmContact.profile.current_company_name;
      }
      if (swarmContact.profile.work_email && !dbContact.email) {
        updates.email = swarmContact.profile.work_email;
      }
      if (!dbContact.swarm_profile_id) {
        updates.swarm_profile_id = swarmContact.profile.id;
      }

      // Calculate connection strength from top connection
      if (swarmContact.connections && swarmContact.connections.length > 0) {
        const maxStrength = Math.max(...swarmContact.connections.map(c => c.connection_strength));
        updates.connection_strength = Math.round(maxStrength * 100);
      }
    }

    // Update from CSV data (has industry info)
    if (csvContact) {
      if (csvContact['Company industry'] && !dbContact.current_company_industry) {
        updates.current_company_industry = csvContact['Company industry'];
      }
      if (csvContact['Current job title'] && !dbContact.current_title) {
        updates.current_title = csvContact['Current job title'];
      }
      if (csvContact['Current company'] && !dbContact.current_company) {
        updates.current_company = csvContact['Current company'];
      }
    }

    // Only update if we have changes beyond just marking as enriched
    if (Object.keys(updates).length > 3 || !dbContact.enriched) {
      const { error: updateError } = await supabase
        .from('contacts')
        .update(updates)
        .eq('id', dbContact.id);

      if (updateError) {
        console.error(`Error updating ${dbContact.full_name}:`, updateError.message);
      } else {
        updated++;
        if (updated <= 10 || updated % 100 === 0) {
          console.log(`Updated ${dbContact.full_name} (${matchSource}): ${Object.keys(updates).filter(k => !['enriched', 'enriched_at', 'updated_at'].includes(k)).join(', ')}`);
        }
      }
    } else {
      alreadyEnriched++;
    }
  }

  console.log('\n=== Restore Complete ===');
  console.log(`Total contacts in DB: ${dbContacts?.length || 0}`);
  console.log(`Matched by Swarm ID: ${matchedBySwarmId}`);
  console.log(`Matched by LinkedIn: ${matchedByLinkedIn}`);
  console.log(`Matched by Email: ${matchedByEmail}`);
  console.log(`No match found: ${noMatch}`);
  console.log(`Updated: ${updated}`);
  console.log(`Already enriched (no changes): ${alreadyEnriched}`);
}

restore().catch(console.error);
