/**
 * Debug the review query
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  // Check if reviewed_at column exists by querying it
  const { data, error } = await supabase
    .from('prospects')
    .select('id, reviewed_at, status')
    .limit(5);

  if (error) {
    console.log('Error:', error.message);
    return;
  }

  console.log('Sample data:', JSON.stringify(data, null, 2));

  // Count prospects where reviewed_at is null
  const { count: unreviewedCount, error: err2 } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .is('reviewed_at', null)
    .neq('status', 'not_a_fit');

  console.log('Unreviewed (reviewed_at is null):', unreviewedCount, err2?.message || '');

  // Count all active prospects
  const { count: totalActive } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .neq('status', 'not_a_fit');

  console.log('Total active:', totalActive);

  // Try getting prospects for review directly
  const { data: reviewData, error: reviewError } = await supabase
    .from('prospects')
    .select('id, company_name, reviewed_at')
    .is('reviewed_at', null)
    .neq('status', 'not_a_fit')
    .limit(10);

  console.log('\nProspects for review:', reviewData?.length || 0);
  if (reviewError) console.log('Review error:', reviewError.message);
  if (reviewData) console.log('First few:', reviewData.slice(0, 3));
}

main().catch(console.error);
