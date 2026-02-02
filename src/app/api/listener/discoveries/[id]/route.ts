import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { success, errors, withErrorHandling } from '@/lib/api/response';
import {
  getDiscovery,
  updateDiscoveryStatus,
  promoteDiscovery,
  dismissDiscovery,
  ListenerDiscoveryStatus,
} from '@/lib/listener';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/listener/discoveries/[id]
 * Get a single discovery
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return errors.unauthorized();
    }

    const { id } = await params;
    const discovery = await getDiscovery(id);

    if (!discovery) {
      return errors.notFound('Discovery');
    }

    return success(discovery);
  });
}

/**
 * PATCH /api/listener/discoveries/[id]
 * Update discovery status (promote, dismiss, etc.)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return errors.unauthorized();
    }

    const { id } = await params;
    const body = await request.json();
    const { action, status, notes } = body as {
      action?: 'promote' | 'dismiss';
      status?: ListenerDiscoveryStatus;
      notes?: string;
    };

    // Get user's team
    const { data: membership } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return errors.notFound('Team membership');
    }

    // Handle specific actions
    if (action === 'promote') {
      const result = await promoteDiscovery(id, membership.team_id, user.id);
      if (!result.success) {
        return errors.badRequest(result.error || 'Failed to promote discovery');
      }
      return success({
        message: 'Discovery promoted to prospect',
        prospectId: result.prospectId,
      });
    }

    if (action === 'dismiss') {
      const success_result = await dismissDiscovery(id, user.id, notes);
      if (!success_result) {
        return errors.internal('Failed to dismiss discovery');
      }
      return success({ message: 'Discovery dismissed' });
    }

    // Handle generic status update
    if (status) {
      const success_result = await updateDiscoveryStatus(id, status, user.id, notes);
      if (!success_result) {
        return errors.internal('Failed to update discovery status');
      }
      return success({ message: 'Discovery status updated', status });
    }

    return errors.badRequest('No action or status provided');
  });
}

/**
 * DELETE /api/listener/discoveries/[id]
 * Delete a discovery (soft delete via dismiss)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withErrorHandling(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return errors.unauthorized();
    }

    const { id } = await params;
    const success_result = await dismissDiscovery(id, user.id, 'Deleted by user');

    if (!success_result) {
      return errors.internal('Failed to delete discovery');
    }

    return success({ message: 'Discovery deleted' });
  });
}
