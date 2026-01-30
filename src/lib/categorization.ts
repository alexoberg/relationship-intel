import { Category, Contact, WorkHistory, KnownFirm } from '@/types/database';

// Title patterns for categorization
const VC_TITLE_PATTERNS = [
  /\b(partner|principal|associate|analyst|venture|vc|gp|general partner|managing director|investment)\b/i,
];

const ANGEL_TITLE_PATTERNS = [
  /\b(angel|investor|advisor|board member|mentor|entrepreneur in residence|eir)\b/i,
];

const SALES_TITLE_PATTERNS = [
  /\b(ceo|cto|cfo|coo|founder|co-founder|vp|vice president|director|head of|manager|lead|senior|chief)\b/i,
];

// Industry patterns
const VC_INDUSTRIES = [
  'venture capital',
  'private equity',
  'investment management',
  'financial services',
  'capital markets',
];

const SALES_INDUSTRIES = [
  'software',
  'saas',
  'technology',
  'enterprise',
  'b2b',
  'fintech',
  'healthcare',
  'e-commerce',
];

export interface CategorizationResult {
  category: Category;
  confidence: number;
  reason: string;
}

export function categorizeByRules(
  contact: Partial<Contact>,
  workHistory: WorkHistory[],
  knownFirms: KnownFirm[]
): CategorizationResult {
  const title = contact.current_title?.toLowerCase() || '';
  const company = contact.current_company?.toLowerCase() || '';
  const industry = contact.current_company_industry?.toLowerCase() || '';

  // Check against known VC/Angel firms first (highest confidence)
  const matchedFirm = knownFirms.find(firm => {
    const firmNameLower = firm.name.toLowerCase();
    const aliases = firm.aliases?.map(a => a.toLowerCase()) || [];
    return (
      company.includes(firmNameLower) ||
      aliases.some(alias => company.includes(alias))
    );
  });

  if (matchedFirm) {
    if (matchedFirm.type === 'vc' || matchedFirm.type === 'pe') {
      return {
        category: 'vc',
        confidence: 0.95,
        reason: `Works at known VC firm: ${matchedFirm.name}`,
      };
    }
    if (matchedFirm.type === 'angel_network' || matchedFirm.type === 'accelerator') {
      return {
        category: 'angel',
        confidence: 0.9,
        reason: `Works at accelerator/angel network: ${matchedFirm.name}`,
      };
    }
  }

  // Check work history for VC experience
  const hasVCHistory = workHistory.some(job => {
    const jobCompanyLower = job.company_name?.toLowerCase() || '';
    const jobIndustryLower = job.company_industry?.toLowerCase() || '';
    return (
      VC_INDUSTRIES.some(ind => jobIndustryLower.includes(ind)) ||
      knownFirms.some(firm => {
        const firmNameLower = firm.name.toLowerCase();
        return (
          (firm.type === 'vc' || firm.type === 'pe') &&
          jobCompanyLower.includes(firmNameLower)
        );
      })
    );
  });

  // Check title patterns with industry context
  if (VC_TITLE_PATTERNS.some(pattern => pattern.test(title))) {
    if (VC_INDUSTRIES.some(ind => industry.includes(ind)) || hasVCHistory) {
      return {
        category: 'vc',
        confidence: 0.85,
        reason: `Title "${contact.current_title}" at "${contact.current_company}" matches VC pattern`,
      };
    }
  }

  // Check for angel investor indicators
  if (ANGEL_TITLE_PATTERNS.some(pattern => pattern.test(title))) {
    // If they have "investor" in title but not at a VC firm
    if (title.includes('angel') || (title.includes('investor') && !hasVCHistory)) {
      return {
        category: 'angel',
        confidence: 0.8,
        reason: `Title "${contact.current_title}" indicates angel investor`,
      };
    }
  }

  // Check for founder/exec at tech company (potential angel)
  if (/\b(founder|co-founder|ceo)\b/i.test(title)) {
    const isTechCompany = SALES_INDUSTRIES.some(ind =>
      industry.includes(ind) || company.includes(ind)
    );
    if (isTechCompany) {
      return {
        category: 'angel',
        confidence: 0.6,
        reason: `Founder/CEO at tech company - potential angel investor`,
      };
    }
  }

  // Sales prospect: exec/manager at a company in target industries
  if (SALES_TITLE_PATTERNS.some(pattern => pattern.test(title))) {
    const isSalesTarget = SALES_INDUSTRIES.some(ind =>
      industry.includes(ind) || company.includes(ind)
    );
    if (isSalesTarget) {
      return {
        category: 'sales_prospect',
        confidence: 0.7,
        reason: `${contact.current_title} at ${contact.current_company} - potential sales prospect`,
      };
    }
  }

  // Default: uncategorized if no clear signal
  return {
    category: 'uncategorized',
    confidence: 0,
    reason: 'No clear categorization signal from rules',
  };
}

// AI categorization prompt builder
export function buildCategorizationPrompt(
  contact: Partial<Contact>,
  workHistory: WorkHistory[]
): string {
  const workHistoryText = workHistory
    .slice(0, 5)
    .map(job => `- ${job.title} at ${job.company_name} (${job.company_industry || 'Unknown industry'})`)
    .join('\n');

  return `Categorize this contact for a sales and fundraising tool.

CONTACT:
Name: ${contact.full_name}
Current Title: ${contact.current_title || 'Unknown'}
Current Company: ${contact.current_company || 'Unknown'}
Industry: ${contact.current_company_industry || 'Unknown'}

WORK HISTORY:
${workHistoryText || 'No work history available'}

CATEGORIES:
1. VC - Works at a venture capital firm, PE firm, or makes institutional investments
2. Angel - Individual investor, advisor, successful entrepreneur who invests personally
3. Sales Prospect - Decision maker at a company that could be a customer (exec, director, manager at tech/SaaS company)
4. Irrelevant - Not relevant for sales or fundraising (individual contributor, unrelated industry, student, etc.)

Respond with a JSON object:
{
  "category": "vc" | "angel" | "sales_prospect" | "irrelevant",
  "confidence": 0.0 to 1.0,
  "reason": "Brief explanation"
}`;
}

export function parseAICategorizationResponse(response: string): CategorizationResult | null {
  try {
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.category || !['vc', 'angel', 'sales_prospect', 'irrelevant'].includes(parsed.category)) {
      return null;
    }

    return {
      category: parsed.category as Category,
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      reason: parsed.reason || 'AI categorization',
    };
  } catch {
    return null;
  }
}

// Batch categorization stats
export function calculateCategoryStats(contacts: Contact[]): Record<Category, number> {
  const stats: Record<Category, number> = {
    vc: 0,
    angel: 0,
    sales_prospect: 0,
    irrelevant: 0,
    uncategorized: 0,
  };

  contacts.forEach(contact => {
    stats[contact.category]++;
  });

  return stats;
}
