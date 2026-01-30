// ============================================
// HELIX SALES DETECTION SERVICE
// ============================================
// Identifies companies that are good fits for Helix products:
// 1. Captcha Replacement - PerimeterX/Fastly users (contact: CISO)
// 2. Voice Captcha - Platforms needing unique human verification (contact: GC, Trust & Safety)
// 3. Age Verification - Platforms with age-restricted content (contact: GC, Trust & Safety)
// ============================================

export type HelixProduct = 'captcha_replacement' | 'voice_captcha' | 'age_verification';

export interface HelixProductFit {
  product: HelixProduct;
  confidence: number;
  reason: string;
  targetTitles: string[];
}

export interface CompanyTechStack {
  usesPerimeterX: boolean;
  usedPerimeterXHistorically: boolean;
  usesFastly: boolean;
  usesCloudflare: boolean;
  usesAkamai: boolean;
  detectedCaptcha: string | null;
  detectedCDN: string | null;
}

export interface CompanyProfile {
  name: string;
  domain: string;
  industry?: string;
  subIndustry?: string;
  hasUserAccounts: boolean;
  hasAgeRestrictedContent: boolean;
  isTicketingPlatform: boolean;
  isMarketplace: boolean;
  isSocialPlatform: boolean;
  isGamingPlatform: boolean;
  techStack?: CompanyTechStack;
}

// ============================================
// PRODUCT 1: CAPTCHA REPLACEMENT
// Target: Companies using PerimeterX (current or historical) + Fastly CDN
// Key Contact: CISO
// ============================================

// Known PerimeterX customers (historical and current)
const PERIMETERX_CUSTOMERS = new Set([
  'zillow.com',
  'stubhub.com',
  'aliexpress.com',
  'costco.com',
  'nordstrom.com',
  'draftkings.com',
  'fanduel.com',
  'wix.com',
  'priceline.com',
  'wayfair.com',
  'instacart.com',
  'grubhub.com',
  'doordash.com',
  // Add more as discovered
]);

// Known Fastly customers
const FASTLY_CUSTOMERS = new Set([
  'reddit.com',
  'pinterest.com',
  'twitter.com',
  'vimeo.com',
  'spotify.com',
  'ticketmaster.com',
  'shopify.com',
  'stripe.com',
  'github.com',
  'slack.com',
  'new-york-times.com',
  'buzzfeed.com',
  // Add more as discovered
]);

// Industries likely to use bot protection
const BOT_PROTECTION_INDUSTRIES = [
  'e-commerce',
  'ticketing',
  'gaming',
  'gambling',
  'financial services',
  'travel',
  'real estate',
  'marketplace',
];

export function detectCaptchaReplacementFit(company: CompanyProfile): HelixProductFit | null {
  let confidence = 0;
  const reasons: string[] = [];

  // Check known PerimeterX customers
  if (PERIMETERX_CUSTOMERS.has(company.domain)) {
    confidence = 0.95;
    reasons.push('Known PerimeterX customer');
  }

  // Check tech stack signals
  if (company.techStack) {
    if (company.techStack.usesPerimeterX) {
      confidence = Math.max(confidence, 0.95);
      reasons.push('Currently using PerimeterX');
    }
    if (company.techStack.usedPerimeterXHistorically) {
      confidence = Math.max(confidence, 0.85);
      reasons.push('Previously used PerimeterX');
    }
    if (company.techStack.usesFastly) {
      confidence = Math.max(confidence, 0.7);
      reasons.push('Uses Fastly CDN');
    }
  }

  // Check Fastly customers
  if (FASTLY_CUSTOMERS.has(company.domain)) {
    confidence = Math.max(confidence, 0.6);
    reasons.push('Known Fastly customer');
  }

  // Industry signals
  const industryLower = (company.industry || '').toLowerCase();
  if (BOT_PROTECTION_INDUSTRIES.some(ind => industryLower.includes(ind))) {
    confidence = Math.max(confidence, 0.5);
    reasons.push(`Industry (${company.industry}) likely needs bot protection`);
  }

  if (confidence === 0) return null;

  return {
    product: 'captcha_replacement',
    confidence,
    reason: reasons.join('; '),
    targetTitles: [
      'CISO',
      'Chief Information Security Officer',
      'VP Security',
      'Head of Security',
      'Director of Security',
      'VP Engineering',
      'CTO',
    ],
  };
}

