import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { LinkedInConnection, ContactSource } from '@/types/database';

interface ImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

function parseLinkedInDate(dateStr: string): Date | null {
  // Format: "26 Jan 2026"
  if (!dateStr) return null;
  const parts = dateStr.trim().split(' ');
  if (parts.length !== 3) return null;

  const months: Record<string, number> = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
  };

  const day = parseInt(parts[0], 10);
  const month = months[parts[1]];
  const year = parseInt(parts[2], 10);

  if (isNaN(day) || month === undefined || isNaN(year)) return null;
  return new Date(year, month, day);
}

function parseCSV(csvText: string): LinkedInConnection[] {
  const lines = csvText.split('\n');

  // Skip the LinkedIn header notes (first 3 lines)
  // Line 1: Notes:
  // Line 2: Explanation text
  // Line 3: Empty
  // Line 4: Actual header
  let headerIndex = lines.findIndex(line =>
    line.includes('First Name') && line.includes('Last Name')
  );

  if (headerIndex === -1) {
    throw new Error('Could not find CSV header row');
  }

  const headers = lines[headerIndex].split(',').map(h => h.trim());
  const connections: LinkedInConnection[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Handle CSV values (basic - handles quoted commas)
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const connection: LinkedInConnection = {};
    headers.forEach((header, idx) => {
      connection[header] = values[idx] || '';
    });

    connections.push(connection);
  }

  return connections;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { csvData } = body;

    if (!csvData) {
      return NextResponse.json({ error: 'Missing csvData' }, { status: 400 });
    }

    // Parse the CSV
    const connections = parseCSV(csvData);

    const result: ImportResult = {
      total: connections.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    // Process each connection
    for (const conn of connections) {
      const firstName = conn['First Name']?.trim() || '';
      const lastName = conn['Last Name']?.trim() || '';
      const fullName = `${firstName} ${lastName}`.trim();

      if (!fullName) {
        result.skipped++;
        continue;
      }

      const linkedinUrl = conn['URL']?.trim() || null;
      const email = conn['Email Address']?.trim() || null;
      const company = conn['Company']?.trim() || null;
      const position = conn['Position']?.trim() || null;
      const connectedOn = conn['Connected On'];

      // Build the contact record
      const contactData = {
        owner_id: user.id,
        first_name: firstName || null,
        last_name: lastName || null,
        full_name: fullName,
        email: email || null,
        linkedin_url: linkedinUrl,
        current_title: position,
        current_company: company,
        source: 'linkedin_csv' as ContactSource,
        // Parse connected date for created_at if we want to track connection history
      };

      try {
        // Try to upsert - update if linkedin_url exists, otherwise insert
        if (linkedinUrl) {
          const { data: existing } = await supabase
            .from('contacts')
            .select('id')
            .eq('owner_id', user.id)
            .eq('linkedin_url', linkedinUrl)
            .single();

          if (existing) {
            // Update existing contact
            const { error: updateError } = await supabase
              .from('contacts')
              .update({
                first_name: contactData.first_name,
                last_name: contactData.last_name,
                full_name: contactData.full_name,
                email: contactData.email || undefined,
                current_title: contactData.current_title,
                current_company: contactData.current_company,
                updated_at: new Date().toISOString()
              })
              .eq('id', existing.id);

            if (updateError) {
              result.errors.push(`Error updating ${fullName}: ${updateError.message}`);
            } else {
              result.updated++;
            }
          } else {
            // Insert new contact
            const { error: insertError } = await supabase
              .from('contacts')
              .insert(contactData);

            if (insertError) {
              // Handle unique constraint on email
              if (insertError.code === '23505' && email) {
                result.skipped++; // Duplicate email
              } else {
                result.errors.push(`Error creating ${fullName}: ${insertError.message}`);
              }
            } else {
              result.created++;
            }
          }
        } else if (email) {
          // No LinkedIn URL but has email - check by email
          const { data: existing } = await supabase
            .from('contacts')
            .select('id')
            .eq('owner_id', user.id)
            .eq('email', email)
            .single();

          if (existing) {
            const { error: updateError } = await supabase
              .from('contacts')
              .update({
                first_name: contactData.first_name,
                last_name: contactData.last_name,
                full_name: contactData.full_name,
                linkedin_url: contactData.linkedin_url,
                current_title: contactData.current_title,
                current_company: contactData.current_company,
                updated_at: new Date().toISOString()
              })
              .eq('id', existing.id);

            if (updateError) {
              result.errors.push(`Error updating ${fullName}: ${updateError.message}`);
            } else {
              result.updated++;
            }
          } else {
            const { error: insertError } = await supabase
              .from('contacts')
              .insert(contactData);

            if (insertError) {
              result.errors.push(`Error creating ${fullName}: ${insertError.message}`);
            } else {
              result.created++;
            }
          }
        } else {
          // No email or LinkedIn URL - insert (may have duplicates by name)
          const { error: insertError } = await supabase
            .from('contacts')
            .insert(contactData);

          if (insertError) {
            result.errors.push(`Error creating ${fullName}: ${insertError.message}`);
          } else {
            result.created++;
          }
        }
      } catch (err) {
        result.errors.push(`Exception for ${fullName}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      result
    });

  } catch (error) {
    console.error('[LinkedIn Import] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Import failed'
    }, { status: 500 });
  }
}
