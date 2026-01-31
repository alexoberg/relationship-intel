import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest';

/**
 * GET /api/enrich/budget
 * Get current budget status
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: budget } = await supabase
      .from('enrichment_budget')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!budget) {
      return NextResponse.json({
        success: true,
        budget: {
          authorized_amount: 500,
          total_spent: 0,
          remaining: 500,
          enrichments_count: 0,
          pending_approval: false,
        },
      });
    }

    return NextResponse.json({
      success: true,
      budget: {
        ...budget,
        remaining: budget.authorized_amount - budget.total_spent,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/enrich/budget
 * Approve additional budget or update settings
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, amount } = body;

    // Get current budget
    let { data: budget } = await supabase
      .from('enrichment_budget')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!budget) {
      // Create default budget
      const { data: newBudget } = await supabase
        .from('enrichment_budget')
        .insert({
          user_id: user.id,
          authorized_amount: 500,
          increment_amount: 50,
          total_spent: 0,
          enrichments_count: 0,
        })
        .select()
        .single();
      budget = newBudget;
    }

    if (!budget) {
      return NextResponse.json(
        { success: false, error: 'Failed to get or create budget' },
        { status: 500 }
      );
    }

    switch (action) {
      case 'approve_pending': {
        // Approve the pending budget increase
        if (!budget.pending_approval) {
          return NextResponse.json(
            { success: false, error: 'No pending approval' },
            { status: 400 }
          );
        }

        const newAuthorized = budget.authorized_amount + (budget.pending_approval_amount || budget.increment_amount);

        await supabase
          .from('enrichment_budget')
          .update({
            authorized_amount: newAuthorized,
            pending_approval: false,
            pending_approval_amount: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', budget.id);

        // Automatically trigger enrichment after approval
        await inngest.send({
          name: 'enrichment/started',
          data: {
            userId: user.id,
            batchSize: 100,
          },
        });

        return NextResponse.json({
          success: true,
          message: `Budget increased to $${newAuthorized.toFixed(2)}. Enrichment resumed.`,
          newAuthorized,
        });
      }

      case 'increase': {
        // Manually increase budget by specified amount
        const increaseAmount = amount || budget.increment_amount;
        const newAuthorized = budget.authorized_amount + increaseAmount;

        await supabase
          .from('enrichment_budget')
          .update({
            authorized_amount: newAuthorized,
            pending_approval: false,
            pending_approval_amount: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', budget.id);

        return NextResponse.json({
          success: true,
          message: `Budget increased to $${newAuthorized.toFixed(2)}`,
          newAuthorized,
        });
      }

      case 'set_authorized': {
        // Set a specific authorized amount
        if (!amount || amount < budget.total_spent) {
          return NextResponse.json(
            { success: false, error: 'Amount must be greater than current spend' },
            { status: 400 }
          );
        }

        await supabase
          .from('enrichment_budget')
          .update({
            authorized_amount: amount,
            pending_approval: false,
            pending_approval_amount: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', budget.id);

        return NextResponse.json({
          success: true,
          message: `Budget set to $${amount.toFixed(2)}`,
          newAuthorized: amount,
        });
      }

      case 'set_increment': {
        // Update the increment amount for future approvals
        if (!amount || amount <= 0) {
          return NextResponse.json(
            { success: false, error: 'Invalid increment amount' },
            { status: 400 }
          );
        }

        await supabase
          .from('enrichment_budget')
          .update({
            increment_amount: amount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', budget.id);

        return NextResponse.json({
          success: true,
          message: `Increment amount set to $${amount.toFixed(2)}`,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action. Use: approve_pending, increase, set_authorized, set_increment' },
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
