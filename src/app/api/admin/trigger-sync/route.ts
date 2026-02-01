import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/lib/inngest';

export async function POST(request: NextRequest) {
  const key = request.headers.get('x-admin-key');
  if (key !== process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(0, 20)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const teamId = 'aa2e0a01-03e4-419c-971a-0a80b187778f';
  const ownerId = '4cdff414-4475-49cf-a5ed-033f4efabde8';

  await inngest.send({
    name: 'contacts/sync',
    data: { teamId, ownerId }
  });

  return NextResponse.json({ 
    success: true, 
    message: 'Swarm sync triggered - ingesting 8655 contacts' 
  });
}

export async function GET() {
  return NextResponse.json({ 
    usage: 'POST with x-admin-key header to trigger Swarm sync' 
  });
}
