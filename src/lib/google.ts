import { google } from 'googleapis';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export function getGoogleAuthUrl(): string {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`
  );

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

export async function getGoogleTokens(code: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`
  );

  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

export function createGoogleClient(accessToken: string, refreshToken?: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return oauth2Client;
}

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

export async function fetchGmailMessages(
  accessToken: string,
  refreshToken: string | undefined,
  maxResults: number = 500
): Promise<GmailMessage[]> {
  const auth = createGoogleClient(accessToken, refreshToken);
  const gmail = google.gmail({ version: 'v1', auth });

  const messages: GmailMessage[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults: Math.min(100, maxResults - messages.length),
        pageToken,
      });

      const messageIds = response.data.messages || [];

      for (const msg of messageIds) {
        if (messages.length >= maxResults) break;

        try {
          const detail = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id!,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date'],
          });

          const headers = detail.data.payload?.headers || [];
          const getHeader = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

          const from = getHeader('From');
          const to = getHeader('To');
          const subject = getHeader('Subject');
          const dateStr = getHeader('Date');

          // Determine direction based on "SENT" label
          const labels = detail.data.labelIds || [];
          const direction = labels.includes('SENT') ? 'sent' : 'received';

          messages.push({
            id: msg.id!,
            threadId: msg.threadId!,
            subject,
            snippet: detail.data.snippet || '',
            from: extractEmail(from),
            to: to.split(',').map((e) => extractEmail(e.trim())),
            date: new Date(dateStr),
            direction,
          });
        } catch (err) {
          console.error(`Failed to fetch message ${msg.id}:`, err);
        }
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken && messages.length < maxResults);

    return messages;
  } catch (error) {
    console.error('Failed to fetch Gmail messages:', error);
    throw error;
  }
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: Date;
  end: Date | null;
  attendees: string[];
}

export async function fetchCalendarEvents(
  accessToken: string,
  refreshToken: string | undefined,
  daysBack: number = 365
): Promise<CalendarEvent[]> {
  const auth = createGoogleClient(accessToken, refreshToken);
  const calendar = google.calendar({ version: 'v3', auth });

  const events: CalendarEvent[] = [];

  try {
    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - daysBack);

    let pageToken: string | undefined;

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

        events.push({
          id: event.id,
          summary: event.summary || 'No title',
          start: new Date(event.start.dateTime || event.start.date || ''),
          end: event.end
            ? new Date(event.end.dateTime || event.end.date || '')
            : null,
          attendees,
        });
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return events;
  } catch (error) {
    console.error('Failed to fetch calendar events:', error);
    throw error;
  }
}

// Extract email from "Name <email@example.com>" format
function extractEmail(str: string): string {
  const match = str.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  return str.toLowerCase().trim();
}

// Group interactions by email address
export function groupInteractionsByEmail(
  messages: GmailMessage[],
  events: CalendarEvent[]
): Map<string, { emails: GmailMessage[]; meetings: CalendarEvent[] }> {
  const grouped = new Map<string, { emails: GmailMessage[]; meetings: CalendarEvent[] }>();

  // Process emails
  messages.forEach((msg) => {
    const contacts =
      msg.direction === 'sent' ? msg.to : [msg.from];

    contacts.forEach((email) => {
      if (!grouped.has(email)) {
        grouped.set(email, { emails: [], meetings: [] });
      }
      grouped.get(email)!.emails.push(msg);
    });
  });

  // Process calendar events
  events.forEach((event) => {
    event.attendees.forEach((email) => {
      if (!grouped.has(email)) {
        grouped.set(email, { emails: [], meetings: [] });
      }
      grouped.get(email)!.meetings.push(event);
    });
  });

  return grouped;
}
