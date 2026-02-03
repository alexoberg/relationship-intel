/**
 * Backfill job_history JSONB and company_history arrays from work_history table
 *
 * The PDL enrichment saved data to work_history table but didn't update
 * the job_history JSONB and company_history fields on contacts.
 * This script backfills those fields for prospect matching.
 *
 * Run with: npx tsx scripts/backfill-job-history.ts
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qqfqpjjquiktljofctby.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxZnFwampxdWlrdGxqb2ZjdGJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTcxODIzNCwiZXhwIjoyMDg1Mjk0MjM0fQ.SMjpxJ1heQlfjnw7QEQkMtrhz60lqE-KpglZmcV7nKA';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface WorkHistoryRecord {
  contact_id: string;
  company_name: string;
  company_industry: string | null;
  company_linkedin_url: string | null;
  title: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
}

/**
 * Extract domain from LinkedIn company URL or generate from company name
 */
function extractDomain(linkedinUrl: string | null, companyName: string): string {
  if (linkedinUrl) {
    // Extract company slug from LinkedIn URL and use as domain
    const match = linkedinUrl.match(/linkedin\.com\/company\/([^\/]+)/i);
    if (match) {
      return match[1].toLowerCase() + '.com';
    }
  }
  // Fallback: normalize company name to create a pseudo-domain
  return companyName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';
}

/**
 * Normalize company name for matching
 */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/,?\s*(inc\.?|llc|ltd\.?|corp\.?|corporation|company|co\.?)$/i, '')
    .replace(/[^\w\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

async function backfillJobHistory() {
  console.log('Starting job_history backfill...');

  // Get all enriched contacts with work_history records
  const { data: enrichedContacts, error: contactsError } = await supabase
    .from('contacts')
    .select('id, full_name')
    .eq('enriched', true)
    .not('pdl_id', 'is', null);

  if (contactsError || !enrichedContacts) {
    console.error('Failed to fetch enriched contacts:', contactsError);
    return;
  }

  console.log(`Found ${enrichedContacts.length} enriched contacts to process`);

  let updated = 0;
  let errors = 0;

  let skippedNoHistory = 0;

  for (const contact of enrichedContacts) {
    try {
      // Get work history for this contact
      const { data: workHistory, error: whError } = await supabase
        .from('work_history')
        .select('company_name, company_industry, company_linkedin_url, title, start_date, end_date, is_current')
        .eq('contact_id', contact.id)
        .order('is_current', { ascending: false })
        .order('start_date', { ascending: false });

      if (whError) {
        console.error(`Error fetching work_history for ${contact.full_name}:`, whError.message);
        errors++;
        continue;
      }

      if (!workHistory || workHistory.length === 0) {
        skippedNoHistory++;
        continue; // Skip if no work history
      }

      // Debug first few
      if (updated < 3) {
        console.log(`Processing ${contact.full_name} with ${workHistory.length} work_history records`);
      }

      // Build job_history JSONB
      const jobHistoryJson = workHistory.map((wh: WorkHistoryRecord) => ({
        company: wh.company_name,
        domain: extractDomain(wh.company_linkedin_url, wh.company_name),
        title: wh.title,
        start_date: wh.start_date,
        end_date: wh.end_date,
        is_current: wh.is_current,
      }));

      // Build company_history array (unique normalized names)
      const companyHistory = [...new Set(
        workHistory
          .map((wh: WorkHistoryRecord) => normalizeCompanyName(wh.company_name))
          .filter((c): c is string => !!c && c.length > 0)
      )];

      // Calculate earliest work date and career years
      const workDates = workHistory
        .map((wh: WorkHistoryRecord) => wh.start_date)
        .filter((d): d is string => !!d)
        .map(d => new Date(d))
        .filter(d => !isNaN(d.getTime()));

      const earliestWorkDate = workDates.length > 0
        ? new Date(Math.min(...workDates.map(d => d.getTime())))
        : null;

      const careerYears = earliestWorkDate
        ? (Date.now() - earliestWorkDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        : null;

      // Update contact
      const { error: updateError } = await supabase
        .from('contacts')
        .update({
          job_history: jobHistoryJson,
          company_history: companyHistory,
          company_history_count: companyHistory.length,
          earliest_work_date: earliestWorkDate?.toISOString().split('T')[0] || null,
          career_years: careerYears ? Math.round(careerYears * 10) / 10 : null,
        })
        .eq('id', contact.id);

      if (updateError) {
        console.error(`Failed to update ${contact.full_name}:`, updateError.message);
        errors++;
      } else {
        updated++;
      }

      // Progress logging every 100
      if (updated % 100 === 0) {
        console.log(`Progress: ${updated} contacts updated...`);
      }
    } catch (err) {
      console.error(`Error processing ${contact.full_name}:`, err);
      errors++;
    }
  }

  console.log('\n=== BACKFILL COMPLETE ===');
  console.log(`Updated: ${updated} contacts`);
  console.log(`Skipped (no work_history): ${skippedNoHistory}`);
  console.log(`Errors: ${errors}`);
}

backfillJobHistory()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
