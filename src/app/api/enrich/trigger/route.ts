import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest';

/**
 * POST /api/enrich/trigger
 * Trigger the enrichment pipeline for the current user
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse optional parameters
    const body = await request.json().catch(() => ({}));
    const batchSize = body.batchSize || 100;
    const priorityThreshold = body.priorityThreshold || 0;

    // Get current enrichment status
    const { data: budget } = await supabase
      .from('enrichment_budget')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const { count: unenrichedCount } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', user.id)
      .eq('enriched', false);

    const { count: totalCount } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', user.id);

    // Send the enrichment event to Inngest
    await inngest.send({
      name: 'enrichment/started',
      data: {
        userId: user.id,
        batchSize,
        priorityThreshold,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Enrichment pipeline started',
      stats: {
        totalContacts: totalCount || 0,
        unenrichedContacts: unenrichedCount || 0,
        batchSize,
        priorityThreshold,
        budget: budget ? {
          authorized: budget.authorized_amount,
          spent: budget.total_spent,
          remaining: budget.authorized_amount - budget.total_spent,
          enrichmentsCount: budget.enrichments_count,
        } : null,
      },
    });
  } catch (error) {
    console.error('Enrichment trigger error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/enrich/trigger
 * Get enrichment status for the current user
 */
export async function GET() {
  try {
    const supabase = await createClient();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get budget
    const { data: budget } = await supabase
      .from('enrichment_budget')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Get contact counts
    const { count: totalCount } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', user.id);

    const { count: enrichedCount } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', user.id)
      .eq('enriched', true);

    const { count: unenrichedCount } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', user.id)
      .eq('enriched', false);

    // Get recent enrichment logs
    const { data: recentLogs } = await supabase
      .from('enrichment_log')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      success: true,
      stats: {
        totalContacts: totalCount || 0,
        enrichedContacts: enrichedCount || 0,
        unenrichedContacts: unenrichedCount || 0,
        enrichmentRate: totalCount ? ((enrichedCount || 0) / totalCount * 100).toFixed(1) + '%' : '0%',
      },
      budget: budget ? {
        authorized: budget.authorized_amount,
        spent: budget.total_spent,
        remaining: budget.authorized_amount - budget.total_spent,
        enrichmentsCount: budget.enrichments_count,
        pendingApproval: budget.pending_approval,
        pendingAmount: budget.pending_approval_amount,
        lastEnrichmentAt: budget.last_enrichment_at,
      } : {
        authorized: 500,
        spent: 0,
        remaining: 500,
        enrichmentsCount: 0,
        pendingApproval: false,
        pendingAmount: null,
        lastEnrichmentAt: null,
      },
      recentLogs: recentLogs || [],
    });
  } catch (error) {
    console.error('Enrichment status error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
