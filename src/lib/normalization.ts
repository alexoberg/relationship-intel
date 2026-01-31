import Anthropic from '@anthropic-ai/sdk';
import { RoleCategory, SeniorityLevel } from '@/types/database';

const anthropic = new Anthropic();

// Cache for normalized titles (avoid redundant Claude calls)
const normalizationCache = new Map<string, NormalizationResult>();

export interface NormalizationResult {
  normalizedTitle: string;
  roleCategory: RoleCategory | null;
  seniorityLevel: SeniorityLevel | null;
}

/**
 * Normalize a job title to standardized role category and seniority level
 * Uses Claude for complex cases, with keyword fallback for common titles
 */
export async function normalizeRoleAndSeniority(title: string): Promise<NormalizationResult> {
  if (!title) {
    return { normalizedTitle: '', roleCategory: null, seniorityLevel: null };
  }

  const normalizedTitle = title.trim().toLowerCase();

  // Check cache first
  if (normalizationCache.has(normalizedTitle)) {
    return normalizationCache.get(normalizedTitle)!;
  }

  // Try keyword-based matching first (fast path)
  const keywordResult = matchByKeywords(normalizedTitle);
  if (keywordResult.roleCategory && keywordResult.seniorityLevel) {
    const result = {
      normalizedTitle: title,
      ...keywordResult,
    };
    normalizationCache.set(normalizedTitle, result);
    return result;
  }

  // Fall back to Claude for complex titles
  try {
    const result = await normalizeWithClaude(title);
    normalizationCache.set(normalizedTitle, result);
    return result;
  } catch (error) {
    console.error('Claude normalization failed:', error);
    // Return partial result from keywords
    const result = {
      normalizedTitle: title,
      roleCategory: keywordResult.roleCategory,
      seniorityLevel: keywordResult.seniorityLevel,
    };
    normalizationCache.set(normalizedTitle, result);
    return result;
  }
}

/**
 * Fast keyword-based matching for common job titles
 */
function matchByKeywords(title: string): { roleCategory: RoleCategory | null; seniorityLevel: SeniorityLevel | null } {
  const lowerTitle = title.toLowerCase();

  // Role category keywords
  const roleKeywords: Record<RoleCategory, string[]> = {
    Engineering: ['engineer', 'developer', 'programmer', 'software', 'swe', 'devops', 'sre', 'architect', 'technical', 'backend', 'frontend', 'fullstack', 'data engineer', 'ml engineer', 'platform'],
    Product: ['product manager', 'product lead', 'product owner', 'product director', 'chief product'],
    Design: ['designer', 'ux', 'ui', 'design lead', 'creative director'],
    Sales: ['sales', 'account executive', 'sdr', 'bdr', 'business development', 'partnerships'],
    Marketing: ['marketing', 'growth', 'demand gen', 'content', 'communications', 'pr manager'],
    Executive: ['ceo', 'cto', 'cfo', 'coo', 'cmo', 'cro', 'chief', 'founder', 'co-founder', 'president', 'general manager'],
    Operations: ['operations', 'ops', 'people ops', 'hr', 'recruiting', 'talent', 'finance', 'legal', 'admin'],
    Investing: ['investor', 'partner', 'principal', 'venture', 'portfolio'],
    'Customer Success': ['customer success', 'account manager', 'client success', 'support manager', 'implementation'],
  };

  // Seniority keywords
  const seniorityKeywords: Record<SeniorityLevel, string[]> = {
    'C-Suite': ['ceo', 'cto', 'cfo', 'coo', 'cmo', 'cro', 'chief', 'founder', 'co-founder', 'president'],
    VP: ['vp', 'vice president', 'svp', 'evp', 'gvp'],
    Director: ['director', 'head of', 'group lead'],
    Manager: ['manager', 'team lead', 'supervisor'],
    Senior: ['senior', 'sr.', 'staff', 'principal', 'lead'],
    Mid: ['mid', ' ii', ' iii', ' 2', ' 3'],
    Junior: ['junior', 'jr.', 'associate', 'entry', 'intern', ' i', ' 1'],
  };

  let roleCategory: RoleCategory | null = null;
  let seniorityLevel: SeniorityLevel | null = null;

  // Match role category
  for (const [category, keywords] of Object.entries(roleKeywords)) {
    for (const keyword of keywords) {
      if (lowerTitle.includes(keyword)) {
        roleCategory = category as RoleCategory;
        break;
      }
    }
    if (roleCategory) break;
  }

  // Match seniority level
  for (const [level, keywords] of Object.entries(seniorityKeywords)) {
    for (const keyword of keywords) {
      if (lowerTitle.includes(keyword)) {
        seniorityLevel = level as SeniorityLevel;
        break;
      }
    }
    if (seniorityLevel) break;
  }

  return { roleCategory, seniorityLevel };
}

/**
 * Use Claude for complex job title normalization
 */
