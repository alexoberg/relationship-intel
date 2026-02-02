/**
 * Promote and process listener discoveries
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  const { data: teams } = await supabase.from('teams').select('id').limit(1);
  const teamId = teams![0].id;

  // Dismiss theregister.com (it's a news site, not a prospect)
  await supabase
    .from('listener_discoveries')
    .update({ status: 'dismissed', review_notes: 'News publication, not a target company' })
    .eq('company_domain', 'theregister.com');
  console.log('❌ Dismissed theregister.com (news site)');

  // The duplicate moltbook.com entry (already promoted)
  const { data: dupMolt } = await supabase
    .from('listener_discoveries')
    .select('id')
    .eq('company_domain', 'moltbook.com')
    .eq('status', 'new')
    .single();

  if (dupMolt) {
    const { data: existingMolt } = await supabase
      .from('prospects')
      .select('id')
      .eq('company_domain', 'moltbook.com')
      .single();

    if (existingMolt) {
      await supabase
        .from('listener_discoveries')
        .update({ status: 'duplicate', promoted_prospect_id: existingMolt.id })
        .eq('id', dupMolt.id);
      console.log('⏭️ Marked moltbook.com as duplicate (already a prospect)');
    }
  }

  // Promote openclaw.ai and prelaunch.com
  const toPromote = ['openclaw.ai', 'prelaunch.com'];

  for (const domain of toPromote) {
    const { data: discovery } = await supabase
      .from('listener_discoveries')
      .select('*')
      .eq('company_domain', domain)
      .eq('status', 'new')
      .single();

    if (!discovery) continue;

    const { data: existing } = await supabase
      .from('prospects')
      .select('id')
      .eq('company_domain', domain)
      .eq('team_id', teamId)
      .single();

    if (existing) {
      await supabase
        .from('listener_discoveries')
        .update({ status: 'duplicate', promoted_prospect_id: existing.id })
        .eq('id', discovery.id);
      console.log(`⏭️ ${domain} already a prospect`);
      continue;
    }

    const { data: prospect } = await supabase
      .from('prospects')
      .insert({
        team_id: teamId,
        company_name: domain.split('.')[0],
        company_domain: domain,
        helix_products: discovery.helix_products,
        helix_fit_score: discovery.confidence_score,
        helix_fit_reason: 'Listener: ' + (discovery.keywords_matched || []).join(', '),
        source: 'listener',
        source_url: discovery.source_url,
        status: 'new',
      })
      .select()
      .single();

    if (prospect) {
      await supabase
        .from('listener_discoveries')
        .update({ status: 'promoted', promoted_prospect_id: prospect.id })
        .eq('id', discovery.id);
      console.log(`✅ Promoted ${domain}`);
    }
  }

  // Summary
  const { data: discoveries } = await supabase
    .from('listener_discoveries')
    .select('company_domain, status');

  console.log('\n=== Discovery Status Summary ===');
  const statuses: Record<string, number> = {};
  for (const d of discoveries || []) {
    statuses[d.status] = (statuses[d.status] || 0) + 1;
  }
  for (const [status, count] of Object.entries(statuses)) {
    console.log(`  ${status}: ${count}`);
  }

  // Show listener prospects
  const { data: listenerProspects } = await supabase
    .from('prospects')
    .select('company_name, company_domain, helix_fit_score')
    .eq('source', 'listener');

  console.log('\n=== Listener-Sourced Prospects ===');
  for (const p of listenerProspects || []) {
    console.log(`  ${p.company_domain} (${p.helix_fit_score}%)`);
  }
}

main().catch(console.error);
