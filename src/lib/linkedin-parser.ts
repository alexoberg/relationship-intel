/**
 * LinkedIn CSV Parser v3.0
 * Completely rewritten to fix caching issues
 */
import Papa from 'papaparse';
import { LinkedInConnection } from '@/types/database';

// Version identifier for debugging
export const PARSER_VERSION = 'v3.0-20260129-fix';

export interface ParsedContact {
  first_name: string;
  last_name: string;
  full_name: string;
  email: string | null;
  current_company: string | null;
  current_title: string | null;
  connected_on: Date | null;
  linkedin_url: string | null;
}

export interface ParseResult {
  success: boolean;
  contacts: ParsedContact[];
  errors: string[];
  totalRows: number;
  validRows: number;
}

// Find the header row index in LinkedIn CSV (skips notes at top)
function findHeaderRowIndex(lines: string[]): number {
  const maxLinesToCheck = Math.min(15, lines.length);
  for (let idx = 0; idx < maxLinesToCheck; idx++) {
    const currentLine = lines[idx].trim().toLowerCase();
    if (currentLine.startsWith('first name') || currentLine.startsWith('"first name')) {
      return idx;
    }
  }
  return 0;
}

// Extract contact from a parsed CSV row
function extractContactFromRow(row: LinkedInConnection): ParsedContact | null {
  const firstName = String(row['First Name'] || row['FirstName'] || row['first_name'] || '').trim();
  const lastName = String(row['Last Name'] || row['LastName'] || row['last_name'] || '').trim();

  // SILENTLY skip rows without names - no error, no warning
  if (!firstName && !lastName) {
    return null;
  }

  // SILENTLY skip metadata rows
  if (firstName.includes(':') || firstName.length > 50) {
    return null;
  }

  const email = row['Email Address'] || row['Email'] || row['email'] || null;
  const company = row['Company'] || row['company'] || null;
  const position = row['Position'] || row['Title'] || row['position'] || null;
  const connectedOn = row['Connected On'] || row['ConnectedOn'] || null;
  const profileUrl = row['URL'] || row['Profile URL'] || row['LinkedIn URL'] || null;

  return {
    first_name: firstName,
    last_name: lastName,
    full_name: [firstName, lastName].filter(Boolean).join(' ').trim(),
    email: email ? String(email).trim() : null,
    current_company: company ? String(company).trim() : null,
    current_title: position ? String(position).trim() : null,
    connected_on: connectedOn ? parseLinkedInDate(String(connectedOn)) : null,
    linkedin_url: profileUrl ? String(profileUrl).trim() : null,
  };
}

export function parseLinkedInCSV(csvContent: string): Promise<ParseResult> {
  // Log version for debugging
  console.log('[LinkedIn Parser]', PARSER_VERSION);

  return new Promise((resolve) => {
    const parseErrors: string[] = [];
    const validContacts: ParsedContact[] = [];

    // Split and find where real data starts
    const allLines = csvContent.split('\n');
    const headerIndex = findHeaderRowIndex(allLines);
    const csvWithoutNotes = allLines.slice(headerIndex).join('\n');

    Papa.parse<LinkedInConnection>(csvWithoutNotes, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
      complete: (parseResult) => {
        let skipped = 0;

        parseResult.data.forEach((csvRow) => {
          const contact = extractContactFromRow(csvRow);
          if (contact) {
            validContacts.push(contact);
          } else {
            skipped++;
          }
        });

        if (skipped > 0) {
          console.log(`[LinkedIn Parser] Silently skipped ${skipped} empty/metadata rows`);
        }

        resolve({
          success: validContacts.length > 0,
          contacts: validContacts,
          errors: parseErrors,
          totalRows: parseResult.data.length,
          validRows: validContacts.length,
        });
      },
      error: (err: Error) => {
        resolve({
          success: false,
          contacts: [],
          errors: [err.message],
          totalRows: 0,
          validRows: 0,
        });
      },
    });
  });
}

function parseLinkedInDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // LinkedIn formats: "01 Jan 2024", "Jan 1, 2024", "2024-01-01"
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

// Generate a pseudo LinkedIn URL from name if not provided
export function generateLinkedInUrl(firstName: string, lastName: string): string {
  const slug = `${firstName}-${lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
  return `https://linkedin.com/in/${slug}`;
}

// Deduplicate contacts by email or LinkedIn URL
export function deduplicateContacts(contacts: ParsedContact[]): ParsedContact[] {
  const seen = new Set<string>();
  const unique: ParsedContact[] = [];

  contacts.forEach((contact) => {
    const key = contact.email?.toLowerCase() || contact.linkedin_url?.toLowerCase() || contact.full_name.toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(contact);
    }
  });

  return unique;
}

// Validate and clean contact data
export function validateContact(contact: ParsedContact): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!contact.full_name || contact.full_name.length < 2) {
    errors.push('Name is required');
  }

  if (contact.email && !isValidEmail(contact.email)) {
    errors.push('Invalid email format');
  }

  if (contact.linkedin_url && !isValidLinkedInUrl(contact.linkedin_url)) {
    errors.push('Invalid LinkedIn URL');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidLinkedInUrl(url: string): boolean {
  return /linkedin\.com\/(in|pub)\/[a-zA-Z0-9-]+/i.test(url);
}
