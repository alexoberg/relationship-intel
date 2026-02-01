// Check schema and apply migration where possible
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qqfqpjjquiktljofctby.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxZnFwampxdWlrdGxqb2ZjdGJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTcxODIzNCwiZXhwIjoyMDg1Mjk0MjM0fQ.SMjpxJ1heQlfjnw7QEQkMtrhz60lqE-KpglZmcV7nKA'
);

async function checkSchema() {
  console.log('Checking current database schema...\n');

  // Test contacts table
  const { data: contactsSample, error: contactsError } = await supabase
    .from('contacts')
    .select('*')
    .limit(1);

  if (contactsError) {
    console.log('❌ Cannot access contacts table:', contactsError.message);
  } else {
    console.log('✓ Contacts table accessible');
    if (contactsSample && contactsSample[0]) {
      const cols = Object.keys(contactsSample[0]);
      console.log('  Existing columns:', cols.join(', '));
      
      // Check for new columns
      const newCols = ['team_id', 'swarm_profile_id', 'company_domain', 'swarm_synced_at', 'pdl_enriched_at', 'connection_strength'];
      const missing = newCols.filter(c => !cols.includes(c));
      if (missing.length > 0) {
        console.log('  ⚠️  Missing columns:', missing.join(', '));
      } else {
        console.log('  ✓ All Swarm columns present');
      }
    } else {
      console.log('  (no data to check columns)');
    }
  }

  // Test contact_connections table
  const { data: connSample, error: connError } = await supabase
    .from('contact_connections')
    .select('*')
    .limit(1);

  if (connError) {
    if (connError.message.includes('does not exist')) {
      console.log('❌ contact_connections table does not exist (needs migration)');
    } else {
      console.log('❌ contact_connections error:', connError.message);
    }
  } else {
    console.log('✓ contact_connections table exists');
  }

  // Test teams table
  const { data: teamsSample, error: teamsError } = await supabase
    .from('teams')
    .select('id')
    .limit(1);

  if (teamsError) {
    console.log('❌ Teams table error:', teamsError.message);
  } else {
    console.log('✓ Teams table accessible');
    if (teamsSample && teamsSample[0]) {
      console.log('  Sample team_id:', teamsSample[0].id);
    }
  }

  // Test team_members
  const { data: membersSample, error: membersError } = await supabase
    .from('team_members')
    .select('team_id, user_id')
    .limit(1);

  if (membersError) {
    console.log('❌ team_members error:', membersError.message);
  } else {
    console.log('✓ team_members table accessible');
  }

  // Test prospects
  const { data: prospectsSample, error: prospectsError } = await supabase
    .from('prospects')
    .select('id, name, company_domain')
    .limit(3);

  if (prospectsError) {
    console.log('❌ prospects error:', prospectsError.message);
  } else {
    console.log('✓ prospects table accessible');
    console.log(`  ${prospectsSample?.length || 0} prospects found`);
  }

  console.log('\n========================================');
  console.log('MIGRATION INSTRUCTIONS:');
  console.log('========================================');
  console.log('To apply the migration, go to your Supabase dashboard:');
  console.log('https://supabase.com/dashboard/project/qqfqpjjquiktljofctby/sql');
  console.log('\nThen paste and run the contents of:');
  console.log('supabase/migrations/20260201_swarm_contact_support.sql');
  console.log('\nOR run: supabase login');
  console.log('Then: supabase link --project-ref qqfqpjjquiktljofctby');
  console.log('Then: supabase db push');
}

checkSchema().catch(console.error);
