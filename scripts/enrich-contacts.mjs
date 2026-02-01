// PDL enrichment for prospect connections
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qqfqpjjquiktljofctby.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxZnFwampxdWlrdGxqb2ZjdGJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTcxODIzNCwiZXhwIjoyMDg1Mjk0MjM0fQ.SMjpxJ1heQlfjnw7QEQkMtrhz60lqE-KpglZmcV7nKA'
);

const PDL_API_KEY = '31beb02c03b1c83e7d9f0f502669901777faa0aca3e1d0fdad1d074409ea5e01';

async function enrichByLinkedIn(linkedinUrl) {
  const cleanUrl = linkedinUrl
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');

  const url = `https://api.peopledatalabs.com/v5/person/enrich?api_key=${PDL_API_KEY}&profile=https://${cleanUrl}`;

  const response = await fetch(url);
  if (!response.ok) {
    return { success: false, error: `${response.status}` };
  }

  const data = await response.json();
  return { success: true, person: data.data };
}

async function enrichByNameAndCompany(name, company) {
  const url = `https://api.peopledatalabs.com/v5/person/enrich?api_key=${PDL_API_KEY}&name=${encodeURIComponent(name)}&company=${encodeURIComponent(company)}`;

  const response = await fetch(url);
  if (!response.ok) {
    return { success: false, error: `${response.status}` };
  }

  const data = await response.json();
  return { success: true, person: data.data };
}

async function main() {
  // Get prospects with connections
  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, name, company_domain, all_connection_paths')
    .not('all_connection_paths', 'is', null)
    .gt('connection_score', 0);

  console.log(`Found ${prospects?.length || 0} prospects with connections\n`);

  let totalEnriched = 0;
  let totalEmails = 0;

  for (const prospect of prospects || []) {
    const paths = prospect.all_connection_paths || [];
    if (paths.length === 0) continue;

    console.log(`\n${prospect.name} (${prospect.company_domain})`);
    console.log(`  ${paths.length} connection paths to enrich`);

    for (const path of paths.slice(0, 3)) { // Top 3 per prospect
      const targetName = path.target;
      const targetLinkedIn = path.target_linkedin_url;

      let result;
      if (targetLinkedIn) {
        result = await enrichByLinkedIn(targetLinkedIn);
      } else {
        result = await enrichByNameAndCompany(targetName, prospect.name);
      }

      if (result.success && result.person) {
        const email = result.person.work_email || result.person.personal_emails?.[0];
        const phone = result.person.mobile_phone || result.person.phone_numbers?.[0];

        console.log(`  ✓ ${targetName}`);
        if (email) {
          console.log(`    Email: ${email}`);
          totalEmails++;
        }
        if (phone) {
          console.log(`    Phone: ${phone}`);
        }
        totalEnriched++;
      } else {
        console.log(`  ✗ ${targetName} - ${result.error || 'not found'}`);
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`\n========================================`);
  console.log(`Enriched: ${totalEnriched} contacts`);
  console.log(`Emails found: ${totalEmails}`);
}

main().catch(console.error);
