/**
 * Create the prospect_feedback table using Supabase Management API
 */

const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'qqfqpjjquiktljofctby';

async function executeSql(sql: string) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SQL failed: ${response.status} - ${text}`);
  }

  return response.json();
}

async function main() {
  console.log('Creating prospect_feedback table...\n');

  const statements = [
    // Create table
    `CREATE TABLE IF NOT EXISTS public.prospect_feedback (
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
    )`,

    // Add columns to prospects
    `ALTER TABLE public.prospects
     ADD COLUMN IF NOT EXISTS user_fit_override boolean,
     ADD COLUMN IF NOT EXISTS reviewed_at timestamp with time zone,
     ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.profiles(id)`,

    // Indexes
    `CREATE INDEX IF NOT EXISTS prospect_feedback_prospect_id_idx ON public.prospect_feedback(prospect_id)`,
    `CREATE INDEX IF NOT EXISTS prospect_feedback_team_id_idx ON public.prospect_feedback(team_id)`,
    `CREATE INDEX IF NOT EXISTS prospect_feedback_is_good_fit_idx ON public.prospect_feedback(is_good_fit)`,
    `CREATE INDEX IF NOT EXISTS prospects_reviewed_at_idx ON public.prospects(reviewed_at)`,

    // Enable RLS
    `ALTER TABLE public.prospect_feedback ENABLE ROW LEVEL SECURITY`,

    // RLS policies
    `DO $$ BEGIN
      CREATE POLICY "Team members can view feedback" ON public.prospect_feedback
        FOR SELECT USING (
          EXISTS (
            SELECT 1 FROM public.team_members
            WHERE team_members.team_id = prospect_feedback.team_id
            AND team_members.user_id = auth.uid()
          )
        );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

    `DO $$ BEGIN
      CREATE POLICY "Users can insert own feedback" ON public.prospect_feedback
        FOR INSERT WITH CHECK (
          auth.uid() = user_id
          AND EXISTS (
            SELECT 1 FROM public.team_members
            WHERE team_members.team_id = prospect_feedback.team_id
            AND team_members.user_id = auth.uid()
          )
        );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

    `DO $$ BEGIN
      CREATE POLICY "Users can update own feedback" ON public.prospect_feedback
        FOR UPDATE USING (auth.uid() = user_id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

    `DO $$ BEGIN
      CREATE POLICY "Users can delete own feedback" ON public.prospect_feedback
        FOR DELETE USING (auth.uid() = user_id);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  ];

  for (const sql of statements) {
    try {
      console.log(`Running: ${sql.substring(0, 50).replace(/\n/g, ' ')}...`);
      await executeSql(sql);
      console.log('  ✓ Done');
    } catch (error) {
      console.log(`  ⚠️ ${error}`);
    }
  }

  console.log('\n✅ Migration complete!');
}

main().catch(console.error);
