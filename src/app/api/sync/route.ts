import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  fetchGmailMessages,
  fetchCalendarEvents,
  GmailMessage,
  CalendarEvent,
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

    // Fetch Gmail messages and Calendar events independently
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

    // Get all contacts for matching (by email AND by name)
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, email, full_name, first_name, last_name')
      .eq('owner_id', user.id);

    // Build lookup maps
    const contactsByEmail = new Map<string, string>();
    const contactsByName = new Map<string, string>();

    (contacts || []).forEach((c) => {
      if (c.email) {
        contactsByEmail.set(c.email.toLowerCase(), c.id);
      }
      if (c.full_name) {
        contactsByName.set(c.full_name.toLowerCase(), c.id);
      }
    });

    let emailsSynced = 0;
    let meetingsSynced = 0;
    let matchedByEmail = 0;
    let matchedByName = 0;
    let unmatched = 0;

    // Helper to find contact - try email first, then name
    const findContact = (email: string, name?: string): string | null => {
      // Try email match first
      const byEmail = contactsByEmail.get(email.toLowerCase());
      if (byEmail) {
        matchedByEmail++;
        return byEmail;
      }

      // Try name match if we have a name
      if (name) {
        const byName = contactsByName.get(name.toLowerCase());
        if (byName) {
          matchedByName++;
          return byName;
        }
      }

      unmatched++;
      return null;
    };

    // Extract name from email header "Name <email>" format
    const extractNameFromHeader = (header: string): string | undefined => {
      const match = header.match(/^([^<]+)</);
      if (match) {
        return match[1].trim();
      }
      return undefined;
    };

    // Process and store ALL email interactions
    for (const msg of messages) {
      try {
        const contactEmail = msg.direction === 'sent' ? msg.to[0] : msg.from;
        const contactId = findContact(contactEmail);

        await supabase.from('email_interactions').upsert(
          {
            owner_id: user.id,
            contact_id: contactId, // Can be null - will match later
            contact_email: contactEmail, // Store for later matching
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

    // Process and store ALL calendar events
    for (const event of events) {
      for (const attendeeEmail of event.attendees) {
        try {
          const contactId = findContact(attendeeEmail);

          await supabase.from('calendar_interactions').upsert(
            {
              owner_id: user.id,
              contact_id: contactId, // Can be null - will match later
              contact_email: attendeeEmail, // Store for later matching
              gcal_event_id: `${event.id}_${attendeeEmail}`,
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
    }

    // Update proximity scores for matched contacts
    const matchedContactIds = new Set<string>();

    // Collect all matched contact IDs
    const { data: matchedEmails } = await supabase
      .from('email_interactions')
      .select('contact_id')
      .eq('owner_id', user.id)
      .not('contact_id', 'is', null);

    const { data: matchedMeetings } = await supabase
      .from('calendar_interactions')
      .select('contact_id')
      .eq('owner_id', user.id)
      .not('contact_id', 'is', null);

    matchedEmails?.forEach((e) => e.contact_id && matchedContactIds.add(e.contact_id));
    matchedMeetings?.forEach((m) => m.contact_id && matchedContactIds.add(m.contact_id));

    // Update proximity scores
    let contactsUpdated = 0;
    for (const contactId of matchedContactIds) {
      try {
        // Count interactions
        const { count: emailCount } = await supabase
          .from('email_interactions')
          .select('*', { count: 'exact', head: true })
          .eq('contact_id', contactId);

        const { count: meetingCount } = await supabase
          .from('calendar_interactions')
          .select('*', { count: 'exact', head: true })
          .eq('contact_id', contactId);

        // Get last interaction
        const { data: lastEmail } = await supabase
          .from('email_interactions')
          .select('email_date')
          .eq('contact_id', contactId)
          .order('email_date', { ascending: false })
          .limit(1)
          .single();

        const { data: lastMeeting } = await supabase
          .from('calendar_interactions')
          .select('event_start')
          .eq('contact_id', contactId)
          .order('event_start', { ascending: false })
          .limit(1)
          .single();

        const lastEmailDate = lastEmail?.email_date ? new Date(lastEmail.email_date).getTime() : 0;
        const lastMeetingDate = lastMeeting?.event_start ? new Date(lastMeeting.event_start).getTime() : 0;
        const lastInteraction = Math.max(lastEmailDate, lastMeetingDate);

        // Simple proximity score: recency + frequency
        const daysSinceInteraction = lastInteraction > 0
          ? (Date.now() - lastInteraction) / (1000 * 60 * 60 * 24)
          : 365;
        const recencyScore = Math.max(0, 50 - daysSinceInteraction); // 0-50 points
        const frequencyScore = Math.min(50, ((emailCount || 0) + (meetingCount || 0) * 3)); // 0-50 points
        const proximityScore = Math.round(recencyScore + frequencyScore);

        await supabase
          .from('contacts')
          .update({
            proximity_score: proximityScore,
            interaction_count: (emailCount || 0) + (meetingCount || 0),
            last_interaction_at: lastInteraction > 0
              ? new Date(lastInteraction).toISOString()
              : null,
          })
          .eq('id', contactId);

        contactsUpdated++;
      } catch (err) {
        console.error('Failed to update contact proximity:', err);
      }
    }

    return NextResponse.json({
      success: true,
      emailsSynced,
      meetingsSynced,
      contactsUpdated,
      matching: {
        byEmail: matchedByEmail,
        byName: matchedByName,
        unmatched,
      },
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
