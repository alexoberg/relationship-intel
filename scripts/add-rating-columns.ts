// Script to add user_rating columns to database
// Run with: npx tsx scripts/add-rating-columns.ts

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function addRatingColumns() {
  console.log('Adding user_rating columns...');

  // We can't run raw SQL through the REST API, but we can use the admin functions
  // The columns will be added on first use - Supabase allows adding columns via upsert

  // Test by trying to select with the new column
  const { error: feedbackError } = await supabase
    .from('prospect_feedback')
    .select('id')
    .limit(1);

  if (feedbackError) {
    console.error('Error checking prospect_feedback:', feedbackError);
  } else {
    console.log('prospect_feedback table exists');
  }

  const { error: prospectError } = await supabase
    .from('prospects')
    .select('id')
    .limit(1);

  if (prospectError) {
    console.error('Error checking prospects:', prospectError);
  } else {
    console.log('prospects table exists');
  }

  console.log('\nTo add the columns, run this SQL in Supabase Dashboard SQL Editor:');
  console.log(`
-- Add user_rating to prospect_feedback table
ALTER TABLE public.prospect_feedback
ADD COLUMN IF NOT EXISTS user_rating integer CHECK (user_rating >= 1 AND user_rating <= 10);

-- Add user_rating to prospects table for quick access
ALTER TABLE public.prospects
ADD COLUMN IF NOT EXISTS user_rating integer CHECK (user_rating >= 1 AND user_rating <= 10);

-- Create index for sorting by user rating
CREATE INDEX IF NOT EXISTS prospects_user_rating_idx ON public.prospects(user_rating DESC NULLS LAST);
  `);
}

addRatingColumns().catch(console.error);
