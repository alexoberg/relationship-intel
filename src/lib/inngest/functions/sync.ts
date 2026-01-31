import { inngest } from '../client';
import { createAdminClient } from '@/lib/supabase/admin';
import { createGoogleClient } from '@/lib/google';
import { google } from 'googleapis';
import { classifyEmail, type EmailClassification } from '@/lib/email-filter';

const BATCH_SIZE = 50; // Smaller batches for durability
const RATE_LIMIT_DELAY_MS = 1000; // 1 second between batches to stay under Gmail quota

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

    // Step 2: Fetch message details in chunked steps with parallel processing
    // Process 200 messages per Inngest step to stay within Vercel 10s timeout
    // 200 msgs = 1 wave of 4 batches of 50 = ~5-7 seconds per step
    const MESSAGES_PER_STEP = 200;
    const PARALLEL_BATCHES = 4; // Run 4 batches of 50 in parallel (200 messages per wave)
    const messages: SerializedGmailMessage[] = [];
    const totalSteps = Math.ceil(messageIds.length / MESSAGES_PER_STEP);

    for (let stepIndex = 0; stepIndex < totalSteps; stepIndex++) {
      const stepMessages = await step.run(`fetch-gmail-chunk-${stepIndex}`, async () => {
        const stepStart = stepIndex * MESSAGES_PER_STEP;
        const stepEnd = Math.min(stepStart + MESSAGES_PER_STEP, messageIds.length);
        const stepIds = messageIds.slice(stepStart, stepEnd);
        const stepResults: SerializedGmailMessage[] = [];

        // Process in parallel waves of batches
        for (let waveStart = 0; waveStart < stepIds.length; waveStart += BATCH_SIZE * PARALLEL_BATCHES) {
          // Rate limiting delay between waves
          if (waveStart > 0) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
          }

          // Create parallel batch promises
          const batchPromises: Promise<SerializedGmailMessage[]>[] = [];
          for (let b = 0; b < PARALLEL_BATCHES; b++) {
            const batchStart = waveStart + b * BATCH_SIZE;
            if (batchStart >= stepIds.length) break;
            const batch = stepIds.slice(batchStart, batchStart + BATCH_SIZE);

            batchPromises.push(
              Promise.allSettled(
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
              ).then(results => results
                .filter((r): r is PromiseFulfilledResult<SerializedGmailMessage> => r.status === 'fulfilled')
                .map(r => r.value)
              )
            );
          }

          // Wait for all parallel batches
          const waveResults = await Promise.all(batchPromises);
          for (const batchResult of waveResults) {
            stepResults.push(...batchResult);
          }
        }

        console.log(`[Sync] Processed ${stepEnd}/${messageIds.length} messages`);
        return stepResults;
      });

      messages.push(...stepMessages);
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
      console.log(`[Sync] Starting store-data step with ${messages.length} messages and ${events.length} calendar events`);

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

      // Create new contacts with email classification
      const newContacts: Array<{
        owner_id: string;
        email: string;
        full_name: string;
        first_name: string;
        last_name: string;
        source: string;
        category: string;
        is_likely_marketing: boolean;
        is_generic_mailbox: boolean;
        filter_reason: string | null;
        email_domain: string | null;
      }> = [];

      // Track filtering stats
      let filteredMarketing = 0;
      let filteredGeneric = 0;
      let filteredAutomation = 0;

      for (const [email, data] of emailContactMap) {
        if (!existingEmails.has(email)) {
          // Classify the email
          const classification = classifyEmail(email);

          // Track stats
          if (classification.isLikelyMarketing) filteredMarketing++;
          if (classification.isGenericMailbox) filteredGeneric++;
          if (classification.isAutomation) filteredAutomation++;

          const parts = data.name?.split(/\s+/) || [];
          const domain = email.split('@')[1] || null;

          newContacts.push({
            owner_id: userId,
            email,
            full_name: data.name || email.split('@')[0],
            first_name: parts[0] || email.split('@')[0],
            last_name: parts.slice(1).join(' ') || '',
            source: 'gmail',
            category: 'uncategorized',
            is_likely_marketing: classification.isLikelyMarketing || classification.isAutomation,
            is_generic_mailbox: classification.isGenericMailbox,
            filter_reason: classification.reason || null,
            email_domain: domain,
          });
        }
      }

      console.log(`[Sync] Email classification: ${filteredMarketing} marketing, ${filteredGeneric} generic, ${filteredAutomation} automation out of ${emailContactMap.size} unique emails`);

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

      // Store ALL email interactions (contact_id is nullable, we'll link later)
      const emailBatch = messages
        .filter(msg => {
          const email = extractEmail(msg.direction === 'sent' ? msg.to[0] : msg.from);
          return email !== userEmail; // Store all emails except self
        })
        .map(msg => {
          const contactEmail = extractEmail(msg.direction === 'sent' ? msg.to[0] : msg.from);
          const contactId = contactIdByEmail.get(contactEmail) || null;
          return {
            owner_id: userId,
            contact_id: contactId, // May be null if contact doesn't exist yet
            contact_email: contactEmail, // Always store the email for later linking
            gmail_message_id: msg.id,
            thread_id: msg.threadId,
            subject: msg.subject || '',
            snippet: msg.snippet || '',
            direction: msg.direction,
            email_date: msg.dateIso,
          };
        });

      console.log(`[Sync] Storing ${emailBatch.length} email interactions (${emailBatch.filter(e => e.contact_id).length} with contacts, ${emailBatch.filter(e => !e.contact_id).length} unmatched)`);

      let emailCount = 0;
      let emailErrors = 0;
      for (let i = 0; i < emailBatch.length; i += 100) {
        const batch = emailBatch.slice(i, i + 100);
        const { error } = await supabase
          .from('email_interactions')
          .upsert(batch, { onConflict: 'gmail_message_id' });
        if (error) {
          emailErrors++;
          if (emailErrors <= 3) console.error(`[Sync] Email batch error: ${error.message}`);
        } else {
          emailCount += batch.length;
        }
      }

      console.log(`[Sync] Stored ${emailCount} emails (${emailErrors} batch errors)`);

      // Store ALL calendar interactions (contact_id is nullable, we'll link later)
      const calendarBatch: Array<{
        owner_id: string;
        contact_id: string | null;
        contact_email: string;
        gcal_event_id: string;
        summary: string;
        event_start: string;
        event_end: string | null;
      }> = [];

      for (const event of events) {
        for (const attendeeEmail of event.attendees) {
          const email = extractEmail(attendeeEmail);
          if (email === userEmail) continue;
          const contactId = contactIdByEmail.get(email) || null;
          calendarBatch.push({
            owner_id: userId,
            contact_id: contactId, // May be null if contact doesn't exist yet
            contact_email: email, // Always store email for later linking
            gcal_event_id: `${event.id}_${email}`,
            summary: event.summary || '',
            event_start: event.startIso,
            event_end: event.endIso,
          });
        }
      }

      console.log(`[Sync] Storing ${calendarBatch.length} calendar interactions (${calendarBatch.filter(e => e.contact_id).length} with contacts, ${calendarBatch.filter(e => !e.contact_id).length} unmatched)`);

      let meetingCount = 0;
      let meetingErrors = 0;
      for (let i = 0; i < calendarBatch.length; i += 100) {
        const batch = calendarBatch.slice(i, i + 100);
        const { error } = await supabase
          .from('calendar_interactions')
          .upsert(batch, { onConflict: 'gcal_event_id' });
        if (error) {
          meetingErrors++;
          if (meetingErrors <= 3) console.error(`[Sync] Calendar batch error: ${error.message}`);
        } else {
          meetingCount += batch.length;
        }
      }

      console.log(`[Sync] Stored ${meetingCount} meetings (${meetingErrors} batch errors)`);
      console.log(`[Sync] Store-data complete: ${created} contacts created, ${emailCount} emails, ${meetingCount} meetings`);

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
