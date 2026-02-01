import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchGmailMessages, fetchCalendarEvents } from '@/lib/google';
import { processSyncData, updateSyncTimestamps } from '@/lib/sync';
import { inngest } from '@/lib/inngest';
import { success, errors, withErrorHandling } from '@/lib/api';

interface SyncData {
  contactsCreated: number;
  emailsSynced: number;
  meetingsSynced: number;
  enrichmentTriggered: boolean;
  syncType: 'full' | 'incremental';
  debug: {
    gmailMessagesFetched: number;
    calendarEventsFetched: number;
    uniqueEmailsFound: number;
    totalContactsNow: number;
  };
}

export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return errors.unauthorized();
    }

    // Get profile with Google tokens
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile?.google_access_token) {
      return errors.googleNotConnected();
    }

    // Check for incremental sync
    const lastGmailSync = profile.last_gmail_sync_at
      ? new Date(profile.last_gmail_sync_at)
      : undefined;
    const lastCalendarSync = profile.last_calendar_sync_at
      ? new Date(profile.last_calendar_sync_at)
      : undefined;
    const syncStartTime = new Date();

    const isFirstSync = !lastGmailSync;
    console.log(
      `[Sync] ${isFirstSync ? 'First sync - fetching all data' : `Incremental sync since ${lastGmailSync?.toISOString()}`}`
    );

    // Fetch Gmail messages and Calendar events
    const [messages, events] = await Promise.all([
      fetchGmailMessages(
        profile.google_access_token,
        profile.google_refresh_token || undefined,
        isFirstSync ? 1500 : 1000,
        lastGmailSync
      ),
      fetchCalendarEvents(
        profile.google_access_token,
        profile.google_refresh_token || undefined,
        1825,
        lastCalendarSync
      ),
    ]);

    console.log(`[Sync] Fetched ${messages.length} Gmail messages, ${events.length} calendar events`);

    // Get user's team for team-based contact storage
    const { data: teamMember } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();

    // Process sync data using shared utility
    const userEmail = user.email?.toLowerCase() || '';
    const result = await processSyncData(supabase, user.id, userEmail, messages, events, {
      teamId: teamMember?.team_id,
      includeEmailClassification: true,
    });

    // Update sync timestamps
    await updateSyncTimestamps(supabase, user.id, syncStartTime);

    // Get total contacts count
    const { count: totalContacts } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', user.id);

    // Trigger enrichment if requested
    const { searchParams } = new URL(request.url);
    const triggerEnrichment = searchParams.get('enrich') !== 'false';

    let enrichmentTriggered = false;
    if (triggerEnrichment && result.contactsCreated > 0) {
      try {
        await inngest.send({
          name: 'enrichment/started',
          data: {
            userId: user.id,
            batchSize: 50,
            priorityThreshold: 500,
          },
        });
        enrichmentTriggered = true;
        console.log(`[Sync] Triggered enrichment pipeline for user ${user.id}`);
      } catch (enrichError) {
        console.error('[Sync] Failed to trigger enrichment:', enrichError);
      }
    }

    return success<SyncData>({
      contactsCreated: result.contactsCreated,
      emailsSynced: result.emailsSynced,
      meetingsSynced: result.meetingsSynced,
      enrichmentTriggered,
      syncType: isFirstSync ? 'full' : 'incremental',
      debug: {
        gmailMessagesFetched: messages.length,
        calendarEventsFetched: events.length,
        uniqueEmailsFound: result.uniqueEmailsFound,
        totalContactsNow: totalContacts || 0,
      },
    });
  });
}
