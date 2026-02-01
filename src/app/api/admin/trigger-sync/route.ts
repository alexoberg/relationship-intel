import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/lib/inngest';

/**
 * Admin endpoint to trigger Swarm sync for a team
 *
 * Requires:
 * - x-admin-key header (first 20 chars of SUPABASE_SERVICE_ROLE_KEY)
 * - teamId and ownerId in request body
 */
export async function POST(request: NextRequest) {
  const key = request.headers.get('x-admin-key');
  if (key !== process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { teamId, ownerId } = body;

    if (!teamId || !ownerId) {
      return NextResponse.json(
        { error: 'Missing required fields: teamId and ownerId' },
        { status: 400 }
      );
    }

    await inngest.send({
      name: 'contacts/sync',
      data: { teamId, ownerId },
    });

    return NextResponse.json({
      success: true,
      message: `Swarm sync triggered for team ${teamId}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid request body' },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    usage: 'POST with x-admin-key header and { teamId, ownerId } body to trigger Swarm sync',
  });
}
