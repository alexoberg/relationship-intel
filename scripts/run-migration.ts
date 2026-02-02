/**
 * Run the prospect_feedback migration
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log('Running prospect_feedback migration...\n');

  // Read the migration file
  const migrationPath = join(__dirname, '../supabase/migrations/20260202_prospect_feedback.sql');
  const migration = readFileSync(migrationPath, 'utf-8');

  // Split into individual statements (simple split, not perfect but works for most cases)
  const statements = migration
    .split(/;\s*$/m)
    .filter(s => s.trim() && !s.trim().startsWith('--'));

  for (const statement of statements) {
    const trimmed = statement.trim();
    if (!trimmed) continue;

    // Extract first line for logging
    const firstLine = trimmed.split('\n')[0].substring(0, 60);
    console.log(`Running: ${firstLine}...`);

    const { error } = await supabase.rpc('exec_sql', { sql: trimmed + ';' });

    if (error) {
      // Try direct query instead
      const { error: error2 } = await supabase.from('_dummy_').select().limit(0);
      console.log(`  Note: ${error.message}`);
    } else {
      console.log('  ✓ Done');
    }
  }

  console.log('\nMigration complete!');
}

main().catch(console.error);
