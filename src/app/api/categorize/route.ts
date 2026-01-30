import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildCategorizationPrompt, parseAICategorizationResponse } from '@/lib/categorization';
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

    let categorizedCount = 0;
    const errors: string[] = [];

    for (const contact of contacts) {
      try {
        // Fetch work history for this contact
        const { data: workHistory } = await supabase
          .from('work_history')
          .select('*')
          .eq('contact_id', contact.id)
          .order('is_current', { ascending: false });

        // Build prompt
        const prompt = buildCategorizationPrompt(contact, workHistory || []);

        // Call Claude
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

        // Update contact
        await supabase
          .from('contacts')
          .update({
            category: categorization.category,
            category_confidence: categorization.confidence,
            category_source: 'ai',
          })
          .eq('id', contact.id);

        categorizedCount++;
      } catch (err) {
        errors.push(
          `${contact.full_name}: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
      }

      // Small delay for rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return NextResponse.json({
      success: true,
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
