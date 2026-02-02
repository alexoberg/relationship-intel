#!/usr/bin/env node
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

const PDL_API_KEY = process.env.PDL_API_KEY;
const TEAM_ID = 'aa2e0a01-03e4-419c-971a-0a80b187778f';
const OWNER_ID = '4cdff414-4475-49cf-a5ed-033f4efabde8';

async function enrichContact(contact) {
  const params = new URLSearchParams();
  if (contact.linkedin_url) {
    params.append('profile', contact.linkedin_url);
  } else if (contact.email) {
    params.append('email', contact.email);
  } else {
    return null;
  }

  const res = await fetch(`https://api.peopledatalabs.com/v5/person/enrich?${params}`, {
    headers: { 'X-Api-Key': PDL_API_KEY }
  });

  if (res.status === 404) return { notFound: true };
  if (res.status === 402) throw new Error('CREDITS_EXHAUSTED');
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error(`PDL_ERROR_${res.status}`);
  
  const data = await res.json();
  if (!data.data) return { notFound: true };
  
  const p = data.data;
  
  // Extract work history
  const jobHistory = (p.experience || []).map(exp => ({
    title: exp.title?.name,
    company: exp.company?.name,
    domain: exp.company?.website,
    start_date: exp.start_date,
    end_date: exp.end_date,
    is_current: !exp.end_date,
  }));

  return {
    full_name: p.full_name || contact.full_name,
    current_title: p.job_title || contact.current_title,
    current_company: p.job_company_name || contact.current_company,
    company_domain: p.job_company_website?.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || contact.company_domain,
    location: p.location_name || contact.location,
    job_history: jobHistory,
    pdl_data: p,
    pdl_enriched_at: new Date().toISOString(),
  };
}

async function main() {
  console.log('🔍 PDL ENRICHMENT - FULL RUN\n');

  // Get contacts needing enrichment
  let contacts = [], page = 0;
  while (true) {
    const { data } = await supabase.from('contacts')
      .select('id, full_name, email, linkedin_url, current_title, current_company, company_domain, location')
      .eq('team_id', TEAM_ID)
      .eq('owner_id', OWNER_ID)
      .is('pdl_enriched_at', null)
      .range(page * 500, (page + 1) * 500 - 1);
    if (!data || data.length === 0) break;
    contacts.push(...data);
    page++;
    if (data.length < 500) break;
  }

  // Filter to those with linkedin or email
  contacts = contacts.filter(c => c.linkedin_url || c.email);
  console.log(`Contacts to enrich: ${contacts.length}\n`);

  let enriched = 0, notFound = 0, errors = 0;

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    
    try {
      const data = await enrichContact(c);
      
      if (data?.notFound) {
        // Mark as attempted but not found
        await supabase.from('contacts').update({ 
          pdl_enriched_at: new Date().toISOString() 
        }).eq('id', c.id);
        notFound++;
      } else if (data) {
        await supabase.from('contacts').update(data).eq('id', c.id);
        enriched++;
      }
    } catch (e) {
      if (e.message === 'CREDITS_EXHAUSTED') {
        console.log('\n❌ PDL CREDITS EXHAUSTED - stopping');
        break;
      }
      if (e.message === 'RATE_LIMITED') {
        console.log('\nRate limited - waiting 60s...');
        await new Promise(r => setTimeout(r, 60000));
        i--; // Retry
        continue;
      }
      errors++;
    }

    if ((i + 1) % 50 === 0) {
      console.log(`${i + 1}/${contacts.length} | ✅ ${enriched} | ⏭️ ${notFound} | ❌ ${errors}`);
    }

    // Rate limit: ~5 req/sec to be safe
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n✅ DONE: ${enriched} enriched, ${notFound} not found, ${errors} errors`);

  // Final stats
  const { count: withDomain } = await supabase.from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', TEAM_ID)
    .eq('owner_id', OWNER_ID)
    .not('company_domain', 'is', null);
  console.log(`Contacts with company_domain now: ${withDomain}`);
}

main().catch(console.error);
