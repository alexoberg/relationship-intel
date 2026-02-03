import { inngest } from '../client';
import { createAdminClient } from '@/lib/supabase/admin';
import Anthropic from '@anthropic-ai/sdk';

interface LookalikeCompany {
  company_name: string;
  company_domain: string;
  company_industry: string;
  company_size?: string;
  funding_stage?: string;
  description: string;
  helix_fit_score: number;
  helix_fit_reason: string;
  helix_products: string[];
  similarity_reason: string;
}

interface SeedProspect {
  company_name: string;
  company_domain: string | null;
  company_industry: string | null;
  company_size: string | null;
  funding_stage: string | null;
  helix_fit_score: number | null;
  helix_fit_reason: string | null;
  helix_products: string[] | null;
}

/**
 * Generate lookalike audience from high-scoring prospects
 * This is the async version for larger batches or background processing
 */
export const generateLookalikes = inngest.createFunction(
  {
    id: 'generate-lookalikes',
    name: 'Generate Lookalike Prospects',
    concurrency: {
      limit: 1,
      key: 'event.data.teamId',
    },
    retries: 2,
  },
  { event: 'prospects/generate-lookalikes' },
  async ({ event, step }) => {
    const {
      teamId,
      minScore = 80,
      count = 20,
      save = false,
    } = event.data;

    const supabase = createAdminClient();

    // Step 1: Get seed prospects and existing companies in one step to avoid serialization issues
    const { seedProspects, existingDomains, existingNames } = await step.run('get-prospects-data', async () => {
      // Get high-scoring prospects as seeds
      const { data: seeds, error: seedError } = await supabase
        .from('prospects')
        .select('company_name, company_domain, company_industry, company_size, funding_stage, helix_fit_score, helix_fit_reason, helix_products')
        .eq('team_id', teamId)
        .gte('helix_fit_score', minScore)
        .order('helix_fit_score', { ascending: false })
        .limit(20);

      if (seedError) throw seedError;

      // Get existing companies to avoid duplicates
      const { data: existing } = await supabase
        .from('prospects')
        .select('company_name, company_domain')
        .eq('team_id', teamId);

      const domains = (existing || [])
        .map(p => p.company_domain?.toLowerCase())
        .filter((d): d is string => Boolean(d));

      const names = (existing || [])
        .map(p => p.company_name?.toLowerCase())
        .filter((n): n is string => Boolean(n));

      return {
        seedProspects: (seeds || []) as SeedProspect[],
        existingDomains: domains,
        existingNames: names,
      };
    });

    if (seedProspects.length === 0) {
      return {
        status: 'no_seeds',
        message: `No prospects found with helix_fit_score >= ${minScore}`,
      };
    }

    // Step 2: Generate lookalikes using Claude
    const lookalikes = await step.run('generate-lookalikes-ai', async () => {
      return await generateLookalikeCompaniesWithAI(
        seedProspects,
        new Set(existingDomains),
        new Set(existingNames),
        Math.min(count, 50)
      );
    });

    if (lookalikes.length === 0) {
      return {
        status: 'no_lookalikes',
        message: 'Failed to generate lookalike companies',
        seeds: seedProspects.length,
      };
    }

    // Step 3: Optionally save as new prospects
    let addedProspects: { id: string; company_name: string }[] = [];

    if (save) {
      const saveResult = await step.run('save-lookalikes', async () => {
        const saved: { id: string; company_name: string }[] = [];
        const domainSet = new Set(existingDomains);

        for (const company of lookalikes) {
          const domain = company.company_domain?.toLowerCase();
          if (!domain || domainSet.has(domain)) {
            continue;
          }

          const { data: prospect, error } = await supabase
            .from('prospects')
            .insert({
              team_id: teamId,
              company_name: company.company_name,
              company_domain: company.company_domain,
              company_industry: company.company_industry,
              company_size: company.company_size,
              funding_stage: company.funding_stage,
              helix_fit_score: company.helix_fit_score,
              helix_fit_reason: `${company.helix_fit_reason} (Lookalike: ${company.similarity_reason})`,
              helix_products: company.helix_products,
              source: 'lookalike',
              status: 'new',
            })
            .select('id, company_name')
            .single();

          if (!error && prospect) {
            saved.push({ id: prospect.id, company_name: prospect.company_name });
            domainSet.add(domain);
          }
        }

        return saved;
      });

      addedProspects = saveResult;
    }

    return {
      status: 'success',
      seeds: {
        count: seedProspects.length,
        min_score: minScore,
        companies: seedProspects.map(p => p.company_name),
      },
      lookalikes: {
        generated: lookalikes.length,
        saved: addedProspects.length,
        companies: lookalikes.map(l => ({
          name: l.company_name,
          domain: l.company_domain,
          score: l.helix_fit_score,
        })),
      },
      added_prospects: save ? addedProspects : undefined,
    };
  }
);

