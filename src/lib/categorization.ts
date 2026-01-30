import { Category, Contact, WorkHistory, KnownFirm } from '@/types/database';

// ============================================
// CATEGORIZATION RULES (Alex's definitions)
// ============================================
//
// VC: Works or has EVER worked at a VC fund
// Angel: Has "investor" or "board member" in profile but NEVER worked at VC
//        OR is C-suite/founder of a successful startup
// Sales: Custom logic based on Helix product fit (PerimeterX, Fastly, etc.)
// ============================================

// Angel indicators - title patterns that suggest angel investor
const ANGEL_TITLE_PATTERNS = [
  /\binvestor\b/i,
  /\bboard\s*(member|director|seat)\b/i,
  /\badvisor\b/i,
  /\bangel\b/i,
  /\bmentor\b/i,
  /\bentrepreneur\s*in\s*residence\b/i,
  /\beir\b/i,
];

// C-Suite/Founder patterns (potential angels if at successful startups)
const EXECUTIVE_PATTERNS = [
  /\b(ceo|chief\s*executive)\b/i,
  /\b(cto|chief\s*technology)\b/i,
  /\b(cfo|chief\s*financial)\b/i,
  /\b(coo|chief\s*operating)\b/i,
  /\b(cmo|chief\s*marketing)\b/i,
  /\b(cpo|chief\s*product)\b/i,
  /\b(founder|co-founder|cofounder)\b/i,
];

// VC firm indicators - industries that suggest VC employment
const VC_INDUSTRIES = [
  'venture capital',
  'private equity',
  'investment management',
  'venture capital & private equity',
  'investment banking',
];

// VC title patterns (for people AT vc firms)
const VC_TITLE_PATTERNS = [
  /\b(partner|principal|associate|analyst|venture|vc|gp|general\s*partner|managing\s*director|investment\s*professional)\b/i,
];

// Sales prospect title patterns (for Helix products)
const SALES_TITLE_PATTERNS = [
  /\b(ciso|chief\s*information\s*security)\b/i,          // Captcha replacement
  /\b(general\s*counsel|gc|chief\s*legal)\b/i,           // Voice captcha / Age verification
  /\b(trust\s*(and|&)?\s*safety)\b/i,                    // Voice captcha / Age verification
  /\b(vp|vice\s*president).*(security|engineering|product)\b/i,
  /\b(head\s*of).*(security|fraud|trust|safety)\b/i,
];

// Industries that suggest tech startup success (for angel classification)
const SUCCESSFUL_STARTUP_INDUSTRIES = [
  'software',
  'saas',
  'technology',
  'fintech',
  'internet',
  'information technology',
  'computer software',
  'artificial intelligence',
  'blockchain',
  'crypto',
];

export interface CategorizationResult {
  category: Category;
  confidence: number;
  reason: string;
}

// Helper: Check if person has EVER worked at a VC firm
function hasVCExperience(
  workHistory: WorkHistory[],
  knownFirms: KnownFirm[],
  currentCompany?: string,
  currentIndustry?: string
): { hasVC: boolean; vcFirm?: string } {
  // Check current company first
  if (currentIndustry) {
    const industryLower = currentIndustry.toLowerCase();
    if (VC_INDUSTRIES.some(ind => industryLower.includes(ind))) {
      return { hasVC: true, vcFirm: currentCompany };
    }
  }

  // Check against known VC firms (current company)
  if (currentCompany) {
    const companyLower = currentCompany.toLowerCase();
    const matchedFirm = knownFirms.find(firm => {
      if (firm.type !== 'vc' && firm.type !== 'pe') return false;
      const firmNameLower = firm.name.toLowerCase();
      const aliases = firm.aliases?.map(a => a.toLowerCase()) || [];
      return companyLower.includes(firmNameLower) || aliases.some(a => companyLower.includes(a));
    });
    if (matchedFirm) return { hasVC: true, vcFirm: matchedFirm.name };
  }

  // Check work history for any VC experience
  for (const job of workHistory) {
    const jobCompany = job.company_name?.toLowerCase() || '';
    const jobIndustry = job.company_industry?.toLowerCase() || '';

    // Check industry
    if (VC_INDUSTRIES.some(ind => jobIndustry.includes(ind))) {
      return { hasVC: true, vcFirm: job.company_name };
    }

    // Check against known VC firms
    const matchedFirm = knownFirms.find(firm => {
      if (firm.type !== 'vc' && firm.type !== 'pe') return false;
      const firmNameLower = firm.name.toLowerCase();
      const aliases = firm.aliases?.map(a => a.toLowerCase()) || [];
      return jobCompany.includes(firmNameLower) || aliases.some(a => jobCompany.includes(a));
    });
    if (matchedFirm) return { hasVC: true, vcFirm: matchedFirm.name };
  }

  return { hasVC: false };
}

