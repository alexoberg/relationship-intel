/**
 * Create the team_settings table for storing AI learnings
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
  console.log('Creating team_settings table...\n');

  const statements = [
    `CREATE TABLE IF NOT EXISTS public.team_settings (
      id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
      team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
      key text NOT NULL,
      value jsonb DEFAULT '{}',
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      UNIQUE(team_id, key)
    )`,

    `CREATE INDEX IF NOT EXISTS team_settings_team_id_idx ON public.team_settings(team_id)`,
    `CREATE INDEX IF NOT EXISTS team_settings_key_idx ON public.team_settings(key)`,

    `ALTER TABLE public.team_settings ENABLE ROW LEVEL SECURITY`,

    `DO $$ BEGIN
      CREATE POLICY "Team members can view settings" ON public.team_settings
        FOR SELECT USING (
          EXISTS (
            SELECT 1 FROM public.team_members
            WHERE team_members.team_id = team_settings.team_id
            AND team_members.user_id = auth.uid()
          )
        );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

    `DO $$ BEGIN
      CREATE POLICY "Team admins can manage settings" ON public.team_settings
        FOR ALL USING (
          EXISTS (
            SELECT 1 FROM public.team_members
            WHERE team_members.team_id = team_settings.team_id
            AND team_members.user_id = auth.uid()
            AND team_members.role = 'admin'
          )
        );
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

  console.log('\n✅ team_settings table created!');
}

main().catch(console.error);