async function generateLookalikeCompaniesWithAI(
  seeds: SeedProspect[],
  existingDomains: Set<string>,
  existingNames: Set<string>,
  count: number
): Promise<LookalikeCompany[]> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  // Analyze seed patterns
  const industries = getCommonValues(seeds.map(s => s.company_industry));
  const products = getCommonValues(seeds.flatMap(s => s.helix_products || []));
  const fundingStages = getCommonValues(seeds.map(s => s.funding_stage));
  const avgScore = Math.round(seeds.reduce((sum, s) => sum + (s.helix_fit_score || 0), 0) / seeds.length);

  const seedSummary = seeds.slice(0, 10).map(s =>
    `- ${s.company_name} (${s.company_industry || 'Unknown'}): ${s.helix_fit_reason || 'Strong fit'}`
  ).join('\n');

  const prompt = `You are helping find lookalike prospects for Helix, a company with three products:

1. **Bot Sorter** - CAPTCHA replacement that detects bots without friction
   - Best for: ticketing, sneaker drops, flash sales, e-commerce, gaming, marketplaces

2. **Voice Captcha** - Deepfake detection for voice/video verification
   - Best for: identity verification, customer support, banking, voice authentication

3. **Age Verification** - Verify users are 18+ without collecting personal data
   - Best for: dating apps, adult content, gambling, alcohol/cannabis, age-restricted gaming

## SEED COMPANIES (Your lookalike audience should be similar to these)

${seedSummary}

## SEED PROFILE ANALYSIS

- **Common Industries**: ${industries.join(', ') || 'Various'}
- **Common Helix Products**: ${products.join(', ') || 'Various'}
- **Typical Funding Stage**: ${fundingStages.join(', ') || 'Various'}
- **Average Fit Score**: ${avgScore}

## COMPANIES TO EXCLUDE (already in our database)

${Array.from(existingNames).slice(0, 100).join(', ')}

## TASK

Generate ${count} NEW companies that are similar to the seed companies above. These should be:
- Companies in similar industries or with similar needs
- Companies facing similar challenges (bot attacks, age verification requirements, deepfake concerns)
- Companies at similar stages (funding, growth trajectory)
- NOT in the exclusion list above

For each company, provide:
1. Company name
2. Domain (e.g., company.com)
3. Industry
4. Company size (small, medium, large, enterprise)
5. Funding stage (seed, series_a, series_b, series_c, growth, public)
6. Brief description (1 sentence)
7. Helix fit score (0-100, should be similar to seed companies: ${avgScore - 10} to 100)
8. Helix fit reason (why they need our products)
9. Which Helix products fit (array of: bot_sorter, voice_captcha, age_verification)
10. Similarity reason (why they're similar to the seed companies)

IMPORTANT:
- Focus on REAL companies that actually exist
- Ensure domains are accurate
- Only suggest companies NOT in the exclusion list
- Prioritize companies with urgent, clear needs for Helix products

Return as JSON array:
[
  {
    "company_name": "Example Co",
    "company_domain": "example.com",
    "company_industry": "Gaming",
    "company_size": "medium",
    "funding_stage": "series_b",
    "description": "Online gaming platform for casual players",
    "helix_fit_score": 85,
    "helix_fit_reason": "Heavy bot activity in-game marketplace",
    "helix_products": ["bot_sorter", "age_verification"],
    "similarity_reason": "Similar to seed companies in the gaming/marketplace space"
  }
]`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '';

    // Extract JSON array
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('Failed to parse AI response for lookalikes');
      return [];
    }

    const suggestions: LookalikeCompany[] = JSON.parse(jsonMatch[0]);

    // Filter out any that somehow match existing companies
    return suggestions.filter(s =>
      !existingDomains.has(s.company_domain?.toLowerCase()) &&
      !existingNames.has(s.company_name?.toLowerCase())
    );
  } catch (error) {
    console.error('Error generating lookalikes:', error);
    return [];
  }
}

function getCommonValues(values: (string | null | undefined)[]): string[] {
  const counts = new Map<string, number>();

  for (const v of values) {
    if (v) {
      counts.set(v, (counts.get(v) || 0) + 1);
    }
  }

  const threshold = Math.max(1, values.length * 0.2);
  return Array.from(counts.entries())
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([value]) => value)
    .slice(0, 5);
}

// Export all functions
export const functions = [generateLookalikes];
