import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// PATCH - Update member role (admin only)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { team_id, member_id, role } = await request.json();

    if (!team_id || !member_id || !role) {
      return NextResponse.json({ error: 'team_id, member_id, and role required' }, { status: 400 });
    }

    if (role !== 'admin' && role !== 'member') {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    // Check if current user is admin
    const { data: currentMembership } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', team_id)
      .eq('user_id', user.id)
      .single();

    if (!currentMembership || currentMembership.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Prevent demoting yourself if you're the only admin
    if (member_id === user.id && role === 'member') {
      const { data: admins } = await supabase
        .from('team_members')
        .select('id')
        .eq('team_id', team_id)
        .eq('role', 'admin');

      if (admins && admins.length <= 1) {
        return NextResponse.json(
          { error: 'Cannot demote yourself - you are the only admin' },
          { status: 400 }
        );
      }
    }

    // Update member role
    const { error } = await supabase
      .from('team_members')
      .update({ role })
      .eq('id', member_id)
      .eq('team_id', team_id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE - Remove member from team (admin only)
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('team_id');
    const memberId = searchParams.get('member_id');

    if (!teamId || !memberId) {
      return NextResponse.json({ error: 'team_id and member_id required' }, { status: 400 });
    }

    // Check if current user is admin
    const { data: currentMembership } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .single();

    if (!currentMembership || currentMembership.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get the member to check if it's the current user
    const { data: targetMember } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('id', memberId)
      .single();

    // Prevent removing yourself if you're the only admin
    if (targetMember?.user_id === user.id) {
      const { data: admins } = await supabase
        .from('team_members')
        .select('id')
        .eq('team_id', teamId)
        .eq('role', 'admin');

      if (admins && admins.length <= 1) {
        return NextResponse.json(
          { error: 'Cannot remove yourself - you are the only admin' },
          { status: 400 }
        );
      }
    }

    // Remove member
    const { error } = await supabase
      .from('team_members')
      .delete()
      .eq('id', memberId)
      .eq('team_id', teamId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
