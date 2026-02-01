import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function testDatabase() {
  console.log('Testing Supabase connection...');
  console.log('URL:', supabaseUrl);
  console.log('Key exists:', !!serviceRoleKey);
  
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing environment variables!');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Check teams
  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('*');
  
  console.log('\n=== Teams ===');
  if (teamsError) console.error('Teams error:', teamsError);
  else console.log('Teams:', teams);

  // Check prospects
  const { data: prospects, error: prospectsError } = await supabase
    .from('prospects')
    .select('id, company_name, company_domain, funding_stage')
    .limit(5);
  
  console.log('\n=== Prospects ===');
  if (prospectsError) console.error('Prospects error:', prospectsError);
  else console.log('Prospects:', prospects?.length || 0, 'records');
  
  if (prospects) {
    prospects.forEach(p => console.log(`  - ${p.company_name} (${p.company_domain})`));
  }

  // Try inserting a test prospect
  console.log('\n=== Testing Insert ===');
  const teamId = teams?.[0]?.id;
  
  if (teamId) {
    const { data: inserted, error: insertError } = await supabase
      .from('prospects')
      .upsert({
        team_id: teamId,
        company_name: 'Test Company',
        company_domain: 'test-company.com',
        company_industry: 'Test',
        funding_stage: 'seed',
        source: 'test',
      }, { onConflict: 'team_id,company_domain' })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
    } else {
      console.log('Inserted:', inserted);
      
      // Clean up
      await supabase.from('prospects').delete().eq('company_domain', 'test-company.com');
      console.log('Cleaned up test record');
    }
  } else {
    console.log('No team found to test insert');
  }
}

testDatabase().catch(console.error);
