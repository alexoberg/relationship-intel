/**
 * Trigger Listener scans to discover new prospects
 * Run with: npx tsx scripts/trigger-listener.ts
 */

import { createClient } from '@supabase/supabase-js';
import { Inngest } from 'inngest';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Create Inngest client for sending events
const inngest = new Inngest({ id: 'relationship-intel' });

async function main() {
  console.log('🔍 Triggering Listener scans...\n');

  // Get the team ID
  const { data: teams, error: teamError } = await supabase
    .from('teams')
    .select('id, name')
    .limit(1);

  if (teamError || !teams?.length) {
    console.error('Error getting team:', teamError);
    return;
  }

  const teamId = teams[0].id;
  console.log(`Team: ${teams[0].name} (${teamId})\n`);

  // Since we can't call Inngest directly without the event key,
  // we'll use the cron endpoints which are designed to run without auth

  console.log('Option 1: Use the dashboard at /dashboard/listener');
  console.log('Option 2: Trigger via cron endpoints (if CRON_SECRET is set)\n');

  // Check current discoveries and runs
  const { data: discoveries } = await supabase
    .from('listener_discoveries')
    .select('id, company_domain, status, confidence_score, discovered_at')
    .order('discovered_at', { ascending: false })
    .limit(10);

  const { data: runs } = await supabase
    .from('listener_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(5);

  console.log('=== Recent Listener Runs ===');
  if (runs?.length) {
    for (const run of runs) {
      console.log(`  ${run.source_type} | ${run.status} | ${run.discoveries_created} discoveries | ${new Date(run.started_at).toLocaleString()}`);
    }
  } else {
    console.log('  No runs found');
  }

  console.log('\n=== Recent Discoveries ===');
  if (discoveries?.length) {
    for (const d of discoveries) {
      console.log(`  ${d.company_domain} | ${d.status} | ${d.confidence_score}% | ${new Date(d.discovered_at).toLocaleString()}`);
    }
  } else {
    console.log('  No discoveries found');
  }

  // Count by status
  const { data: statusCounts } = await supabase
    .from('listener_discoveries')
    .select('status')
    .then(({ data }) => {
      const counts: Record<string, number> = {};
      for (const d of data || []) {
        counts[d.status] = (counts[d.status] || 0) + 1;
      }
      return { data: counts };
    });

  console.log('\n=== Discovery Status Summary ===');
  console.log(`  New: ${statusCounts?.new || 0}`);
  console.log(`  Promoted: ${statusCounts?.promoted || 0}`);
  console.log(`  Dismissed: ${statusCounts?.dismissed || 0}`);
  console.log(`  Duplicate: ${statusCounts?.duplicate || 0}`);

  console.log('\n✅ To trigger scans, go to: /dashboard/listener');
  console.log('   Click "Scan HN" and "Scan RSS" buttons');
}

main().catch(console.error);
