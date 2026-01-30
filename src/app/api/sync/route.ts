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

    // Process email interactions in batches (only matched ones for now)
    const emailBatch: Array<{
      owner_id: string;
      contact_id: string;
      gmail_message_id: string;
      thread_id: string;
      subject: string;
      snippet: string;
      direction: string;
      email_date: string;
    }> = [];

    for (const msg of messages) {
      const contactEmail = msg.direction === 'sent' ? msg.to[0] : msg.from;
      const contactId = findContact(contactEmail);

      // Only store if we have a matching contact
      if (contactId) {
        emailBatch.push({
          owner_id: user.id,
          contact_id: contactId,
          gmail_message_id: msg.id,
          thread_id: msg.threadId,
          subject: msg.subject || '',
          snippet: msg.snippet || '',
          direction: msg.direction,
          email_date: msg.date.toISOString(),
        });
      }
    }

    // Batch upsert emails
    if (emailBatch.length > 0) {
      const { error: emailError } = await supabase
        .from('email_interactions')
        .upsert(emailBatch, { onConflict: 'gmail_message_id' });

      if (emailError) {
        console.error('Email batch insert error:', emailError);
      } else {
        emailsSynced = emailBatch.length;
      }
    }

    // Process calendar events in batches (only matched ones for now)
    const calendarBatch: Array<{
      owner_id: string;
      contact_id: string;
      gcal_event_id: string;
      summary: string;
      event_start: string;
      event_end: string | null;
    }> = [];

    for (const event of events) {
      for (const attendeeEmail of event.attendees) {
        const contactId = findContact(attendeeEmail);

        // Only store if we have a matching contact
        if (contactId) {
          calendarBatch.push({
            owner_id: user.id,
            contact_id: contactId,
            gcal_event_id: `${event.id}_${attendeeEmail}`,
            summary: event.summary || '',
            event_start: event.start.toISOString(),
            event_end: event.end?.toISOString() || null,
          });
        }
      }
    }

    // Batch upsert calendar events
    if (calendarBatch.length > 0) {
      const { error: calError } = await supabase
        .from('calendar_interactions')
        .upsert(calendarBatch, { onConflict: 'gcal_event_id' });

      if (calError) {
        console.error('Calendar batch insert error:', calError);
      } else {
        meetingsSynced = calendarBatch.length;
      }
    }

    // Skip proximity score updates during sync to avoid timeout
    // Proximity scores will be calculated on-demand when viewing contacts
    const contactsUpdated = 0;

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
