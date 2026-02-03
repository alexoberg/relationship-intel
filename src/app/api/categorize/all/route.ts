import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  categorizeByRules,
} from '@/lib/categorization';
import {
  detectHelixProductFit,
  isHelixTargetContact,
  CompanyProfile,
} from '@/lib/helix-sales';
import { success, errors, withErrorHandling } from '@/lib/api';

// Helper to build company profile from contact data
function buildCompanyProfile(contact: {
  current_company?: string;
  current_company_industry?: string;
  company_domain?: string;
}): CompanyProfile {
  const industry = (contact.current_company_industry || '').toLowerCase();

  return {
    name: contact.current_company || 'Unknown',
    domain: contact.company_domain || '',
    industry: contact.current_company_industry,
    hasUserAccounts: true,
    hasAgeRestrictedContent:
      industry.includes('gaming') || industry.includes('adult') || industry.includes('gambling'),
    isTicketingPlatform:
      industry.includes('ticketing') ||
      industry.includes('events') ||
      industry.includes('entertainment'),
    isMarketplace: industry.includes('marketplace') || industry.includes('e-commerce'),
    isSocialPlatform: industry.includes('social') || industry.includes('community'),
    isGamingPlatform: industry.includes('gaming') || industry.includes('video games'),
  };
}

interface CategorizeAllData {
  processed: number;
  categorized: number;
  breakdown: {
    ruleBased: number;
    helixSales: number;
    skipped: number;
  };
  errors: string[];
}

/**
 * POST /api/categorize/all
 * Batch categorize all uncategorized contacts using rule-based categorization
 * This is faster than AI categorization and runs synchronously
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const { batchSize = 500 } = await request.json().catch(() => ({}));

    const supabase = await createClient();

    // Get current user
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return errors.unauthorized();
    }

    // Fetch uncategorized contacts
    const { data: contacts, error: fetchError } = await supabase
      .from('contacts')
      .select('*')
      .eq('owner_id', user.id)
      .eq('category', 'uncategorized')
      .eq('is_junk', false) // Skip junk contacts
      .limit(batchSize);

    if (fetchError || !contacts) {
      return errors.internal(fetchError?.message || 'Failed to fetch contacts');
    }

    if (contacts.length === 0) {
      return success<CategorizeAllData>({
        processed: 0,
        categorized: 0,
        breakdown: { ruleBased: 0, helixSales: 0, skipped: 0 },
        errors: [],
      });
    }

    // Fetch known firms for rule-based categorization
    const { data: knownFirms } = await supabase.from('known_firms').select('*');

    // Fetch all work history for these contacts in one query
    const contactIds = contacts.map((c) => c.id);
    const { data: allWorkHistory } = await supabase
      .from('work_history')
      .select('*')
      .in('contact_id', contactIds);

    // Group work history by contact
    const workHistoryByContact = new Map<string, typeof allWorkHistory>();
    (allWorkHistory || []).forEach((wh) => {
      const existing = workHistoryByContact.get(wh.contact_id) || [];
      existing.push(wh);
      workHistoryByContact.set(wh.contact_id, existing);
    });

    let ruleBasedCount = 0;
    let helixSalesCount = 0;
    let skippedCount = 0;
    const categorizeErrors: string[] = [];

    // Prepare batch updates
    const updates: Array<{
      id: string;
      category: string;
      category_confidence: number;
      category_source: string;
      category_reason: string | null;
      helix_products?: string[];
    }> = [];

    for (const contact of contacts) {
      try {
        const workHistory = workHistoryByContact.get(contact.id) || [];

        // STEP 1: Try rule-based categorization
        const ruleResult = categorizeByRules(contact, workHistory, knownFirms || []);

        if (ruleResult.category !== 'uncategorized' && ruleResult.confidence >= 0.7) {
          updates.push({
            id: contact.id,
            category: ruleResult.category,
            category_confidence: ruleResult.confidence,
            category_source: 'rules',
            category_reason: ruleResult.reason,
          });
          ruleBasedCount++;
          continue;
        }

        // STEP 2: Try Helix sales detection
        const companyProfile = buildCompanyProfile(contact);
        const helixResult = detectHelixProductFit(companyProfile);

        if (helixResult.products.length > 0) {
          const title = contact.current_title || '';
          const targetCheck = isHelixTargetContact(title, helixResult.products);

          if (targetCheck.isTarget) {
            const bestProduct = helixResult.bestFit;
            updates.push({
              id: contact.id,
              category: 'sales_prospect',
              category_confidence: bestProduct?.confidence || 0.8,
              category_source: 'helix',
              category_reason: `Helix target: ${targetCheck.matchedProducts.join(', ')} at ${contact.current_company}. ${bestProduct?.reason || ''}`,
              helix_products: targetCheck.matchedProducts,
            });
            helixSalesCount++;
            continue;
          }
        }

        // No categorization found - leave as uncategorized
        skippedCount++;
      } catch (err) {
        categorizeErrors.push(
          `${contact.full_name}: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
        skippedCount++;
      }
    }

    // Apply batch updates
    if (updates.length > 0) {
      // Update in batches of 100 to avoid query size limits
      for (let i = 0; i < updates.length; i += 100) {
        const batch = updates.slice(i, i + 100);
        await Promise.all(
          batch.map((update) =>
            supabase
              .from('contacts')
              .update({
                category: update.category,
                category_confidence: update.category_confidence,
                category_source: update.category_source,
                category_reason: update.category_reason,
                ...(update.helix_products && { helix_products: update.helix_products }),
              })
              .eq('id', update.id)
          )
        );
      }
    }

    return success<CategorizeAllData>({
      processed: contacts.length,
      categorized: ruleBasedCount + helixSalesCount,
      breakdown: {
        ruleBased: ruleBasedCount,
        helixSales: helixSalesCount,
        skipped: skippedCount,
      },
      errors: categorizeErrors.slice(0, 10), // Return first 10 errors
    });
  });
}
