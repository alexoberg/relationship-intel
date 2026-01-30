import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  fetchGmailMessages,
  fetchCalendarEvents,
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

    // Check for incremental sync - use last sync timestamps if available
    const lastGmailSync = profile.last_gmail_sync_at ? new Date(profile.last_gmail_sync_at) : undefined;
    const lastCalendarSync = profile.last_calendar_sync_at ? new Date(profile.last_calendar_sync_at) : undefined;
    const syncStartTime = new Date(); // Record when sync started

    const isFirstSync = !lastGmailSync;
    console.log(`[Sync] ${isFirstSync ? 'First sync - fetching all data' : `Incremental sync since ${lastGmailSync?.toISOString()}`}`);

    // Fetch Gmail messages and Calendar events independently
    // First sync: fetch up to 10,000 messages, 5 years of calendar
    // Incremental sync: fetch only new data since last sync
    const [messages, events] = await Promise.all([
      fetchGmailMessages(
        profile.google_access_token,
        profile.google_refresh_token || undefined,
        isFirstSync ? 10000 : 5000, // Smaller limit for incremental
        lastGmailSync // Pass last sync date for incremental
      ),
      fetchCalendarEvents(
        profile.google_access_token,
        profile.google_refresh_token || undefined,
        1825, // 5 years for first sync
        lastCalendarSync // Pass last sync date for incremental
      ),
    ]);

    console.log(`[Sync] Fetched ${messages.length} Gmail messages, ${events.length} calendar events`);

    // Extract email and name from header "Name <email>" format
    const extractFromHeader = (header: string): { email: string; name: string | null } => {
      const emailMatch = header.match(/<([^>]+)>/);
      const nameMatch = header.match(/^([^<]+)</);

      return {
        email: emailMatch ? emailMatch[1].trim().toLowerCase() : header.trim().toLowerCase(),
        name: nameMatch ? nameMatch[1].trim() : null,
      };
    };

    // Collect all unique email addresses from Gmail (excluding user's own email)
    const userEmail = user.email?.toLowerCase() || '';
    const emailContactMap = new Map<string, { email: string; name: string | null }>();

    for (const msg of messages) {
      // Get the contact from the email (recipient if sent, sender if received)
      const rawHeader = msg.direction === 'sent' ? msg.to[0] : msg.from;
      const { email, name } = extractFromHeader(rawHeader);

      // Skip user's own email
      if (email === userEmail) continue;

      // Store unique contacts (prefer entries with names)
      if (!emailContactMap.has(email) || (name && !emailContactMap.get(email)?.name)) {
        emailContactMap.set(email, { email, name });
      }
    }

    // Also collect from calendar events
    for (const event of events) {
      for (const attendeeRaw of event.attendees) {
        const { email, name } = extractFromHeader(attendeeRaw);
        if (email === userEmail) continue;

        if (!emailContactMap.has(email) || (name && !emailContactMap.get(email)?.name)) {
          emailContactMap.set(email, { email, name });
        }
      }
    }

    console.log(`[Sync] Found ${emailContactMap.size} unique email addresses in Gmail/Calendar`);

    // Get existing contacts
    const { data: existingContacts } = await supabase
      .from('contacts')
      .select('id, email')
      .eq('owner_id', user.id);

    const existingEmails = new Set(
      (existingContacts || [])
        .filter(c => c.email)
        .map(c => c.email!.toLowerCase())
    );

    // Find new contacts to create
    const newContacts: Array<{
      owner_id: string;
      email: string;
      full_name: string;
      first_name: string;
      last_name: string;
      source: string;
      category: string;
    }> = [];

    for (const [email, data] of emailContactMap) {
      if (!existingEmails.has(email)) {
        // Parse name into first/last
        let firstName = '';
        let lastName = '';
        let fullName = data.name || email.split('@')[0];

        if (data.name) {
          const parts = data.name.split(/\s+/);
          firstName = parts[0] || '';
          lastName = parts.slice(1).join(' ') || '';
        } else {
          // Use email prefix as name
          firstName = email.split('@')[0];
        }

        newContacts.push({
          owner_id: user.id,
          email,
          full_name: fullName,
          first_name: firstName,
          last_name: lastName,
          source: 'gmail',
          category: 'uncategorized',
        });
      }
    }

    console.log(`[Sync] Creating ${newContacts.length} new contacts from Gmail`);

    // Insert new contacts in batches
    let contactsCreated = 0;
    if (newContacts.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < newContacts.length; i += batchSize) {
        const batch = newContacts.slice(i, i + batchSize);
        const { error } = await supabase
          .from('contacts')
          .upsert(batch, { onConflict: 'owner_id,email' });

        if (error) {
          console.error('Contact batch insert error:', error);
        } else {
          contactsCreated += batch.length;
        }
      }
    }

    // Refresh contacts list to get IDs for the new contacts
    const { data: allContacts } = await supabase
      .from('contacts')
      .select('id, email')
      .eq('owner_id', user.id);

    // Build email -> contact_id lookup
    const contactIdByEmail = new Map<string, string>();
    (allContacts || []).forEach(c => {
      if (c.email) {
        contactIdByEmail.set(c.email.toLowerCase(), c.id);
      }
    });

    // Now process all email interactions
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
      const rawHeader = msg.direction === 'sent' ? msg.to[0] : msg.from;
      const { email } = extractFromHeader(rawHeader);

      // Skip user's own email
      if (email === userEmail) continue;

      const contactId = contactIdByEmail.get(email);
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

    console.log(`[Sync] Storing ${emailBatch.length} email interactions`);

    // Batch upsert emails
    let emailsSynced = 0;
    if (emailBatch.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < emailBatch.length; i += batchSize) {
        const batch = emailBatch.slice(i, i + batchSize);
        const { error } = await supabase
          .from('email_interactions')
          .upsert(batch, { onConflict: 'gmail_message_id' });

        if (error) {
          console.error('Email batch insert error:', error);
        } else {
          emailsSynced += batch.length;
        }
      }
    }

    // Process calendar events
    const calendarBatch: Array<{
      owner_id: string;
      contact_id: string;
      gcal_event_id: string;
      summary: string;
      event_start: string;
      event_end: string | null;
    }> = [];

    for (const event of events) {
      for (const attendeeRaw of event.attendees) {
        const { email } = extractFromHeader(attendeeRaw);

        // Skip user's own email
        if (email === userEmail) continue;

        const contactId = contactIdByEmail.get(email);
        if (contactId) {
          calendarBatch.push({
            owner_id: user.id,
            contact_id: contactId,
            gcal_event_id: `${event.id}_${email}`,
            summary: event.summary || '',
            event_start: event.start.toISOString(),
            event_end: event.end?.toISOString() || null,
          });
        }
      }
    }

    console.log(`[Sync] Storing ${calendarBatch.length} calendar interactions`);

    // Batch upsert calendar events
    let meetingsSynced = 0;
    if (calendarBatch.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < calendarBatch.length; i += batchSize) {
        const batch = calendarBatch.slice(i, i + batchSize);
        const { error } = await supabase
          .from('calendar_interactions')
          .upsert(batch, { onConflict: 'gcal_event_id' });

        if (error) {
          console.error('Calendar batch insert error:', error);
        } else {
          meetingsSynced += batch.length;
        }
      }
    }

    // Update last sync timestamps for incremental sync next time
    await supabase
      .from('profiles')
      .update({
        last_gmail_sync_at: syncStartTime.toISOString(),
        last_calendar_sync_at: syncStartTime.toISOString(),
      })
      .eq('id', user.id);

    console.log(`[Sync] Updated last sync timestamp to ${syncStartTime.toISOString()}`);

    return NextResponse.json({
      success: true,
      contactsCreated,
      emailsSynced,
      meetingsSynced,
      syncType: isFirstSync ? 'full' : 'incremental',
      debug: {
        gmailMessagesFetched: messages.length,
        calendarEventsFetched: events.length,
        uniqueEmailsFound: emailContactMap.size,
        totalContactsNow: allContacts?.length || 0,
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
