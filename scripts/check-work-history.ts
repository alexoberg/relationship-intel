import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

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

async function check() {
  console.log('=== Checking Work History Data ===\n');

  // Check work_history table
  const { count: workHistoryCount, error: whError } = await supabase
    .from('work_history')
    .select('*', { count: 'exact', head: true });

  console.log(`work_history table: ${workHistoryCount || 0} rows`);
  if (whError) console.log('Error:', whError.message);

  // Check contacts enrichment status
  const { count: totalContacts } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true });

  const { count: enrichedContacts } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('enriched', true);

  const { count: withPdl } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .not('pdl_id', 'is', null);

  const { count: withCompany } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .not('current_company', 'is', null);

  const { count: withTitle } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .not('current_title', 'is', null);

  const { count: withIndustry } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .not('current_company_industry', 'is', null);

  console.log(`\nContacts table:`);
  console.log(`  Total: ${totalContacts || 0}`);
  console.log(`  Enriched (flag): ${enrichedContacts || 0}`);
  console.log(`  With PDL ID: ${withPdl || 0}`);
  console.log(`  With current_company: ${withCompany || 0}`);
  console.log(`  With current_title: ${withTitle || 0}`);
  console.log(`  With industry: ${withIndustry || 0}`);

  // Check if there's any PDL data stored
  const { data: samplePdl } = await supabase
    .from('contacts')
    .select('id, full_name, pdl_id, current_company, current_title')
    .not('pdl_id', 'is', null)
    .limit(5);

  if (samplePdl && samplePdl.length > 0) {
    console.log('\nSample contacts with PDL data:');
    for (const c of samplePdl) {
      console.log(`  - ${c.full_name}: ${c.current_title} at ${c.current_company}`);
    }
  }

  // Check sample enriched contacts
  const { data: sampleEnriched } = await supabase
    .from('contacts')
    .select('id, full_name, current_company, current_title, enriched')
    .eq('enriched', true)
    .limit(5);

  if (sampleEnriched && sampleEnriched.length > 0) {
    console.log('\nSample enriched contacts:');
    for (const c of sampleEnriched) {
      console.log(`  - ${c.full_name}: ${c.current_title} at ${c.current_company}`);
    }
  }

  // Check sample work history
  const { data: sampleWorkHistory } = await supabase
    .from('work_history')
    .select('*, contacts!inner(full_name)')
    .limit(5);

  if (sampleWorkHistory && sampleWorkHistory.length > 0) {
    console.log('\nSample work history:');
    for (const wh of sampleWorkHistory) {
      console.log(`  - ${(wh as any).contacts?.full_name}: ${wh.title} at ${wh.company_name}`);
    }
  }
}

check().catch(console.error);
