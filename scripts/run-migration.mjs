import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qqfqpjjquiktljofctby.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxZnFwampxdWlrdGxqb2ZjdGJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTcxODIzNCwiZXhwIjoyMDg1Mjk0MjM0fQ.SMjpxJ1heQlfjnw7QEQkMtrhz60lqE-KpglZmcV7nKA';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function runMigration() {
  console.log('Running migration...');
  
  // Check current columns
  const { data: columns, error: colError } = await supabase
    .rpc('get_columns', { table_name: 'prospects' })
    .single();
  
  if (colError) {
    console.log('Checking columns via test insert...');
  }

  // Try to rename 'name' to 'company_name' using raw SQL via rpc
  const alterStatements = [
    // First check if we need to rename columns
    `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='name') THEN ALTER TABLE public.prospects RENAME COLUMN name TO company_name; END IF; END $$;`,
    `DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prospects' AND column_name='domain') THEN ALTER TABLE public.prospects RENAME COLUMN domain TO company_domain; END IF; END $$;`,
    // Add missing columns
    `ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS company_industry text;`,
    `ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS funding_stage text;`,
    `ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';`,
    `ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS helix_fit_score integer DEFAULT 0;`,
    `ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS connection_score integer DEFAULT 0;`,
    `ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS has_warm_intro boolean DEFAULT false;`,
    `ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS status text DEFAULT 'new';`,
  ];

  // Unfortunately, supabase-js doesn't support raw SQL execution
  // We need to use the SQL editor in the dashboard or psql
  console.log('Cannot run raw SQL via supabase-js. Trying direct insert test...');
  
  // Test if the new columns exist
  const testData = {
    team_id: 'aa2e0a01-03e4-419c-971a-0a80b187778f',
    company_name: 'Test Co',
    company_domain: 'testco.com',
  };
  
  const { data, error } = await supabase
    .from('prospects')
    .insert(testData)
    .select()
    .single();
    
  if (error) {
    console.log('Insert error:', error.message);
    if (error.message.includes('company_name')) {
      console.log('\n>>> Column "company_name" does not exist. Need to run migration in Supabase SQL editor.');
    }
    if (error.message.includes('company_domain')) {
      console.log('\n>>> Column "company_domain" does not exist. Need to run migration in Supabase SQL editor.');
    }
  } else {
    console.log('Insert succeeded! Columns exist.');
    console.log('Inserted:', data);
    // Clean up
    await supabase.from('prospects').delete().eq('company_domain', 'testco.com');
    console.log('Cleaned up test record.');
  }
}

runMigration().catch(console.error);
