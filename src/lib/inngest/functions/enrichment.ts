import { inngest } from '../client';
import { createAdminClient } from '@/lib/supabase/admin';
import { enrichByEmail, enrichByLinkedIn, extractWorkHistory } from '@/lib/pdl';
import { normalizeRoleAndSeniority } from '@/lib/normalization';
import { Contact, WorkHistory, EnrichmentBudget } from '@/types/database';

const PDL_COST_PER_LOOKUP = 0.05; // $0.05 per enrichment
const DEFAULT_BATCH_SIZE = 100;
const RATE_LIMIT_DELAY_MS = 150; // ~6 requests/second

/**
 * Main enrichment function - processes contacts in priority order
 * Respects budget limits and logs all costs
 */
export const enrichContacts = inngest.createFunction(
  {
    id: 'enrich-contacts',
    name: 'Enrich Contacts with PDL',
    concurrency: {
      limit: 1, // Only one enrichment job per user at a time
      key: 'event.data.userId',
    },
    retries: 3,
  },
  { event: 'enrichment/started' },
  async ({ event, step }) => {
    const { userId, batchSize = DEFAULT_BATCH_SIZE, priorityThreshold = 0 } = event.data;
    const supabase = createAdminClient();

    // Step 1: Check/create budget record
    const budget = await step.run('check-budget', async () => {
      // Get or create budget record
      let { data: budgetRecord } = await supabase
        .from('enrichment_budget')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!budgetRecord) {
        // Create default budget ($500 pre-authorized)
        const { data: newBudget } = await supabase
          .from('enrichment_budget')
          .insert({
            user_id: userId,
            authorized_amount: 500.00,
            increment_amount: 50.00,
            total_spent: 0,
            enrichments_count: 0,
          })
          .select()
          .single();
        budgetRecord = newBudget;
      }

      return budgetRecord as EnrichmentBudget;
    });

    if (!budget) {
      throw new Error('Failed to get or create budget record');
    }

    // Step 2: Check if we have budget remaining
    const remainingBudget = budget.authorized_amount - budget.total_spent;
    const maxEnrichments = Math.floor(remainingBudget / PDL_COST_PER_LOOKUP);

    if (maxEnrichments <= 0) {
      // Need to request more budget
      await step.run('request-budget-increase', async () => {
        await supabase
          .from('enrichment_budget')
          .update({
            pending_approval: true,
            pending_approval_amount: budget.increment_amount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', budget.id);
      });

      return {
        status: 'budget_exhausted',
        message: `Budget exhausted. $${budget.total_spent.toFixed(2)} spent of $${budget.authorized_amount.toFixed(2)} authorized.`,
        pendingApproval: budget.increment_amount,
      };
    }

    // Step 3: Get contacts to enrich (priority order, excluding marketing/generic)
    const actualBatchSize = Math.min(batchSize, maxEnrichments);

    const contacts = await step.run('get-priority-contacts', async () => {
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .eq('owner_id', userId)
        .eq('enriched', false)
        .eq('is_likely_marketing', false)  // Skip marketing emails
        .eq('is_generic_mailbox', false)   // Skip generic mailboxes
        .gte('enrichment_priority', priorityThreshold)
        .order('enrichment_priority', { ascending: false })
        .limit(actualBatchSize);

      return (data || []) as Contact[];
    });

    if (contacts.length === 0) {
      return {
        status: 'complete',
        message: 'No contacts to enrich (all enriched or below priority threshold)',
        enriched: 0,
      };
    }

    // Step 4: Process each contact
    let enrichedCount = 0;
    let totalCost = 0;
    const errors: string[] = [];

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];

      const result = await step.run(`enrich-contact-${i}`, async () => {
        // Rate limiting
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY_MS));
        }

        // Try to enrich
        let enrichResult;
        if (contact.linkedin_url) {
          enrichResult = await enrichByLinkedIn(contact.linkedin_url);
        } else if (contact.email) {
          enrichResult = await enrichByEmail(contact.email);
        } else {
          return { success: false, error: 'No email or LinkedIn URL', contact };
        }

        // Log the enrichment attempt (cost incurred even if no match)
        await supabase.from('enrichment_log').insert({
          user_id: userId,
          contact_id: contact.id,
          pdl_id: enrichResult.person?.id || null,
          pdl_status: enrichResult.success ? 200 : 404,
          cost_usd: PDL_COST_PER_LOOKUP,
          source: 'pdl',
          success: enrichResult.success,
          error_message: enrichResult.error || null,
        });

        // Update budget tracking with atomic increment (RPC call)
        await supabase.rpc('increment_enrichment_budget', {
          p_budget_id: budget.id,
          p_cost: PDL_COST_PER_LOOKUP,
        });

        return { ...enrichResult, contact };
      });

      totalCost += PDL_COST_PER_LOOKUP;

      if (!result.success || !result.person) {
        // Mark as enriched (attempted) even if no data found
        await step.run(`mark-enriched-${i}`, async () => {
          await supabase
            .from('contacts')
            .update({
              enriched: true,
              enriched_at: new Date().toISOString(),
            })
            .eq('id', contact.id);
        });

        if (result.error) {
          errors.push(`${contact.full_name}: ${result.error}`);
        }
        continue;
      }

      // Step 5: Process enrichment data
      await step.run(`process-enrichment-${i}`, async () => {
        const person = result.person!;
        const workHistory = extractWorkHistory(person);

        // Save work history with normalization
        if (workHistory.length > 0) {
          const normalizedHistory = await Promise.all(
            workHistory.map(async (job) => {
              const normalized = await normalizeRoleAndSeniority(job.title);
              return {
                contact_id: contact.id,
                company_name: job.company_name,
                company_normalized: normalizeCompanyName(job.company_name),
                company_industry: job.company_industry,
                company_size: job.company_size,
                company_linkedin_url: job.company_linkedin_url,
                company_domain: extractDomainFromLinkedIn(job.company_linkedin_url),
                title: job.title,
                title_normalized: normalized.normalizedTitle,
                role_category: normalized.roleCategory,
                seniority_level: normalized.seniorityLevel,
                start_date: job.start_date,
                end_date: job.end_date,
                is_current: job.is_current,
              };
            })
          );

          // Delete existing work history for this contact
          await supabase
            .from('work_history')
            .delete()
            .eq('contact_id', contact.id);

          // Insert new work history
          await supabase
            .from('work_history')
            .insert(normalizedHistory);
        }

        // Build company history array from work history
        const companyHistory = [...new Set(
          workHistory
            .map(j => normalizeCompanyName(j.company_name))
            .filter(c => c && c.length > 0)
        )];

        // Calculate earliest work date and career years
        const workDates = workHistory
          .map(j => j.start_date)
          .filter((d): d is string => !!d)
          .map(d => new Date(d))
          .filter(d => !isNaN(d.getTime()));

        const earliestWorkDate = workDates.length > 0
          ? new Date(Math.min(...workDates.map(d => d.getTime())))
          : null;

        const careerYears = earliestWorkDate
          ? (Date.now() - earliestWorkDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
          : null;

        // Update contact with enriched data INCLUDING company history AND job_history JSONB
        const currentJob = workHistory.find(j => j.is_current) || workHistory[0];

        // Build job_history JSONB for prospect matching (includes domain for matching)
        const jobHistoryJson = workHistory.map(job => ({
          company: job.company_name,
          domain: extractDomainFromLinkedIn(job.company_linkedin_url) ||
                  normalizeCompanyName(job.company_name).replace(/\s+/g, '') + '.com', // Fallback domain
          title: job.title,
          start_date: job.start_date,
          end_date: job.end_date,
          is_current: job.is_current,
        }));

        await supabase
          .from('contacts')
          .update({
            enriched: true,
            enriched_at: new Date().toISOString(),
            pdl_id: person.id,
            current_title: person.job_title || currentJob?.title || contact.current_title,
            current_company: person.job_company_name || currentJob?.company_name || contact.current_company,
            current_company_industry: person.job_company_industry || currentJob?.company_industry || null,
            email: contact.email || person.work_email || person.personal_emails?.[0] || null,
            linkedin_url: contact.linkedin_url || person.linkedin_url || null,
            // Company history fields
            company_history: companyHistory,
            company_history_count: companyHistory.length,
            earliest_work_date: earliestWorkDate?.toISOString().split('T')[0] || null,
            career_years: careerYears ? Math.round(careerYears * 10) / 10 : null,
            // Job history JSONB for prospect matching
            job_history: jobHistoryJson,
          })
          .eq('id', contact.id);
      });

      enrichedCount++;
    }

    // Send completion event
    await inngest.send({
      name: 'enrichment/completed',
      data: {
        userId,
        enrichedCount,
        totalCost,
        errors,
      },
    });

    return {
      status: 'success',
      enriched: enrichedCount,
      totalCost: totalCost.toFixed(2),
      budgetRemaining: (remainingBudget - totalCost).toFixed(2),
      errors,
    };
  }
);

/**
 * Normalize company name for consistent matching
 */
function normalizeCompanyName(name: string): string {
  if (!name) return '';

  return name
    .toLowerCase()
    .replace(/,?\s*(inc\.?|llc|ltd\.?|corp\.?|corporation|company|co\.?)$/i, '')
    .replace(/[^\w\s]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Extract domain from LinkedIn company URL
 */
function extractDomainFromLinkedIn(linkedinUrl: string | null): string | null {
  if (!linkedinUrl) return null;

  // LinkedIn company URLs are like: linkedin.com/company/google
  const match = linkedinUrl.match(/linkedin\.com\/company\/([^\/]+)/i);
  if (match) {
    // This gives us the company slug, not the domain
    // We'd need to do a separate lookup or use the company's website field
    return null;
  }
  return null;
}

// Export all functions
export const functions = [enrichContacts];
