import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { inngest } from '@/lib/inngest';

/**
 * POST /api/sync/background
 * Trigger a background Gmail/Calendar sync using Inngest
 * This bypasses Vercel's 60s timeout by running as a durable function
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

    // Get profile with Google tokens
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile?.google_access_token) {
      return NextResponse.json(
        { success: false, error: 'Google not connected' },
        { status: 400 }
      );
    }

    // Parse options from request body
    const body = await request.json().catch(() => ({}));
    const {
      maxMessages = 500000, // Default 500k messages
      fullSync = false, // Force full sync by ignoring last sync timestamp
      triggerEnrichment = true,
    } = body;

    // Determine if this is first sync or incremental
    const lastGmailSync = profile.last_gmail_sync_at && !fullSync
      ? profile.last_gmail_sync_at
      : undefined;

    const isFirstSync = !lastGmailSync;

    // Send background sync event to Inngest
    await inngest.send({
      name: 'sync/background-started',
      data: {
        userId: user.id,
        accessToken: profile.google_access_token,
        refreshToken: profile.google_refresh_token || undefined,
        maxMessages,
        sinceDate: lastGmailSync,
        triggerEnrichment,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Background sync started',
      syncType: isFirstSync ? 'full' : 'incremental',
      maxMessages,
      note: isFirstSync
        ? 'Full sync initiated - this may take a while for large inboxes'
        : `Incremental sync since ${lastGmailSync}`,
    });
  } catch (error) {
    console.error('Background sync error:', error);
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
 * GET /api/sync/background
 * Get sync status information
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

    // Get profile for sync timestamps
    const { data: profile } = await supabase
      .from('profiles')
      .select('last_gmail_sync_at, last_calendar_sync_at, google_access_token')
      .eq('id', user.id)
      .single();

    // Get counts
    const { count: contactCount } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', user.id);

    const { count: emailCount } = await supabase
      .from('email_interactions')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', user.id);

    const { count: meetingCount } = await supabase
      .from('calendar_interactions')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', user.id);

    return NextResponse.json({
      success: true,
      googleConnected: !!profile?.google_access_token,
      lastGmailSync: profile?.last_gmail_sync_at,
      lastCalendarSync: profile?.last_calendar_sync_at,
      stats: {
        contacts: contactCount || 0,
        emails: emailCount || 0,
        meetings: meetingCount || 0,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
