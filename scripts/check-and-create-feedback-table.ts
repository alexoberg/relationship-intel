/**
 * Check if prospect_feedback table exists and create it if not
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log('Checking prospect_feedback table...\n');

  // Try to query the table
  const { data, error } = await supabase
    .from('prospect_feedback')
    .select('id')
    .limit(1);

  if (error) {
    if (error.code === '42P01' || error.message.includes('does not exist')) {
      console.log('❌ Table does not exist. Please run this SQL in Supabase Dashboard:\n');
      console.log(`
-- Create prospect_feedback table
CREATE TABLE public.prospect_feedback (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  prospect_id uuid REFERENCES public.prospects(id) ON DELETE CASCADE NOT NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) NOT NULL,
  is_good_fit boolean NOT NULL,
  confidence integer CHECK (confidence >= 1 AND confidence <= 5),
  feedback_reason text,
  ai_helix_fit_score integer,
  ai_helix_fit_reason text,
  ai_helix_products text[],
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  review_time_ms integer,
  UNIQUE(prospect_id, user_id)
);

-- Add review columns to prospects
ALTER TABLE public.prospects
ADD COLUMN IF NOT EXISTS user_fit_override boolean,
ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id);

-- Indexes
CREATE INDEX prospect_feedback_prospect_id_idx ON public.prospect_feedback(prospect_id);
CREATE INDEX prospect_feedback_team_id_idx ON public.prospect_feedback(team_id);
CREATE INDEX prospect_feedback_is_good_fit_idx ON public.prospect_feedback(is_good_fit);
CREATE INDEX prospects_reviewed_at_idx ON public.prospects(reviewed_at);

-- RLS
ALTER TABLE public.prospect_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view feedback" ON public.prospect_feedback
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = prospect_feedback.team_id
      AND team_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own feedback" ON public.prospect_feedback
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = prospect_feedback.team_id
      AND team_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own feedback" ON public.prospect_feedback
  FOR UPDATE USING (auth.uid() = user_id);
`);
    } else {
      console.log('Error:', error.message);
    }
  } else {
    console.log('✅ Table exists!');
    console.log(`Found ${data?.length || 0} feedback records`);

    // Check if review columns exist on prospects
    const { data: prospects, error: prospectError } = await supabase
      .from('prospects')
      .select('id, reviewed_at, user_fit_override')
      .limit(1);

    if (prospectError) {
      console.log('\n⚠️ Review columns may not exist on prospects table');
    } else {
      console.log('✅ Prospects table has review columns');
    }
  }

  // Summary
  const { count } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'not_a_fit');

  console.log(`\n📊 Active prospects to review: ${count}`);
}

main().catch(console.error);
