import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - List user's teams
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: memberships, error } = await supabase
      .from('team_members')
      .select(`
        role,
        team:teams(
          id,
          name,
          created_at
        )
      `)
      .eq('user_id', user.id);

    if (error) throw error;

    const teams = memberships?.map(m => ({
      ...m.team,
      role: m.role
    })) || [];

    return NextResponse.json({ teams });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST - Create a new team
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name } = await request.json();

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Team name required' }, { status: 400 });
    }

    // Create team
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({ name, created_by: user.id })
      .select()
      .single();

    if (teamError) throw teamError;

    // Add creator as admin
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({
        team_id: team.id,
        user_id: user.id,
        role: 'admin'
      });

    if (memberError) throw memberError;

    return NextResponse.json({ team, role: 'admin' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
