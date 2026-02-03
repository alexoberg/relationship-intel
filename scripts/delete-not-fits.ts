// Script to delete prospects marked as not_a_fit
// Run with: npx tsx scripts/delete-not-fits.ts

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load env vars manually
const envContent = readFileSync('.env.local', 'utf-8');
const envVars: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    envVars[key.trim()] = valueParts.join('=').trim();
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteNotFits() {
  // First, count how many we'll delete
  const { data: notFits, error: countError } = await supabase
    .from('prospects')
    .select('id, company_name, helix_fit_reason')
    .eq('status', 'not_a_fit');

  if (countError) {
    console.error('Error fetching not_a_fit prospects:', countError);
    return;
  }

  console.log(`Found ${notFits?.length || 0} prospects marked as not_a_fit\n`);

  if (!notFits || notFits.length === 0) {
    console.log('Nothing to delete!');
    return;
  }

  // Show what we're deleting
  console.log('Will delete:');
  for (const p of notFits.slice(0, 20)) {
    console.log(`  - ${p.company_name}: ${p.helix_fit_reason?.substring(0, 50) || 'No reason'}...`);
  }
  if (notFits.length > 20) {
    console.log(`  ... and ${notFits.length - 20} more\n`);
  }

  // Delete the prospect_connections first (foreign key)
  const prospectIds = notFits.map(p => p.id);

  // Batch delete in chunks to avoid issues
  const BATCH_SIZE = 100;

  for (let i = 0; i < prospectIds.length; i += BATCH_SIZE) {
    const batch = prospectIds.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(prospectIds.length / BATCH_SIZE)}...`);

    // Clear listener_discoveries references
    await supabase
      .from('listener_discoveries')
      .update({ promoted_prospect_id: null })
      .in('promoted_prospect_id', batch);

    // Delete connections
    await supabase
      .from('prospect_connections')
      .delete()
      .in('prospect_id', batch);

    // Delete feedback
    await supabase
      .from('prospect_feedback')
      .delete()
      .in('prospect_id', batch);

    // Delete prospects
    const { error: deleteError } = await supabase
      .from('prospects')
      .delete()
      .in('id', batch);

    if (deleteError) {
      console.error(`Error deleting batch: ${deleteError.message}`);
    }
  }

  const deleteError = null; // Already handled above

  if (deleteError) {
    console.error('Error deleting prospects:', deleteError);
    return;
  }

  console.log(`\n✅ Deleted ${notFits.length} not_a_fit prospects`);

  // Show remaining count
  const { count } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true });

  console.log(`\nRemaining prospects: ${count}`);
}

deleteNotFits().catch(console.error);
