#!/usr/bin/env node
// Full Swarm ingestion script
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qqfqpjjquiktljofctby.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxZnFwampxdWlrdGxqb2ZjdGJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTcxODIzNCwiZXhwIjoyMDg1Mjk0MjM0fQ.SMjpxJ1heQlfjnw7QEQkMtrhz60lqE-KpglZmcV7nKA'
);

const SWARM_API_KEY = 'hCymY0oOwk8ta6YjCAR3W8A5ZFCUAzyri6YVtPV9';
const teamId = 'aa2e0a01-03e4-419c-971a-0a80b187778f';
const ownerId = '4cdff414-4475-49cf-a5ed-033f4efabde8';

async function ingest() {
  console.log('Starting Swarm ingestion...');
  
  let offset = 0;
  let ingested = 0, updated = 0, errors = 0;
  
  while (true) {
    const res = await fetch('https://bee.theswarm.com/v2/profiles/network-mapper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': SWARM_API_KEY },
      body: JSON.stringify({ query: { match_all: {} }, size: 100, from: offset }),
    });
    
    if (!res.ok) {
      console.error('API error:', res.status);
      break;
    }
    
    const data = await res.json();
    if (!data.items?.length) break;
    
    for (const item of data.items) {
      const p = item.profile;
      const strength = item.connections?.length > 0
        ? Math.max(...item.connections.map(c => c.connection_strength))
        : 0;
      
      let domain = null;
      if (p.current_company_website) {
        domain = p.current_company_website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      }
      
      const contactData = {
        owner_id: ownerId,
        team_id: teamId,
        swarm_profile_id: p.id,
        full_name: p.full_name,
        first_name: p.first_name || p.full_name?.split(' ')[0],
        last_name: p.last_name || p.full_name?.split(' ').slice(1).join(' '),
        email: p.work_email || null,
        linkedin_url: p.linkedin_url || null,
        current_title: p.current_title || null,
        current_company: p.current_company_name || null,
        company_domain: domain,
        source: 'swarm',
        connection_strength: strength,
        swarm_synced_at: new Date().toISOString(),
        enrichment_status: 'pending',
      };
      
      try {
        const { data: existing } = await supabase
          .from('contacts')
          .select('id')
          .eq('team_id', teamId)
          .eq('swarm_profile_id', p.id)
          .single();
        
        if (existing) {
          await supabase.from('contacts').update(contactData).eq('id', existing.id);
          updated++;
        } else {
          const { error } = await supabase.from('contacts').insert(contactData);
          if (error) errors++;
          else ingested++;
        }
      } catch (e) {
        errors++;
      }
    }
    
    offset += data.items.length;
    console.log(`Progress: ${offset}/${data.total_count} (new: ${ingested}, updated: ${updated}, errors: ${errors})`);
    
    if (offset >= data.total_count) break;
    await new Promise(r => setTimeout(r, 100));
  }
  
  console.log(`\nDone! New: ${ingested}, Updated: ${updated}, Errors: ${errors}`);
}

ingest().catch(console.error);