async function normalizeWithClaude(title: string): Promise<NormalizationResult> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: `Analyze this job title and categorize it. Return ONLY a JSON object with no explanation.

Job Title: "${title}"

Categories:
- roleCategory: One of: Engineering, Product, Design, Sales, Marketing, Executive, Operations, Investing, Customer Success
- seniorityLevel: One of: C-Suite, VP, Director, Manager, Senior, Mid, Junior

Return JSON like: {"normalizedTitle": "cleaned title", "roleCategory": "...", "seniorityLevel": "..."}
Use null if uncertain about a field.`,
      },
    ],
  });

  // Extract text content
  const textContent = response.content.find(block => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  // Parse JSON response
  const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in Claude response');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  return {
    normalizedTitle: parsed.normalizedTitle || title,
    roleCategory: isValidRoleCategory(parsed.roleCategory) ? parsed.roleCategory : null,
    seniorityLevel: isValidSeniorityLevel(parsed.seniorityLevel) ? parsed.seniorityLevel : null,
  };
}

function isValidRoleCategory(value: string): value is RoleCategory {
  const validCategories: RoleCategory[] = [
    'Engineering', 'Product', 'Design', 'Sales', 'Marketing',
    'Executive', 'Operations', 'Investing', 'Customer Success',
  ];
  return validCategories.includes(value as RoleCategory);
}

function isValidSeniorityLevel(value: string): value is SeniorityLevel {
  const validLevels: SeniorityLevel[] = [
    'C-Suite', 'VP', 'Director', 'Manager', 'Senior', 'Mid', 'Junior',
  ];
  return validLevels.includes(value as SeniorityLevel);
}

/**
 * Batch normalize multiple titles efficiently
 * Groups similar titles and uses Claude for batches
 */
export async function batchNormalizeRoles(titles: string[]): Promise<Map<string, NormalizationResult>> {
  const results = new Map<string, NormalizationResult>();
  const uniqueTitles = [...new Set(titles.map(t => t.trim()))].filter(Boolean);

  // First pass: keyword matching (fast)
  const needsClaude: string[] = [];
  for (const title of uniqueTitles) {
    const cached = normalizationCache.get(title.toLowerCase());
    if (cached) {
      results.set(title, cached);
      continue;
    }

    const keywordResult = matchByKeywords(title.toLowerCase());
    if (keywordResult.roleCategory && keywordResult.seniorityLevel) {
      const result = { normalizedTitle: title, ...keywordResult };
      results.set(title, result);
      normalizationCache.set(title.toLowerCase(), result);
    } else {
      needsClaude.push(title);
    }
  }

  // Second pass: Claude for complex titles (batched)
  if (needsClaude.length > 0) {
    const batchSize = 10; // Process 10 at a time
    for (let i = 0; i < needsClaude.length; i += batchSize) {
      const batch = needsClaude.slice(i, i + batchSize);
      const batchResults = await normalizeBatchWithClaude(batch);

      for (const [title, result] of batchResults) {
        results.set(title, result);
        normalizationCache.set(title.toLowerCase(), result);
      }
    }
  }

  return results;
}

/**
 * Batch normalize titles with a single Claude call
 */
async function normalizeBatchWithClaude(titles: string[]): Promise<Map<string, NormalizationResult>> {
  const results = new Map<string, NormalizationResult>();

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `Analyze these job titles and categorize each. Return ONLY a JSON array with no explanation.

Job Titles:
${titles.map((t, i) => `${i + 1}. "${t}"`).join('\n')}

For each title, provide:
- roleCategory: One of: Engineering, Product, Design, Sales, Marketing, Executive, Operations, Investing, Customer Success (or null)
- seniorityLevel: One of: C-Suite, VP, Director, Manager, Senior, Mid, Junior (or null)

Return JSON array like: [{"title": "...", "roleCategory": "...", "seniorityLevel": "..."}, ...]`,
        },
      ],
    });

    const textContent = response.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response');
    }

    const jsonMatch = textContent.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found');
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      title: string;
      roleCategory: string | null;
      seniorityLevel: string | null;
    }>;

    for (const item of parsed) {
      const originalTitle = titles.find(t =>
        t.toLowerCase().includes(item.title.toLowerCase()) ||
        item.title.toLowerCase().includes(t.toLowerCase())
      ) || item.title;

      results.set(originalTitle, {
        normalizedTitle: originalTitle,
        roleCategory: isValidRoleCategory(item.roleCategory || '') ? item.roleCategory as RoleCategory : null,
        seniorityLevel: isValidSeniorityLevel(item.seniorityLevel || '') ? item.seniorityLevel as SeniorityLevel : null,
      });
    }
  } catch (error) {
    console.error('Batch Claude normalization failed:', error);
    // Fall back to keyword matching for all
    for (const title of titles) {
      const keywordResult = matchByKeywords(title.toLowerCase());
      results.set(title, {
        normalizedTitle: title,
        ...keywordResult,
      });
    }
  }

  return results;
}