// Helper: Check if title indicates investor/board member
function hasInvestorOrBoardTitle(title: string): boolean {
  return ANGEL_TITLE_PATTERNS.some(pattern => pattern.test(title));
}

// Helper: Check if person is C-suite/founder at a successful startup
function isSuccessfulStartupExec(
  title: string,
  company: string,
  industry: string,
  // Could add funding data, employee count, etc. for "successful" determination
): boolean {
  const isExecutive = EXECUTIVE_PATTERNS.some(pattern => pattern.test(title));
  if (!isExecutive) return false;

  // Check if company is in tech/startup industries
  const industryLower = industry.toLowerCase();
  const companyLower = company.toLowerCase();
  const isTechStartup = SUCCESSFUL_STARTUP_INDUSTRIES.some(ind =>
    industryLower.includes(ind) || companyLower.includes(ind)
  );

  return isTechStartup;
}

export function categorizeByRules(
  contact: Partial<Contact>,
  workHistory: WorkHistory[],
  knownFirms: KnownFirm[]
): CategorizationResult {
  const title = contact.current_title || '';
  const company = contact.current_company || '';
  const industry = contact.current_company_industry || '';

  // ============================================
  // STEP 1: Check for VC (current or past VC experience)
  // ============================================
  const vcCheck = hasVCExperience(workHistory, knownFirms, company, industry);

  if (vcCheck.hasVC) {
    // Currently works at VC
    const currentlyAtVC = VC_INDUSTRIES.some(ind =>
      industry.toLowerCase().includes(ind)
    ) || knownFirms.some(firm => {
      if (firm.type !== 'vc' && firm.type !== 'pe') return false;
      return company.toLowerCase().includes(firm.name.toLowerCase());
    });

    if (currentlyAtVC) {
      return {
        category: 'vc',
        confidence: 0.95,
        reason: `Currently works at VC firm: ${company}`,
      };
    } else {
      return {
        category: 'vc',
        confidence: 0.85,
        reason: `Previously worked at VC firm: ${vcCheck.vcFirm}`,
      };
    }
  }

  // ============================================
  // STEP 2: Check for Angel Investor
  // Has "investor" or "board member" in title, but NO VC history
  // ============================================
  if (hasInvestorOrBoardTitle(title)) {
    return {
      category: 'angel',
      confidence: 0.9,
      reason: `Has investor/board member title ("${title}") with no VC firm history`,
    };
  }

  // ============================================
  // STEP 3: Check for C-suite/Founder at successful startup (Angel)
  // ============================================
  if (isSuccessfulStartupExec(title, company, industry)) {
    return {
      category: 'angel',
      confidence: 0.7,
      reason: `C-suite/Founder at tech company (${title} at ${company}) - likely angel investor`,
    };
  }

  // ============================================
  // STEP 4: Check for Sales Prospect (Helix products)
  // CISO → Captcha replacement
  // GC/Trust & Safety → Voice captcha / Age verification
  // ============================================
  if (SALES_TITLE_PATTERNS.some(pattern => pattern.test(title))) {
    return {
      category: 'sales_prospect',
      confidence: 0.8,
      reason: `Title "${title}" matches Helix target persona at ${company}`,
    };
  }

  // ============================================
  // Default: uncategorized - needs AI prediction or more data
  // ============================================
  return {
    category: 'uncategorized',
    confidence: 0,
    reason: 'No clear categorization signal - recommend AI prediction or PDL enrichment',
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

CATEGORY DEFINITIONS (IMPORTANT - follow these exactly):

1. VC - Person works OR has EVER worked at a venture capital or private equity firm.
   Look for: Sequoia, a16z, Accel, Greylock, Benchmark, Index, General Catalyst, Lightspeed, NEA,
   Bessemer, Founders Fund, Kleiner Perkins, GGV, Insight, Tiger Global, etc.
   Also includes investment banking with VC focus.

2. Angel - Person has "investor" or "board member" in their title but has NEVER worked at a VC firm.
   OR they are a C-suite executive (CEO, CTO, CFO) or founder of a successful tech startup.
   Key: If they have VC history, they're VC not Angel.

3. Sales Prospect - Relevant decision maker for enterprise security/trust products:
   - CISO or security leaders (for captcha/bot protection)
   - General Counsel or legal leaders (for voice verification)
   - Trust & Safety or fraud prevention leaders
   - VP/Director of Product, Engineering, or Security

4. Irrelevant - Individual contributors, students, unrelated industries (non-tech),
   or roles without decision-making power for security/verification products.

CRITICAL RULES:
- VC history (even past) → classify as VC
- "Investor" or "board member" WITHOUT VC history → classify as Angel
- Founder/CEO of tech startup → classify as Angel

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
