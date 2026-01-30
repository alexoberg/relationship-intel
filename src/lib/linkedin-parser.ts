import Papa from 'papaparse';
import { LinkedInConnection } from '@/types/database';

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

export function parseLinkedInCSV(csvContent: string): Promise<ParseResult> {
  return new Promise((resolve) => {
    const errors: string[] = [];
    const contacts: ParsedContact[] = [];

    Papa.parse<LinkedInConnection>(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        const totalRows = results.data.length;

        results.data.forEach((row, index) => {
          try {
            // LinkedIn CSVs can have different column names
            const firstName = row['First Name'] || row['FirstName'] || row['first_name'] || '';
            const lastName = row['Last Name'] || row['LastName'] || row['last_name'] || '';
            const email = row['Email Address'] || row['Email'] || row['email'] || null;
            const company = row['Company'] || row['company'] || null;
            const position = row['Position'] || row['Title'] || row['position'] || null;
            const connectedOn = row['Connected On'] || row['ConnectedOn'] || null;
            const profileUrl = row['Profile URL'] || row['URL'] || row['LinkedIn URL'] || null;

            // Skip if no name
            if (!firstName && !lastName) {
              errors.push(`Row ${index + 1}: Missing name`);
              return;
            }

            const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

            contacts.push({
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              full_name: fullName,
              email: email?.trim() || null,
              current_company: company?.trim() || null,
              current_title: position?.trim() || null,
              connected_on: connectedOn ? parseLinkedInDate(connectedOn) : null,
              linkedin_url: profileUrl?.trim() || null,
            });
          } catch (err) {
            errors.push(`Row ${index + 1}: ${err instanceof Error ? err.message : 'Parse error'}`);
          }
        });

        resolve({
          success: contacts.length > 0,
          contacts,
          errors,
          totalRows,
          validRows: contacts.length,
        });
      },
      error: (error: Error) => {
        resolve({
          success: false,
          contacts: [],
          errors: [error.message],
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
