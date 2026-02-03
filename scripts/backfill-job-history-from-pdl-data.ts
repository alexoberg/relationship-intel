/**
 * Backfill job_history JSONB from pdl_data column
 * For contacts that have pdl_data but no job_history
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://qqfqpjjquiktljofctby.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxZnFwampxdWlrdGxqb2ZjdGJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTcxODIzNCwiZXhwIjoyMDg1Mjk0MjM0fQ.SMjpxJ1heQlfjnw7QEQkMtrhz60lqE-KpglZmcV7nKA';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface PDLExperience {
  title?: { name?: string };
  company?: {
    name?: string;
    website?: string;
  };
  start_date?: string;
  end_date?: string | null;
}

interface PDLData {
  experience?: PDLExperience[];
}

function normalizeCompanyName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/,?\s*(inc\.?|llc|ltd\.?|corp\.?|corporation|company|co\.?)$/i, '')
    .replace(/[^\w\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

function extractDomain(website: string | undefined, companyName: string): string {
  if (website) {
    return website
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];
  }
  return normalizeCompanyName(companyName).replace(/\s+/g, '') + '.com';
}

async function backfillFromPdlData() {
  console.log('Backfilling job_history from pdl_data...\n');

  // Get contacts with pdl_data but no job_history
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, full_name, pdl_data')
    .not('pdl_data', 'is', null)
    .or('job_history.is.null,job_history.eq.[]')
    .limit(500);

  if (error) {
    console.error('Error fetching contacts:', error.message);
    return;
  }

  console.log(`Found ${contacts?.length || 0} contacts to backfill\n`);

  let updated = 0;
  let skipped = 0;

  for (const contact of contacts || []) {
    const pdlData = contact.pdl_data as PDLData;
    const experience = pdlData?.experience || [];

    if (experience.length === 0) {
      skipped++;
      continue;
    }

    // Build job_history JSONB from experience
    const jobHistory = experience.map(exp => ({
      company: exp.company?.name || 'Unknown',
      domain: extractDomain(exp.company?.website, exp.company?.name || 'unknown'),
      title: exp.title?.name || 'Unknown',
      start_date: exp.start_date || null,
      end_date: exp.end_date || null,
      is_current: exp.end_date === null || exp.end_date === undefined,
    }));

    // Build company history
    const companyHistory = [...new Set(
      experience
        .map(exp => normalizeCompanyName(exp.company?.name || ''))
        .filter(c => c && c.length > 0)
    )];

    // Calculate career years
    const workDates = experience
      .map(exp => exp.start_date)
      .filter((d): d is string => !!d)
      .map(d => new Date(d + '-01'))
      .filter(d => !isNaN(d.getTime()));

    const earliestWorkDate = workDates.length > 0
      ? new Date(Math.min(...workDates.map(d => d.getTime())))
      : null;

    const careerYears = earliestWorkDate
      ? (Date.now() - earliestWorkDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      : null;

    const { error: updateError } = await supabase
      .from('contacts')
      .update({
        job_history: jobHistory,
        company_history: companyHistory,
        company_history_count: companyHistory.length,
        earliest_work_date: earliestWorkDate?.toISOString().split('T')[0] || null,
        career_years: careerYears ? Math.round(careerYears * 10) / 10 : null,
        enriched: true,
      })
      .eq('id', contact.id);

    if (updateError) {
      console.error(`Error updating ${contact.full_name}:`, updateError.message);
    } else {
      updated++;
      if (updated <= 5) {
        console.log(`Updated ${contact.full_name} with ${jobHistory.length} jobs`);
      }
    }
  }

  console.log('\n=== BACKFILL COMPLETE ===');
  console.log(`Updated: ${updated} contacts`);
  console.log(`Skipped (no experience): ${skipped}`);

  // Verify
  const { count: remaining } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .not('pdl_data', 'is', null)
    .or('job_history.is.null,job_history.eq.[]');

  const { count: withJobHistory } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .not('job_history', 'is', null)
    .not('job_history', 'eq', '[]');

  console.log(`\nRemaining without job_history: ${remaining}`);
  console.log(`Total with job_history: ${withJobHistory}`);
}

backfillFromPdlData()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
