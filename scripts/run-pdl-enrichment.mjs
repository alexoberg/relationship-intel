#!/usr/bin/env node
// Run PDL enrichment on contacts
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
const TEAM_ID = 'aa2e0a01-03e4-419c-971a-0a80b187778f';

async function enrichByLinkedIn(linkedinUrl) {
  const response = await fetch('https://api.peopledatalabs.com/v5/person/enrich', {
    method: 'GET',
    headers: { 'X-Api-Key': PDL_API_KEY },
  }.url = `https://api.peopledatalabs.com/v5/person/enrich?profile=${encodeURIComponent(linkedinUrl)}`);
  
  const url = `https://api.peopledatalabs.com/v5/person/enrich?profile=${encodeURIComponent(linkedinUrl)}`;
  const res = await fetch(url, { headers: { 'X-Api-Key': PDL_API_KEY } });
  if (!res.ok) return null;
  return res.json();
}

async function enrichByEmail(email) {
  const url = `https://api.peopledatalabs.com/v5/person/enrich?email=${encodeURIComponent(email)}`;
  const res = await fetch(url, { headers: { 'X-Api-Key': PDL_API_KEY } });
  if (!res.ok) return null;
  return res.json();
}

async function main() {
  console.log('📧 PDL CONTACT ENRICHMENT\n');
  console.log(`PDL API Key: ${PDL_API_KEY ? '✅ Set' : '❌ Missing'}\n`);

  if (!PDL_API_KEY) {
    console.log('❌ No PDL API key configured. Set PDL_API_KEY in .env.local');
    return;
  }

  // Get unenriched contacts with email or linkedin
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, email, linkedin_url, full_name, current_company, current_title')
    .eq('team_id', TEAM_ID)
    .is('pdl_enriched_at', null)
    .or('email.neq.null,linkedin_url.neq.null')
    .order('connection_strength', { ascending: false })
    .limit(100); // Start with 100 to test

  if (error) {
    console.log(`❌ Error fetching contacts: ${error.message}`);
    return;
  }

  console.log(`Found ${contacts?.length || 0} unenriched contacts to process\n`);

  let enriched = 0, failed = 0;

  for (const contact of contacts || []) {
    try {
      let result = null;
      
      // Try LinkedIn first, then email
      if (contact.linkedin_url) {
        result = await enrichByLinkedIn(contact.linkedin_url);
      }
      if (!result && contact.email) {
        result = await enrichByEmail(contact.email);
      }

      if (result && result.data) {
        const person = result.data;
        await supabase.from('contacts').update({
          pdl_id: person.id,
          email: contact.email || person.work_email || person.personal_emails?.[0],
          current_title: person.job_title || contact.current_title,
          current_company: person.job_company_name || contact.current_company,
          linkedin_url: person.linkedin_url || contact.linkedin_url,
          pdl_enriched_at: new Date().toISOString(),
        }).eq('id', contact.id);
        
        enriched++;
        console.log(`✅ ${contact.full_name} - ${person.job_title} @ ${person.job_company_name}`);
      } else {
        // Mark as attempted even if not found
        await supabase.from('contacts').update({
          pdl_enriched_at: new Date().toISOString(),
        }).eq('id', contact.id);
        failed++;
      }

      // Rate limit (10 req/sec max for PDL)
      await new Promise(r => setTimeout(r, 150));
      
    } catch (err) {
      console.log(`❌ ${contact.full_name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 RESULTS: ${enriched} enriched, ${failed} not found`);
  
  // Show remaining
  const { count } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', TEAM_ID)
    .is('pdl_enriched_at', null);
  
  console.log(`📋 Remaining unenriched: ${count}`);
}

main().catch(console.error);
