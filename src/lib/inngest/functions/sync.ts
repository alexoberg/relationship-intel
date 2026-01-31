import { inngest } from '../client';
import { createAdminClient } from '@/lib/supabase/admin';
import { createGoogleClient } from '@/lib/google';
import { google } from 'googleapis';

const BATCH_SIZE = 50; // Smaller batches for durability
const RATE_LIMIT_DELAY_MS = 200;

// Internal types with ISO string dates (for Inngest serialization)
interface SerializedGmailMessage {
  id: string;
  threadId: string;
  subject: string;
  snippet: string;
  from: string;
  to: string[];
  dateIso: string; // ISO string instead of Date
  direction: 'sent' | 'received';
}

interface SerializedCalendarEvent {
  id: string;
  summary: string;
  startIso: string;
  endIso: string | null;
  attendees: string[];
}

interface SyncStartedEvent {
  name: 'sync/background-started';
  data: {
    userId: string;
    accessToken: string;
    refreshToken?: string;
    maxMessages?: number;
    sinceDate?: string; // ISO string
    triggerEnrichment?: boolean;
  };
}

/**
 * Background Gmail/Calendar sync using Inngest for long-running operations
 * Bypasses Vercel 60s timeout by running as durable function
 */
export const backgroundSync = inngest.createFunction(
  {
    id: 'background-sync',
    name: 'Background Gmail/Calendar Sync',
    concurrency: {
      limit: 1,
      key: 'event.data.userId',
    },
    retries: 3,
  },
  { event: 'sync/background-started' },
  async ({ event, step }) => {
    const {
      userId,
      accessToken,
      refreshToken,
      maxMessages = 500000, // Default to 500k
      sinceDate,
      triggerEnrichment = true,
    } = event.data;

    const supabase = createAdminClient();
    const auth = createGoogleClient(accessToken, refreshToken);
    const gmail = google.gmail({ version: 'v1', auth });
    const calendar = google.calendar({ version: 'v3', auth });

    // Get user email for filtering
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    const userEmail = profile?.email?.toLowerCase() || '';

    // Step 1: Fetch all Gmail message IDs
    const messageIds = await step.run('fetch-gmail-ids', async () => {
      const ids: string[] = [];
      let pageToken: string | undefined;

      // Build query for incremental sync
      let query: string | undefined;
      if (sinceDate) {
        const epochSeconds = Math.floor(new Date(sinceDate).getTime() / 1000);
        query = `after:${epochSeconds}`;
      }

      console.log(`[Sync] Fetching Gmail message IDs (max ${maxMessages})...`);

      do {
        const response = await gmail.users.messages.list({
          userId: 'me',
          maxResults: Math.min(500, maxMessages - ids.length),
          pageToken,
          q: query,
        });

        const messages = response.data.messages || [];
        for (const msg of messages) {
          if (ids.length >= maxMessages) break;
          if (msg.id) ids.push(msg.id);
        }

        pageToken = response.data.nextPageToken || undefined;

        // Log progress every 1000 IDs
        if (ids.length % 1000 === 0) {
          console.log(`[Sync] Collected ${ids.length} message IDs...`);
        }
      } while (pageToken && ids.length < maxMessages);

      console.log(`[Sync] Total message IDs collected: ${ids.length}`);
      return ids;
    });

    // Step 2: Fetch message details in batches
    const messages: SerializedGmailMessage[] = [];
    const totalBatches = Math.ceil(messageIds.length / BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchMessages = await step.run(`fetch-gmail-batch-${batchIndex}`, async () => {
        const start = batchIndex * BATCH_SIZE;
        const batch = messageIds.slice(start, start + BATCH_SIZE);
        const batchResults: SerializedGmailMessage[] = [];

        // Rate limiting delay
        if (batchIndex > 0) {
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
        }

        const results = await Promise.allSettled(
          batch.map(async (msgId) => {
            const detail = await gmail.users.messages.get({
              userId: 'me',
              id: msgId,
              format: 'metadata',
              metadataHeaders: ['From', 'To', 'Subject', 'Date'],
            });

            const headers = detail.data.payload?.headers || [];
            const getHeader = (name: string) =>
              headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

            const from = getHeader('From');
            const to = getHeader('To');
            const labels = detail.data.labelIds || [];
            const direction = labels.includes('SENT') ? 'sent' : 'received';

            return {
              id: msgId,
              threadId: detail.data.threadId!,
              subject: getHeader('Subject'),
              snippet: detail.data.snippet || '',
              from: extractEmail(from),
              to: to.split(',').map((e) => extractEmail(e.trim())),
              dateIso: new Date(getHeader('Date')).toISOString(),
              direction,
            } as SerializedGmailMessage;
          })
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            batchResults.push(result.value);
          }
        }

        return batchResults;
      });

      messages.push(...batchMessages);

      // Log progress every 10 batches
      if (batchIndex % 10 === 0) {
        console.log(`[Sync] Processed ${Math.min((batchIndex + 1) * BATCH_SIZE, messageIds.length)}/${messageIds.length} messages`);
      }
    }

    // Step 3: Fetch calendar events
    const events = await step.run('fetch-calendar-events', async () => {
      const calendarEvents: SerializedCalendarEvent[] = [];
      let pageToken: string | undefined;

      const timeMin = sinceDate
        ? new Date(sinceDate)
        : new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000); // 5 years back

      do {
        const response = await calendar.events.list({
          calendarId: 'primary',
          timeMin: timeMin.toISOString(),
          timeMax: new Date().toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 250,
          pageToken,
        });

        const items = response.data.items || [];
        for (const event of items) {
          if (!event.id || !event.start) continue;

          const attendees = (event.attendees || [])
            .filter((a) => a.email && !a.self)
            .map((a) => a.email!);

          if (attendees.length === 0) continue;

          calendarEvents.push({
            id: event.id,
            summary: event.summary || 'No title',
            startIso: new Date(event.start.dateTime || event.start.date || '').toISOString(),
            endIso: event.end
              ? new Date(event.end.dateTime || event.end.date || '').toISOString()
              : null,
            attendees,
          });
        }

        pageToken = response.data.nextPageToken || undefined;
      } while (pageToken);

      return calendarEvents;
    });

    // Step 4: Process and store contacts
    const { contactsCreated, emailsSynced, meetingsSynced } = await step.run('store-data', async () => {
      // Extract unique emails
      const emailContactMap = new Map<string, { email: string; name: string | null }>();

      for (const msg of messages) {
        const rawHeader = msg.direction === 'sent' ? msg.to[0] : msg.from;
        const { email, name } = extractFromHeader(rawHeader);
        if (email === userEmail) continue;
        if (!emailContactMap.has(email) || (name && !emailContactMap.get(email)?.name)) {
          emailContactMap.set(email, { email, name });
        }
      }

      for (const event of events) {
        for (const attendeeRaw of event.attendees) {
          const { email, name } = extractFromHeader(attendeeRaw);
          if (email === userEmail) continue;
          if (!emailContactMap.has(email) || (name && !emailContactMap.get(email)?.name)) {
            emailContactMap.set(email, { email, name });
          }
        }
      }

      // Get existing contacts
      const { data: existingContacts } = await supabase
        .from('contacts')
        .select('id, email')
        .eq('owner_id', userId);

      const existingEmails = new Set(
        (existingContacts || []).filter(c => c.email).map(c => c.email!.toLowerCase())
      );

      // Create new contacts
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
          const parts = data.name?.split(/\s+/) || [];
          newContacts.push({
            owner_id: userId,
            email,
            full_name: data.name || email.split('@')[0],
            first_name: parts[0] || email.split('@')[0],
            last_name: parts.slice(1).join(' ') || '',
            source: 'gmail',
            category: 'uncategorized',
          });
        }
      }

      // Insert contacts in batches
      let created = 0;
      for (let i = 0; i < newContacts.length; i += 100) {
        const batch = newContacts.slice(i, i + 100);
        const { error } = await supabase
          .from('contacts')
          .upsert(batch, { onConflict: 'owner_id,email' });
        if (!error) created += batch.length;
      }

      // Get all contacts for mapping
      const { data: allContacts } = await supabase
        .from('contacts')
        .select('id, email')
        .eq('owner_id', userId);

      const contactIdByEmail = new Map<string, string>();
      (allContacts || []).forEach(c => {
        if (c.email) contactIdByEmail.set(c.email.toLowerCase(), c.id);
      });

      // Store email interactions
      const emailBatch = messages
        .filter(msg => {
          const email = extractEmail(msg.direction === 'sent' ? msg.to[0] : msg.from);
          return email !== userEmail && contactIdByEmail.has(email);
        })
        .map(msg => ({
          owner_id: userId,
          contact_id: contactIdByEmail.get(extractEmail(msg.direction === 'sent' ? msg.to[0] : msg.from))!,
          gmail_message_id: msg.id,
          thread_id: msg.threadId,
          subject: msg.subject || '',
          snippet: msg.snippet || '',
          direction: msg.direction,
          email_date: msg.dateIso,
        }));

      let emailCount = 0;
      for (let i = 0; i < emailBatch.length; i += 100) {
        const batch = emailBatch.slice(i, i + 100);
        const { error } = await supabase
          .from('email_interactions')
          .upsert(batch, { onConflict: 'gmail_message_id' });
        if (!error) emailCount += batch.length;
      }

      // Store calendar interactions
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
          const email = extractEmail(attendeeEmail);
          if (email === userEmail) continue;
          const contactId = contactIdByEmail.get(email);
          if (contactId) {
            calendarBatch.push({
              owner_id: userId,
              contact_id: contactId,
              gcal_event_id: `${event.id}_${email}`,
              summary: event.summary || '',
              event_start: event.startIso,
              event_end: event.endIso,
            });
          }
        }
      }

      let meetingCount = 0;
      for (let i = 0; i < calendarBatch.length; i += 100) {
        const batch = calendarBatch.slice(i, i + 100);
        const { error } = await supabase
          .from('calendar_interactions')
          .upsert(batch, { onConflict: 'gcal_event_id' });
        if (!error) meetingCount += batch.length;
      }

      return {
        contactsCreated: created,
        emailsSynced: emailCount,
        meetingsSynced: meetingCount,
      };
    });

    // Step 5: Update sync timestamp
    await step.run('update-timestamp', async () => {
      await supabase
        .from('profiles')
        .update({
          last_gmail_sync_at: new Date().toISOString(),
          last_calendar_sync_at: new Date().toISOString(),
        })
        .eq('id', userId);
    });

    // Step 6: Trigger enrichment if requested
    if (triggerEnrichment && contactsCreated > 0) {
      await step.run('trigger-enrichment', async () => {
        await inngest.send({
          name: 'enrichment/started',
          data: {
            userId,
            batchSize: 50,
            priorityThreshold: 500,
          },
        });
      });
    }

    // Send completion event
    await inngest.send({
      name: 'sync/completed',
      data: {
        userId,
        contactsCreated,
        emailsSynced,
        meetingsSynced,
      },
    });

    return {
      status: 'success',
      messagesFetched: messages.length,
      eventsFetched: events.length,
      contactsCreated,
      emailsSynced,
      meetingsSynced,
    };
  }
);

// Helper functions
function extractEmail(str: string): string {
  const match = str.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  return str.toLowerCase().trim();
}

function extractFromHeader(header: string): { email: string; name: string | null } {
  const emailMatch = header.match(/<([^>]+)>/);
  const nameMatch = header.match(/^([^<]+)</);

  return {
    email: emailMatch ? emailMatch[1].trim().toLowerCase() : header.trim().toLowerCase(),
    name: nameMatch ? nameMatch[1].trim() : null,
  };
}

export const functions = [backgroundSync];
