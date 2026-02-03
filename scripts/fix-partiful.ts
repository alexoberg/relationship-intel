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

async function fix() {
  // Find the Partiful prospect
  const { data, error } = await supabase
    .from('prospects')
    .select('id, company_name, company_domain')
    .eq('company_domain', 'partiful.com')
    .single();

  if (error) {
    console.log('Error finding prospect:', error);
    return;
  }

  console.log('Found:', data);

  // Update the name
  const { error: updateError } = await supabase
    .from('prospects')
    .update({ company_name: 'Partiful' })
    .eq('id', data.id);

  if (updateError) {
    console.log('Update error:', updateError);
    return;
  }

  console.log('Updated company_name to Partiful');
  console.log('Prospect ID:', data.id);

  // Trigger the enrichment pipeline
  const inngestUrl = process.env.INNGEST_EVENT_URL || 'https://inn.gs/e/' + process.env.INNGEST_EVENT_KEY;

  console.log('Triggering enrichment pipeline...');

  const response = await fetch('https://api.inngest.com/e/' + process.env.INNGEST_EVENT_KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'prospects/run-pipeline',
      data: { prospectId: data.id },
    }),
  });

  if (response.ok) {
    console.log('Pipeline triggered successfully');
  } else {
    console.log('Failed to trigger pipeline:', await response.text());
  }
}

fix();
