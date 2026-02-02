import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { success, errors, withErrorHandling } from '@/lib/api/response';
import {
  getAllKeywords,
  addKeyword,
  bulkAddKeywords,
  KeywordCategory,
} from '@/lib/listener';
import { HelixProduct } from '@/lib/helix-sales';

/**
 * GET /api/listener/keywords
 * List all keywords
 */
export async function GET(request: NextRequest) {
  return withErrorHandling(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return errors.unauthorized();
    }

    const keywords = await getAllKeywords();

    // Group by category for easier display
    const byCategory: Record<string, typeof keywords> = {};
    for (const kw of keywords) {
      if (!byCategory[kw.category]) {
        byCategory[kw.category] = [];
      }
      byCategory[kw.category].push(kw);
    }

    return success({
      keywords,
      byCategory,
      total: keywords.length,
      active: keywords.filter(k => k.is_active).length,
    });
  });
}

/**
 * POST /api/listener/keywords
 * Add a new keyword or bulk add keywords
 */
export async function POST(request: NextRequest) {
  return withErrorHandling(async () => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return errors.unauthorized();
    }

    const body = await request.json();

    // Handle bulk add
    if (Array.isArray(body.keywords)) {
      const keywords = body.keywords as Array<{
        keyword: string;
        category: KeywordCategory;
        weight?: number;
        helixProducts?: HelixProduct[];
      }>;

      const result = await bulkAddKeywords(keywords);
      return success({
        message: `Added ${result.added} keywords, skipped ${result.skipped} duplicates`,
        ...result,
      });
    }

    // Handle single add
    const { keyword, category, weight, helixProducts } = body as {
      keyword: string;
      category: KeywordCategory;
      weight?: number;
      helixProducts?: HelixProduct[];
    };

    if (!keyword || !category) {
      return errors.badRequest('keyword and category are required');
    }

    if (!['pain_signal', 'regulatory', 'cost', 'competitor'].includes(category)) {
      return errors.badRequest('Invalid category');
    }

    try {
      const newKeyword = await addKeyword({
        keyword,
        category,
        weight,
        helixProducts,
      });
      return success(newKeyword, 201);
    } catch (err) {
      if (err instanceof Error && err.message.includes('already exists')) {
        return errors.badRequest(err.message);
      }
      throw err;
    }
  });
}
