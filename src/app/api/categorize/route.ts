import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  buildCategorizationPrompt,
  parseAICategorizationResponse,
  categorizeByRules,
  CategorizationResult,
} from '@/lib/categorization';
import {
  detectHelixProductFit,
  isHelixTargetContact,
  CompanyProfile,
} from '@/lib/helix-sales';
import Anthropic from '@anthropic-ai/sdk';

// Lazy initialization to avoid build-time errors when API key is not set
let anthropic: Anthropic | null = null;
function getAnthropic() {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    });
  }
  return anthropic;
}

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
    hasUserAccounts: true, // Default assumption for B2C
    hasAgeRestrictedContent: industry.includes('gaming') ||
                              industry.includes('adult') ||
                              industry.includes('gambling'),
    isTicketingPlatform: industry.includes('ticketing') ||
                          industry.includes('events') ||
                          industry.includes('entertainment'),
    isMarketplace: industry.includes('marketplace') ||
                   industry.includes('e-commerce'),
    isSocialPlatform: industry.includes('social') ||
                       industry.includes('community'),
    isGamingPlatform: industry.includes('gaming') ||
                       industry.includes('video games'),
  };
}

export async function POST(request: NextRequest) {
  try {
    const { contactIds, useAIFallback = true } = await request.json();

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

    // Fetch uncategorized contacts
    const { data: contacts, error: fetchError } = await supabase
      .from('contacts')
      .select('*')
      .in('id', contactIds)
      .eq('owner_id', user.id)
      .eq('category', 'uncategorized');

    if (fetchError || !contacts) {
      return NextResponse.json(
        { success: false, error: fetchError?.message || 'Failed to fetch contacts' },
        { status: 500 }
      );
    }

    // Fetch known firms for rule-based categorization
    const { data: knownFirms } = await supabase
      .from('known_firms')
      .select('*');

    let categorizedCount = 0;
    let ruleBasedCount = 0;
    let helixSalesCount = 0;
    let aiCount = 0;
    const errors: string[] = [];

    for (const contact of contacts) {
      try {
        // Fetch work history for this contact
        const { data: workHistory } = await supabase
          .from('work_history')
          .select('*')
          .eq('contact_id', contact.id)
          .order('is_current', { ascending: false });

        // ============================================
        // STEP 1: Try rule-based categorization first
        // ============================================
        const ruleResult = categorizeByRules(contact, workHistory || [], knownFirms || []);

        if (ruleResult.category !== 'uncategorized' && ruleResult.confidence >= 0.7) {
          // Rule-based categorization successful
          await supabase
            .from('contacts')
            .update({
              category: ruleResult.category,
              category_confidence: ruleResult.confidence,
              category_source: 'rules',
              category_reason: ruleResult.reason,
            })
            .eq('id', contact.id);

          categorizedCount++;
          ruleBasedCount++;
          continue;
        }

        // ============================================
        // STEP 2: Try Helix sales detection
        // ============================================
        const companyProfile = buildCompanyProfile(contact);
        const helixResult = detectHelixProductFit(companyProfile);

        if (helixResult.products.length > 0) {
          const title = contact.current_title || '';
          const targetCheck = isHelixTargetContact(title, helixResult.products);

          if (targetCheck.isTarget) {
            // Contact is a target persona at a Helix-fit company
            const bestProduct = helixResult.bestFit;
            await supabase
              .from('contacts')
              .update({
                category: 'sales_prospect',
                category_confidence: bestProduct?.confidence || 0.8,
                category_source: 'helix',
                category_reason: `Helix target: ${targetCheck.matchedProducts.join(', ')} at ${contact.current_company}. ${bestProduct?.reason || ''}`,
                helix_products: targetCheck.matchedProducts,
              })
              .eq('id', contact.id);

            categorizedCount++;
            helixSalesCount++;
            continue;
          }
        }

        // ============================================
        // STEP 3: Fall back to AI prediction (if enabled)
        // ============================================
        if (!useAIFallback) {
          // Skip AI, leave as uncategorized
          continue;
        }

        const prompt = buildCategorizationPrompt(contact, workHistory || []);

        const completion = await getAnthropic().messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          system: 'You are a contact categorization assistant. Analyze the contact information and categorize them accurately. Always respond with valid JSON only, no other text.',
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        });

        const response = completion.content[0]?.type === 'text' ? completion.content[0].text : null;
        if (!response) {
          errors.push(`${contact.full_name}: No AI response`);
          continue;
        }

        const categorization = parseAICategorizationResponse(response);
        if (!categorization) {
          errors.push(`${contact.full_name}: Failed to parse AI response`);
          continue;
        }

        // Update contact with AI categorization
        await supabase
          .from('contacts')
          .update({
            category: categorization.category,
            category_confidence: categorization.confidence,
            category_source: 'ai',
            category_reason: categorization.reason,
          })
          .eq('id', contact.id);

        categorizedCount++;
        aiCount++;
      } catch (err) {
        errors.push(
          `${contact.full_name}: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }

      // Small delay for rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return NextResponse.json({
      success: true,
      categorized: categorizedCount,
      breakdown: {
        ruleBased: ruleBasedCount,
        helixSales: helixSalesCount,
        ai: aiCount,
      },
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