// ============================================
// PRODUCT 2: VOICE CAPTCHA
// Target: Platforms verifying unique humans (Reddit-like, ticketing)
// Key Contact: General Counsel, Trust & Safety, Marketing
// ============================================

const VOICE_CAPTCHA_INDUSTRIES = [
  'social media',
  'social network',
  'ticketing',
  'events',
  'gaming',
  'dating',
  'marketplace',
  'forums',
  'community',
];

const VOICE_CAPTCHA_COMPANY_SIGNALS = [
  'reddit',
  'discord',
  'ticketmaster',
  'stubhub',
  'eventbrite',
  'tinder',
  'bumble',
  'match',
  'craigslist',
  'nextdoor',
  'twitter',
  'threads',
];

export function detectVoiceCaptchaFit(company: CompanyProfile): HelixProductFit | null {
  let confidence = 0;
  const reasons: string[] = [];

  // Social/community platforms need unique human verification
  if (company.isSocialPlatform) {
    confidence = Math.max(confidence, 0.8);
    reasons.push('Social platform - needs unique human verification');
  }

  // Ticketing platforms have scalper problems
  if (company.isTicketingPlatform) {
    confidence = Math.max(confidence, 0.85);
    reasons.push('Ticketing platform - anti-scalping use case');
  }

  // Check for known company signals
  const domainLower = company.domain.toLowerCase();
  const nameLower = company.name.toLowerCase();
  if (VOICE_CAPTCHA_COMPANY_SIGNALS.some(sig => domainLower.includes(sig) || nameLower.includes(sig))) {
    confidence = Math.max(confidence, 0.75);
    reasons.push('Company matches voice captcha target profile');
  }

  // Industry signals
  const industryLower = (company.industry || '').toLowerCase();
  if (VOICE_CAPTCHA_INDUSTRIES.some(ind => industryLower.includes(ind))) {
    confidence = Math.max(confidence, 0.6);
    reasons.push(`Industry (${company.industry}) likely needs unique human verification`);
  }

  // Marketplace with user accounts
  if (company.isMarketplace && company.hasUserAccounts) {
    confidence = Math.max(confidence, 0.65);
    reasons.push('Marketplace with user accounts - fraud prevention use case');
  }

  if (confidence === 0) return null;

  return {
    product: 'voice_captcha',
    confidence,
    reason: reasons.join('; '),
    targetTitles: [
      'General Counsel',
      'Chief Legal Officer',
      'VP Legal',
      'Head of Trust & Safety',
      'Director of Trust & Safety',
      'VP Trust & Safety',
      'Head of Fraud',
      'Director of Fraud Prevention',
      'VP Marketing',
      'CMO',
    ],
  };
}

// ============================================
// PRODUCT 3: AGE VERIFICATION
// Target: Platforms with age-restricted content (OnlyFans, Roblox-like)
// Key Contact: General Counsel, Trust & Safety, Marketing
// ============================================

const AGE_VERIFICATION_INDUSTRIES = [
  'adult content',
  'gaming',
  'gambling',
  'alcohol',
  'cannabis',
  'vaping',
  'tobacco',
  'firearms',
];

const AGE_VERIFICATION_COMPANY_SIGNALS = [
  'onlyfans',
  'roblox',
  'fortnite',
  'epic games',
  'valve',
  'steam',
  'pornhub',
  'fansly',
  'patreon',
  'twitch',
  'youtube',
  'tiktok',
  'draftkings',
  'fanduel',
  'betmgm',
];

