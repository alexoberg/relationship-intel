import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://qqfqpjjquiktljofctby.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxZnFwampxdWlrdGxqb2ZjdGJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTcxODIzNCwiZXhwIjoyMDg1Mjk0MjM0fQ.SMjpxJ1heQlfjnw7QEQkMtrhz60lqE-KpglZmcV7nKA'
);

async function main() {
  // Check prospects
  const { data: prospects, error } = await supabase.from('prospects').select('*').limit(3);
  if (error) { console.log('Error:', error); return; }
  
  console.log('=== PROSPECT COLUMNS ===');
  console.log(Object.keys(prospects[0] || {}).join(', '));
  
  console.log('\n=== SAMPLE PROSPECTS ===');
  prospects.forEach(p => console.log({
    company_name: p.company_name,
    name: p.name,
    funding_stage: p.funding_stage,
    helix_fit_reason: p.helix_fit_reason?.substring(0, 80),
    description: p.description?.substring(0, 80),
    helix_fit_score: p.helix_fit_score,
    connection_score: p.connection_score,
    priority_score: p.priority_score
  }));
  
  // Check contacts with connection_strength
  const { data: contacts, count } = await supabase
    .from('contacts')
    .select('*', { count: 'exact' })
    .not('connection_strength', 'is', null)
    .limit(5);
  console.log('\n=== CONTACTS WITH CONNECTION_STRENGTH ===');
  console.log('Count:', count);
  contacts?.slice(0, 3).forEach(c => console.log({
    name: c.full_name,
    company: c.current_company,
    strength: c.connection_strength,
    owner: c.owner_user_id
  }));
}
main();
