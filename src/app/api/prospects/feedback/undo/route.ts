import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/prospects/feedback/undo - Undo feedback for a prospect
 *
 * Reverts the prospect to unreviewed state and removes the feedback record.
 *
 * Body:
 * {
 *   prospectId: string
 * }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { prospectId } = body;

  if (!prospectId) {
    return NextResponse.json(
      { error: 'prospectId is required' },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // Get the prospect to verify access and get the previous state
  const { data: prospect, error: prospectError } = await adminClient
    .from('prospects')
    .select('id, team_id, status')
    .eq('id', prospectId)
    .single();

  if (prospectError || !prospect) {
    return NextResponse.json(
      { error: 'Prospect not found' },
      { status: 404 }
    );
  }

  // Verify user has access to this team
  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('team_id', prospect.team_id)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: 'Access denied' },
      { status: 403 }
    );
  }

  // Get the feedback record to see what the previous state was
  const { data: feedback } = await adminClient
    .from('prospect_feedback')
    .select('*')
    .eq('prospect_id', prospectId)
    .eq('user_id', user.id)
    .single();

  // Delete the feedback record
  await adminClient
    .from('prospect_feedback')
    .delete()
    .eq('prospect_id', prospectId)
    .eq('user_id', user.id);

  // Revert the prospect to unreviewed state
  // If it was marked as not_a_fit by this feedback, revert to 'new'
  const updates: Record<string, unknown> = {
    user_fit_override: null,
    reviewed_at: null,
    reviewed_by: null,
    is_good_fit: null,
    feedback_notes: null,
    feedback_by: null,
    feedback_at: null,
    updated_at: new Date().toISOString(),
  };

  // If status was changed to not_a_fit by feedback, revert to new
  if (prospect.status === 'not_a_fit' && feedback && !feedback.is_good_fit) {
    updates.status = 'new';
  }

  await adminClient
    .from('prospects')
    .update(updates)
    .eq('id', prospectId);

  // Log activity
  await adminClient.rpc('log_prospect_activity', {
    p_prospect_id: prospectId,
    p_user_id: user.id,
    p_activity_type: 'feedback_undone',
    p_activity_data: { previous_feedback: feedback },
    p_notes: 'User undid their feedback',
  });

  return NextResponse.json({
    success: true,
    message: 'Feedback undone',
  });
}
