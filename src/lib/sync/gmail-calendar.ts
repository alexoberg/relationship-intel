/**
 * Gmail/Calendar Sync Core Logic
 *
 * Shared sync logic used by both:
 * - API route (quick sync, 60s timeout)
 * - Inngest function (background sync, unlimited)
 *
 * This module handles:
 * - Extracting contacts from Gmail/Calendar
 * - Creating email/calendar interaction records
 * - Updating sync timestamps
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { classifyEmail } from '@/lib/email-filter';

export interface GmailMessage {
  id: string;
  threadId: string;
  subject: string;
  snippet: string;
  from: string;
  to: string[];
  date: Date;
  direction: 'sent' | 'received';
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: Date;
  end: Date | null;
  attendees: string[];
}

export interface SyncResult {
  contactsCreated: number;
  emailsSynced: number;
  meetingsSynced: number;
  uniqueEmailsFound: number;
}

/**
 * Extract email from "Name <email>" format
 */
export function extractEmail(str: string): string {
  const match = str.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase().trim();
  return str.toLowerCase().trim();
}

/**
 * Extract email and name from header
 */
export function extractFromHeader(header: string): { email: string; name: string | null } {
  const emailMatch = header.match(/<([^>]+)>/);
  const nameMatch = header.match(/^([^<]+)</);

  return {
    email: emailMatch ? emailMatch[1].trim().toLowerCase() : header.trim().toLowerCase(),
    name: nameMatch ? nameMatch[1].trim() : null,
  };
}

/**
 * Process Gmail messages and calendar events into contacts and interactions
 */
export async function processSyncData(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  messages: GmailMessage[],
  events: CalendarEvent[],
  options: {
    teamId?: string;
    includeEmailClassification?: boolean;
  } = {}
): Promise<SyncResult> {
  const { teamId, includeEmailClassification = true } = options;

  // Extract unique emails from messages and events
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
    (existingContacts || []).filter((c) => c.email).map((c) => c.email!.toLowerCase())
  );

  // Build new contacts array
  const newContacts: Array<Record<string, unknown>> = [];

  for (const [email, data] of emailContactMap) {
    if (existingEmails.has(email)) continue;

    const parts = data.name?.split(/\s+/) || [];
    const domain = email.split('@')[1] || null;

    const contact: Record<string, unknown> = {
      owner_id: userId,
      email,
      full_name: data.name || email.split('@')[0],
      first_name: parts[0] || email.split('@')[0],
      last_name: parts.slice(1).join(' ') || '',
      source: 'gmail',
      category: 'uncategorized',
      email_domain: domain,
    };

    if (teamId) {
      contact.team_id = teamId;
    }

    // Add email classification if enabled
    if (includeEmailClassification) {
      const classification = classifyEmail(email);
      contact.is_likely_marketing = classification.isLikelyMarketing || classification.isAutomation;
      contact.is_generic_mailbox = classification.isGenericMailbox;
      contact.filter_reason = classification.reason || null;
    }

    newContacts.push(contact);
  }

  // Insert new contacts in batches
  let contactsCreated = 0;
  for (let i = 0; i < newContacts.length; i += 100) {
    const batch = newContacts.slice(i, i + 100);
    const { error } = await supabase.from('contacts').upsert(batch, { onConflict: 'owner_id,email' });
    if (!error) contactsCreated += batch.length;
  }

  // Refresh contacts list to get IDs
  const { data: allContacts } = await supabase
    .from('contacts')
    .select('id, email')
    .eq('owner_id', userId);

  const contactIdByEmail = new Map<string, string>();
  (allContacts || []).forEach((c) => {
    if (c.email) contactIdByEmail.set(c.email.toLowerCase(), c.id);
  });

  // Store email interactions
  const emailBatch: Array<Record<string, unknown>> = [];
  for (const msg of messages) {
    const rawHeader = msg.direction === 'sent' ? msg.to[0] : msg.from;
    const contactEmail = extractEmail(rawHeader);
    if (contactEmail === userEmail) continue;

    const contactId = contactIdByEmail.get(contactEmail);
    emailBatch.push({
      owner_id: userId,
      contact_id: contactId || null,
      contact_email: contactEmail,
      gmail_message_id: msg.id,
      thread_id: msg.threadId,
      subject: msg.subject || '',
      snippet: msg.snippet || '',
      direction: msg.direction,
      email_date: msg.date.toISOString(),
    });
  }

  let emailsSynced = 0;
  for (let i = 0; i < emailBatch.length; i += 100) {
    const batch = emailBatch.slice(i, i + 100);
    const { error } = await supabase
      .from('email_interactions')
      .upsert(batch, { onConflict: 'gmail_message_id' });
    if (!error) emailsSynced += batch.length;
  }

  // Store calendar interactions
  const calendarBatch: Array<Record<string, unknown>> = [];
  for (const event of events) {
    for (const attendeeRaw of event.attendees) {
      const contactEmail = extractEmail(attendeeRaw);
      if (contactEmail === userEmail) continue;

      const contactId = contactIdByEmail.get(contactEmail);
      calendarBatch.push({
        owner_id: userId,
        contact_id: contactId || null,
        contact_email: contactEmail,
        gcal_event_id: `${event.id}_${contactEmail}`,
        summary: event.summary || '',
        event_start: event.start.toISOString(),
        event_end: event.end?.toISOString() || null,
      });
    }
  }

  let meetingsSynced = 0;
  for (let i = 0; i < calendarBatch.length; i += 100) {
    const batch = calendarBatch.slice(i, i + 100);
    const { error } = await supabase
      .from('calendar_interactions')
      .upsert(batch, { onConflict: 'gcal_event_id' });
    if (!error) meetingsSynced += batch.length;
  }

  return {
    contactsCreated,
    emailsSynced,
    meetingsSynced,
    uniqueEmailsFound: emailContactMap.size,
  };
}

/**
 * Update sync timestamps for a user
 */
export async function updateSyncTimestamps(
  supabase: SupabaseClient,
  userId: string,
  timestamp: Date = new Date()
): Promise<void> {
  await supabase
    .from('profiles')
    .update({
      last_gmail_sync_at: timestamp.toISOString(),
      last_calendar_sync_at: timestamp.toISOString(),
    })
    .eq('id', userId);
}