export function detectAgeVerificationFit(company: CompanyProfile): HelixProductFit | null {
  let confidence = 0;
  const reasons: string[] = [];

  // Direct age-restricted content signal
  if (company.hasAgeRestrictedContent) {
    confidence = Math.max(confidence, 0.9);
    reasons.push('Has age-restricted content');
  }

  // Gaming platforms (especially with in-app purchases)
  if (company.isGamingPlatform) {
    confidence = Math.max(confidence, 0.75);
    reasons.push('Gaming platform - COPPA/age verification requirements');
  }

  // Check for known company signals
  const domainLower = company.domain.toLowerCase();
  const nameLower = company.name.toLowerCase();
  if (AGE_VERIFICATION_COMPANY_SIGNALS.some(sig => domainLower.includes(sig) || nameLower.includes(sig))) {
    confidence = Math.max(confidence, 0.85);
    reasons.push('Company matches age verification target profile');
  }

  // Industry signals
  const industryLower = (company.industry || '').toLowerCase();
  if (AGE_VERIFICATION_INDUSTRIES.some(ind => industryLower.includes(ind))) {
    confidence = Math.max(confidence, 0.8);
    reasons.push(`Industry (${company.industry}) requires age verification`);
  }

  if (confidence === 0) return null;

  return {
    product: 'age_verification',
    confidence,
    reason: reasons.join('; '),
    targetTitles: [
      'General Counsel',
      'Chief Legal Officer',
      'VP Legal',
      'Head of Trust & Safety',
      'Director of Trust & Safety',
      'VP Trust & Safety',
      'Chief Compliance Officer',
      'VP Marketing',
      'CMO',
    ],
  };
}

// ============================================
// MAIN DETECTION FUNCTION
// ============================================

export interface HelixSalesResult {
  company: string;
  domain: string;
  products: HelixProductFit[];
  bestFit: HelixProductFit | null;
  allTargetTitles: string[];
}

export function detectHelixProductFit(company: CompanyProfile): HelixSalesResult {
  const products: HelixProductFit[] = [];

  const captchaFit = detectCaptchaReplacementFit(company);
  if (captchaFit) products.push(captchaFit);

  const voiceFit = detectVoiceCaptchaFit(company);
  if (voiceFit) products.push(voiceFit);

  const ageFit = detectAgeVerificationFit(company);
  if (ageFit) products.push(ageFit);

  // Sort by confidence to get best fit
  products.sort((a, b) => b.confidence - a.confidence);

  // Combine all target titles (dedupe)
  const allTargetTitles = [...new Set(products.flatMap(p => p.targetTitles))];

  return {
    company: company.name,
    domain: company.domain,
    products,
    bestFit: products[0] || null,
    allTargetTitles,
  };
}

// ============================================
// TECH STACK DETECTION (stub - needs implementation)
// ============================================

export async function detectTechStack(domain: string): Promise<CompanyTechStack> {
  // TODO: Implement actual tech detection
  // Options:
  // 1. Use BuiltWith API
  // 2. Use Wappalyzer
  // 3. Scrape website and check for signatures
  // 4. Check DNS/headers for CDN

  return {
    usesPerimeterX: false,
    usedPerimeterXHistorically: false,
    usesFastly: false,
    usesCloudflare: false,
    usesAkamai: false,
    detectedCaptcha: null,
    detectedCDN: null,
  };
}

// Helper to check if a contact's title matches Helix target personas
export function isHelixTargetContact(title: string, products: HelixProductFit[]): {
  isTarget: boolean;
  matchedProducts: HelixProduct[];
} {
  const titleLower = title.toLowerCase();
  const matchedProducts: HelixProduct[] = [];

  for (const product of products) {
    const isMatch = product.targetTitles.some(targetTitle => {
      const targetLower = targetTitle.toLowerCase();
      return titleLower.includes(targetLower) || targetLower.split(' ').every(word => titleLower.includes(word));
    });
    if (isMatch) {
      matchedProducts.push(product.product);
    }
  }

  return {
    isTarget: matchedProducts.length > 0,
    matchedProducts,
  };
}
