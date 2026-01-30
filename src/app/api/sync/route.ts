import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  fetchGmailMessages,
  fetchCalendarEvents,
  groupInteractionsByEmail,
} from '@/lib/google';

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

    // Fetch Gmail messages and Calendar events
    const [messages, events] = await Promise.all([
      fetchGmailMessages(
        profile.google_access_token,
        profile.google_refresh_token || undefined,
        500
      ),
      fetchCalendarEvents(
        profile.google_access_token,
        profile.google_refresh_token || undefined,
        365
      ),
    ]);

    // Group by email
    const interactions = groupInteractionsByEmail(messages, events);

    // Get all contacts for this user
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email')
      .eq('owner_id', user.id)
      .not('email', 'is', null);

    const contactsByEmail = new Map(
      (contacts || []).map((c) => [c.email?.toLowerCase(), c.id])
    );

    let emailsSynced = 0;
    let meetingsSynced = 0;
    let contactsUpdated = 0;

    // Process interactions
    for (const [email, data] of interactions) {
      const contactId = contactsByEmail.get(email.toLowerCase());

      if (!contactId) continue;

      // Insert email interactions
      for (const msg of data.emails) {
        try {
          await supabase.from('email_interactions').upsert(
            {
              owner_id: user.id,
              contact_id: contactId,
              gmail_message_id: msg.id,
              thread_id: msg.threadId,
              subject: msg.subject,
              snippet: msg.snippet,
              direction: msg.direction,
              email_date: msg.date.toISOString(),
            },
            { onConflict: 'gmail_message_id' }
          );
          emailsSynced++;
        } catch (err) {
          console.error('Failed to insert email:', err);
        }
      }

      // Insert calendar interactions
      for (const event of data.meetings) {
        try {
          await supabase.from('calendar_interactions').upsert(
            {
              owner_id: user.id,
              contact_id: contactId,
              gcal_event_id: event.id,
              summary: event.summary,
              event_start: event.start.toISOString(),
              event_end: event.end?.toISOString() || null,
            },
            { onConflict: 'gcal_event_id' }
          );
          meetingsSynced++;
        } catch (err) {
          console.error('Failed to insert calendar event:', err);
        }
      }

      // Update contact proximity score
      const { data: scoreData } = await supabase.rpc('calculate_proximity_score', {
        contact_uuid: contactId,
      });

      if (scoreData !== null) {
        // Find last interaction date
        const lastEmail = data.emails.length > 0
          ? Math.max(...data.emails.map((e) => e.date.getTime()))
          : 0;
        const lastMeeting = data.meetings.length > 0
          ? Math.max(...data.meetings.map((e) => e.start.getTime()))
          : 0;
        const lastInteraction = Math.max(lastEmail, lastMeeting);

        await supabase
          .from('contacts')
          .update({
            proximity_score: scoreData,
            interaction_count: data.emails.length + data.meetings.length,
            last_interaction_at: lastInteraction > 0
              ? new Date(lastInteraction).toISOString()
              : null,
          })
          .eq('id', contactId);

        contactsUpdated++;
      }
    }

    return NextResponse.json({
      success: true,
      emailsSynced,
      meetingsSynced,
      contactsUpdated,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
