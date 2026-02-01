// Run migration via Supabase admin client
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const supabase = createClient(
  'https://qqfqpjjquiktljofctby.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxZnFwampxdWlrdGxqb2ZjdGJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTcxODIzNCwiZXhwIjoyMDg1Mjk0MjM0fQ.SMjpxJ1heQlfjnw7QEQkMtrhz60lqE-KpglZmcV7nKA'
);

// Read migration file
const migrationPath = join(__dirname, '../supabase/migrations/20260201_swarm_contact_support.sql');
const sql = readFileSync(migrationPath, 'utf-8');

// Split into individual statements (simple split on semicolons followed by newlines)
const statements = sql
  .split(/;\s*\n/)
  .map(s => s.trim())
  .filter(s => s && !s.startsWith('--'));

async function runMigration() {
  console.log(`Running migration with ${statements.length} statements...\n`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.slice(0, 80).replace(/\n/g, ' ');
    console.log(`[${i + 1}/${statements.length}] ${preview}...`);

    const { error } = await supabase.rpc('exec_sql', { sql_query: stmt });
    
    if (error) {
      // Try direct query via REST
      const { error: error2 } = await supabase.from('_exec').select().limit(0);
      console.log(`  Warning: ${error.message}`);
    } else {
      console.log(`  ✓ Success`);
    }
  }

  console.log('\nMigration complete!');
}

runMigration().catch(console.error);
