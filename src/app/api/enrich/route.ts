import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { enrichByEmail, enrichByLinkedIn, extractWorkHistory } from '@/lib/pdl';
import { categorizeByRules } from '@/lib/categorization';
import { Contact, KnownFirm } from '@/types/database';

export async function POST(request: NextRequest) {
  try {
    const { contactIds } = await request.json();

    if (!contactIds || !Array.isArray(contactIds)) {
      return NextResponse.json(
        { success: false, error: 'contactIds array required' },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch contacts
    const { data: contacts, error: fetchError } = await supabase
      .from('contacts')
      .select('*')
      .in('id', contactIds)
      .eq('owner_id', user.id);

    if (fetchError || !contacts) {
      return NextResponse.json(
        { success: false, error: fetchError?.message || 'Failed to fetch contacts' },
        { status: 500 }
      );
    }

    // Fetch known firms for categorization
    const { data: knownFirms } = await supabase
      .from('known_firms')
      .select('*');

    let enrichedCount = 0;
    let categorizedCount = 0;
    const errors: string[] = [];

    for (const contact of contacts) {
      try {
        // Try enrichment
        let result;

        if (contact.linkedin_url) {
          result = await enrichByLinkedIn(contact.linkedin_url);
        } else if (contact.email) {
          result = await enrichByEmail(contact.email);
        } else {
          errors.push(`${contact.full_name}: No email or LinkedIn URL`);
          continue;
        }

        if (!result.success || !result.person) {
          // Still mark as enriched (attempted) but no data found
          await supabase
            .from('contacts')
            .update({
              enriched: true,
              enriched_at: new Date().toISOString(),
            })
            .eq('id', contact.id);
          continue;
        }

        const person = result.person;

        // Extract and save work history
        const workHistory = extractWorkHistory(person);

        if (workHistory.length > 0) {
          const workHistoryRecords = workHistory.map((job) => ({
            contact_id: contact.id,
            ...job,
          }));

          await supabase.from('work_history').insert(workHistoryRecords);
        }

        // Update contact with enriched data
        const currentJob = workHistory.find((j) => j.is_current) || workHistory[0];

        const updateData: Partial<Contact> = {
          enriched: true,
          enriched_at: new Date().toISOString(),
          pdl_id: person.id,
          current_title: person.job_title || currentJob?.title || contact.current_title,
          current_company: person.job_company_name || currentJob?.company_name || contact.current_company,
          current_company_industry: person.job_company_industry || currentJob?.company_industry || null,
          email: contact.email || person.work_email || person.personal_emails?.[0] || null,
          linkedin_url: contact.linkedin_url || person.linkedin_url || null,
        };

        // Categorize based on enriched data
        const categorization = categorizeByRules(
          { ...contact, ...updateData },
          workHistory.map((j) => ({
            ...j,
            id: '',
            contact_id: contact.id,
            created_at: new Date().toISOString(),
            // Add new normalization fields with defaults
            company_normalized: null,
            company_domain: null,
            title_normalized: null,
            role_category: null,
            seniority_level: null,
          })),
          (knownFirms || []) as KnownFirm[]
        );

        if (categorization.category !== 'uncategorized') {
          updateData.category = categorization.category;
          updateData.category_confidence = categorization.confidence;
          updateData.category_source = 'rules';
          categorizedCount++;
        }

        await supabase
          .from('contacts')
          .update(updateData)
          .eq('id', contact.id);

        enrichedCount++;
      } catch (err) {
        errors.push(
          `${contact.full_name}: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return NextResponse.json({
      success: true,
      enriched: enrichedCount,
      categorized: categorizedCount,
      errors,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
