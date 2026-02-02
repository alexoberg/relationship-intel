import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * POST /api/prospects/feedback - Submit feedback for a prospect
 *
 * Body:
 * {
 *   prospectId: string,
 *   isGoodFit: boolean,
 *   feedbackReason?: string,
 *   confidence?: 1-5,
 *   reviewTimeMs?: number
 * }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { prospectId, isGoodFit, feedbackReason, confidence, reviewTimeMs } = body;

  if (!prospectId || isGoodFit === undefined) {
    return NextResponse.json(
      { error: 'prospectId and isGoodFit are required' },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // Get the prospect with current AI scoring
  const { data: prospect, error: prospectError } = await adminClient
    .from('prospects')
    .select('id, team_id, helix_fit_score, helix_fit_reason, helix_products, status')
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

  // Insert or update feedback
  const { data: feedback, error: feedbackError } = await adminClient
    .from('prospect_feedback')
    .upsert({
      prospect_id: prospectId,
      team_id: prospect.team_id,
      user_id: user.id,
      is_good_fit: isGoodFit,
      confidence: confidence || null,
      feedback_reason: feedbackReason || null,
      ai_helix_fit_score: prospect.helix_fit_score,
      ai_helix_fit_reason: prospect.helix_fit_reason,
      ai_helix_products: prospect.helix_products,
      review_time_ms: reviewTimeMs || null,
      created_at: new Date().toISOString(),
    }, {
      onConflict: 'prospect_id,user_id',
    })
    .select()
    .single();

  if (feedbackError) {
    console.error('Failed to save feedback:', feedbackError);
    return NextResponse.json(
      { error: 'Failed to save feedback' },
      { status: 500 }
    );
  }

  // Update prospect with review info
  const prospectUpdates: Record<string, unknown> = {
    user_fit_override: isGoodFit,
    reviewed_at: new Date().toISOString(),
    reviewed_by: user.id,
    // Also update legacy fields
    is_good_fit: isGoodFit,
    feedback_notes: feedbackReason || null,
    feedback_by: user.id,
    feedback_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // If marked as not a fit and status is new, update status
  if (!isGoodFit && prospect.status === 'new') {
    prospectUpdates.status = 'not_a_fit';
  }

  await adminClient
    .from('prospects')
    .update(prospectUpdates)
    .eq('id', prospectId);

  // Log activity
  await adminClient.rpc('log_prospect_activity', {
    p_prospect_id: prospectId,
    p_user_id: user.id,
    p_activity_type: 'feedback_given',
    p_activity_data: {
      is_good_fit: isGoodFit,
      feedback_reason: feedbackReason,
      confidence,
      ai_score: prospect.helix_fit_score,
    },
    p_notes: feedbackReason,
  });

  return NextResponse.json({
    success: true,
    feedback,
  });
}

/**
 * GET /api/prospects/feedback - Get feedback stats
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

  const adminClient = createAdminClient();

  // Get feedback stats
  const { data: feedback } = await adminClient
    .from('prospect_feedback')
    .select('is_good_fit, ai_helix_fit_score')
    .eq('team_id', membership.team_id);

  const stats = {
    total: feedback?.length || 0,
    goodFit: feedback?.filter(f => f.is_good_fit).length || 0,
    notFit: feedback?.filter(f => !f.is_good_fit).length || 0,
    aiAccuracy: 0,
  };

  // Calculate AI accuracy (how often user agreed with high AI score)
  if (feedback && feedback.length > 0) {
    const highScoreFeedback = feedback.filter(f => (f.ai_helix_fit_score || 0) >= 50);
    if (highScoreFeedback.length > 0) {
      const agreed = highScoreFeedback.filter(f => f.is_good_fit).length;
      stats.aiAccuracy = Math.round((agreed / highScoreFeedback.length) * 100);
    }
  }

  // Get count of unreviewed prospects
  const { count: unreviewedCount } = await adminClient
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', membership.team_id)
    .is('reviewed_at', null)
    .neq('status', 'not_a_fit');

  return NextResponse.json({
    stats,
    unreviewedCount: unreviewedCount || 0,
  });
}
