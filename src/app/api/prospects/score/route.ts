import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest';

/**
 * POST /api/prospects/score
 * Trigger prospect scoring jobs (warm intros, helix fit, priority)
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get user's team
  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const { job = 'all' } = body;

  const teamId = membership.team_id;
  const jobs: string[] = [];

  // Send Inngest events based on requested job
  if (job === 'all' || job === 'warm-intros') {
    await inngest.send({
      name: 'prospects/sync-warm-intros',
      data: { teamId },
    });
    jobs.push('sync-warm-intros');
  }

  if (job === 'all' || job === 'helix-fit') {
    await inngest.send({
      name: 'prospects/score-helix-fit',
      data: { teamId },
    });
    jobs.push('score-helix-fit');
  }

  if (job === 'all' || job === 'priority') {
    await inngest.send({
      name: 'prospects/update-priority-scores',
      data: { teamId },
    });
    jobs.push('update-priority-scores');
  }

  return NextResponse.json({
    success: true,
    message: `Triggered scoring jobs: ${jobs.join(', ')}`,
    jobs,
  });
}
