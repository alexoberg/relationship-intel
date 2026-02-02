import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest';

/**
 * POST /api/prospects/learn - Trigger AI learning from user feedback
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

  // Trigger the learning function
  await inngest.send({
    name: 'prospects/learn-from-feedback',
    data: {
      teamId: membership.team_id,
      minFeedbackCount: 20,
    },
  });

  return NextResponse.json({
    success: true,
    message: 'Learning from feedback started',
  });
}

/**
 * GET /api/prospects/learn - Get current AI learnings
 */
export async function GET(request: NextRequest) {
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

  // Get stored learnings
  const { data: settings } = await supabase
    .from('team_settings')
    .select('value')
    .eq('team_id', membership.team_id)
    .eq('key', 'ai_scoring_learnings')
    .single();

  return NextResponse.json({
    learnings: settings?.value || null,
  });
}
