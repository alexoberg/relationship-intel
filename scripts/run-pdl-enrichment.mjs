#!/usr/bin/env node
// Run PDL enrichment on contacts - uses correct API format
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

const PDL_API_KEY = process.env.PDL_API_KEY;
const PDL_API_URL = 'https://api.peopledatalabs.com/v5/person/enrich';
const TEAM_ID = 'aa2e0a01-03e4-419c-971a-0a80b187778f';

function normalizeLinkedInUrl(url) {
  if (!url) return url;
  let clean = url.replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (!clean.startsWith('linkedin.com')) {
    clean = `linkedin.com/in/${clean}`;
  }
  clean = clean.replace(/\/$/, '');
  return `https://${clean}`;
}

async function enrichPerson(params) {
  const queryParams = new URLSearchParams({ ...params, api_key: PDL_API_KEY });
  const response = await fetch(`${PDL_API_URL}?${queryParams}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (response.status === 404) return { success: false, error: 'Not found' };
  if (response.status === 402) return { success: false, error: 'Credits exhausted' };
  if (!response.ok) return { success: false, error: `API error: ${response.status}` };

  const data = await response.json();
  return { success: true, person: data.data || data };
}

async function main() {
  console.log('📧 PDL CONTACT ENRICHMENT\n');
  console.log(`PDL API Key: ${PDL_API_KEY ? '✅ Set' : '❌ Missing'}\n`);

  if (!PDL_API_KEY) {
    console.log('❌ No PDL API key. Set PDL_API_KEY in .env.local');
    return;
  }

  // Test API first
  console.log('Testing PDL API...');
  const testResult = await enrichPerson({ email: 'sean@peopledatalabs.com' });
  if (!testResult.success) {
    console.log(`❌ PDL API test failed: ${testResult.error}`);
    return;
  }
  console.log('✅ PDL API working\n');

  // Get unenriched contacts with linkedin or email
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, email, linkedin_url, full_name, current_company, current_title')
    .eq('team_id', TEAM_ID)
    .is('pdl_enriched_at', null)
    .order('connection_strength', { ascending: false })
    .limit(50); // Start with 50

  if (error) {
    console.log(`❌ Error: ${error.message}`);
    return;
  }

  console.log(`Found ${contacts?.length || 0} contacts to enrich\n`);

  let enriched = 0, notFound = 0, errors = 0;

  for (const contact of contacts || []) {
    try {
      let result = null;

      // Try LinkedIn first
      if (contact.linkedin_url) {
        const cleanUrl = normalizeLinkedInUrl(contact.linkedin_url);
        result = await enrichPerson({ profile: cleanUrl });
      }
      
      // Fallback to email
      if (!result?.success && contact.email) {
        result = await enrichPerson({ email: contact.email });
      }

      if (result?.success && result.person) {
        const p = result.person;
        await supabase.from('contacts').update({
          pdl_id: p.id,
          email: contact.email || p.work_email || p.personal_emails?.[0],
          current_title: p.job_title || contact.current_title,
          current_company: p.job_company_name || contact.current_company,
          linkedin_url: p.linkedin_url || contact.linkedin_url,
          pdl_enriched_at: new Date().toISOString(),
        }).eq('id', contact.id);

        enriched++;
        console.log(`✅ ${contact.full_name} → ${p.job_title} @ ${p.job_company_name}`);
      } else {
        await supabase.from('contacts').update({
          pdl_enriched_at: new Date().toISOString(),
        }).eq('id', contact.id);
        notFound++;
      }

      // Rate limit (10/sec for PDL)
      await new Promise(r => setTimeout(r, 120));

    } catch (err) {
      console.log(`❌ ${contact.full_name}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n📊 RESULTS:`);
  console.log(`   Enriched: ${enriched}`);
  console.log(`   Not found: ${notFound}`);
  console.log(`   Errors: ${errors}`);

  const { count } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', TEAM_ID)
    .is('pdl_enriched_at', null);

  console.log(`\n📋 Remaining: ${count} unenriched contacts`);
}

main().catch(console.error);
