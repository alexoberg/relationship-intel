import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Call the database function to recalculate all stats
    const { data, error } = await supabase.rpc('recalculate_all_user_stats', {
      user_uuid: user.id
    });

    if (error) {
      console.error('Error recalculating stats:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      contactsUpdated: data,
      message: `Recalculated stats for ${data} contacts`
    });
  } catch (error) {
    console.error('Recalculate stats error:', error);
    return NextResponse.json(
      { error: 'Failed to recalculate stats' },
      { status: 500 }
    );
  }
}
