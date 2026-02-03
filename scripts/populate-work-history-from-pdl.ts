import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// Load .env.local manually
const envContent = fs.readFileSync('.env.local', 'utf-8');
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    process.env[key.trim()] = valueParts.join('=').trim();
  }
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

interface PDLExperience {
  title?: { name?: string };
  company?: {
    name?: string;
    website?: string;
    industry?: string;
    size?: string;
    linkedin_url?: string;
  };
  start_date?: string;
  end_date?: string | null;
  is_primary?: boolean;
}

interface PDLData {
  experience?: PDLExperience[];
  industry?: string;
}

async function populateWorkHistory() {
  console.log('=== Populating Work History from PDL Data ===\n');

  // Get contacts with pdl_data
  let page = 0;
  let totalProcessed = 0;
  let totalWorkHistoryInserted = 0;
  let totalContactsUpdated = 0;
  let errors = 0;

  while (true) {
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, full_name, pdl_data, enriched, current_company_industry')
      .not('pdl_data', 'is', null)
      .range(page * 100, (page + 1) * 100 - 1);

    if (error) {
      console.error('Error fetching contacts:', error);
      break;
    }

    if (!contacts || contacts.length === 0) break;

    console.log(`Processing batch ${page + 1} (${contacts.length} contacts)...`);

    for (const contact of contacts) {
      try {
        const pdlData = contact.pdl_data as PDLData;
        const experiences = pdlData?.experience || [];

        // Insert work history entries
        if (experiences.length > 0) {
          const workHistoryEntries = experiences.map((exp: PDLExperience) => ({
            contact_id: contact.id,
            company_name: exp.company?.name || 'Unknown',
            company_industry: exp.company?.industry || null,
            company_size: exp.company?.size || null,
            company_linkedin_url: exp.company?.linkedin_url || null,
            title: exp.title?.name || 'Unknown',
            start_date: exp.start_date ? new Date(exp.start_date + '-01') : null,
            end_date: exp.end_date ? new Date(exp.end_date + '-01') : null,
            is_current: !exp.end_date || exp.is_primary === true,
          }));

          // Delete existing work history for this contact first
          await supabase
            .from('work_history')
            .delete()
            .eq('contact_id', contact.id);

          // Insert new work history
          const { error: insertError } = await supabase
            .from('work_history')
            .insert(workHistoryEntries);

          if (insertError) {
            console.error(`Error inserting work history for ${contact.full_name}:`, insertError.message);
            errors++;
          } else {
            totalWorkHistoryInserted += experiences.length;
          }
        }

        // Update contact's enriched flag and industry
        const updates: Record<string, unknown> = {
          enriched: true,
          enriched_at: contact.enriched ? undefined : new Date().toISOString(),
        };

        // Set industry from PDL data if not already set
        if (!contact.current_company_industry && pdlData?.industry) {
          updates.current_company_industry = pdlData.industry;
        }

        // Update contact
        const { error: updateError } = await supabase
          .from('contacts')
          .update(updates)
          .eq('id', contact.id);

        if (updateError) {
          console.error(`Error updating ${contact.full_name}:`, updateError.message);
          errors++;
        } else {
          totalContactsUpdated++;
        }

        totalProcessed++;
      } catch (err) {
        console.error(`Error processing ${contact.full_name}:`, err);
        errors++;
      }
    }

    page++;
  }

  console.log('\n=== Complete ===');
  console.log(`Contacts processed: ${totalProcessed}`);
  console.log(`Contacts updated: ${totalContactsUpdated}`);
  console.log(`Work history entries inserted: ${totalWorkHistoryInserted}`);
  console.log(`Errors: ${errors}`);

  // Verify
  const { count: workHistoryCount } = await supabase
    .from('work_history')
    .select('*', { count: 'exact', head: true });

  const { count: enrichedCount } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('enriched', true);

  console.log(`\nVerification:`);
  console.log(`  Work history rows: ${workHistoryCount}`);
  console.log(`  Enriched contacts: ${enrichedCount}`);
}

populateWorkHistory().catch(console.error);
