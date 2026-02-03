// Script to sync feedback data to prospects table
// Fixes the bug where prospect updates were failing silently due to priority_score being a generated column
// Run with: npx tsx scripts/sync-feedback-to-prospects.ts

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// Read env file manually
const envContent = fs.readFileSync('.env.local', 'utf-8');
const envLines = envContent.split('\n');
let supabaseUrl = '';
let supabaseKey = '';

for (const line of envLines) {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
    supabaseUrl = line.split('=')[1].trim();
  }
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
    supabaseKey = line.split('=')[1].trim();
  }
}

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncFeedbackToProspects() {
  console.log('Fetching all feedback entries...\n');

  // Get all feedback entries
  const { data: feedbackEntries, error: feedbackError } = await supabase
    .from('prospect_feedback')
    .select('prospect_id, is_good_fit, user_rating, user_id, created_at, feedback_reason');

  if (feedbackError) {
    console.error('Error fetching feedback:', feedbackError);
    return;
  }

  console.log(`Found ${feedbackEntries.length} feedback entries\n`);

  let synced = 0;
  let alreadySynced = 0;
  let errors = 0;

  for (const feedback of feedbackEntries) {
    // Check current prospect state
    const { data: prospect, error: prospectError } = await supabase
      .from('prospects')
      .select('id, company_name, reviewed_at, user_fit_override, user_rating, status')
      .eq('id', feedback.prospect_id)
      .single();

    if (prospectError || !prospect) {
      console.log(`⚠️ Prospect not found: ${feedback.prospect_id}`);
      errors++;
      continue;
    }

    // Check if already properly synced
    if (prospect.reviewed_at && prospect.user_fit_override === feedback.is_good_fit) {
      alreadySynced++;
      continue;
    }

    // Build update object (without priority_score - it's generated)
    const updates: Record<string, unknown> = {
      user_fit_override: feedback.is_good_fit,
      reviewed_at: feedback.created_at,
      reviewed_by: feedback.user_id,
      user_rating: feedback.user_rating,
      is_good_fit: feedback.is_good_fit,
      feedback_notes: feedback.feedback_reason,
      feedback_by: feedback.user_id,
      feedback_at: feedback.created_at,
    };

    // Update status if needed
    if (!feedback.is_good_fit && prospect.status === 'new') {
      updates.status = 'not_a_fit';
    } else if (feedback.is_good_fit && prospect.status === 'not_a_fit') {
      updates.status = 'new';
    }

    // Update prospect
    const { error: updateError } = await supabase
      .from('prospects')
      .update(updates)
      .eq('id', feedback.prospect_id);

    if (updateError) {
      console.log(`❌ Error updating ${prospect.company_name}: ${updateError.message}`);
      errors++;
    } else {
      console.log(`✓ Synced: ${prospect.company_name} (rating: ${feedback.user_rating}, good_fit: ${feedback.is_good_fit})`);
      synced++;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Total feedback entries: ${feedbackEntries.length}`);
  console.log(`Already synced: ${alreadySynced}`);
  console.log(`Newly synced: ${synced}`);
  console.log(`Errors: ${errors}`);
}

syncFeedbackToProspects().catch(console.error);
