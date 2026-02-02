// ============================================
// DOMAIN EXTRACTOR
// ============================================
// Extracts company domains from URLs and text

import { ExtractedDomain } from './types';

// ============================================
// DOMAIN BLOCKLIST
// ============================================
// Common domains that are NOT companies we want to track

const DOMAIN_BLOCKLIST = new Set([
  // Social media / platforms
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'medium.com',
  'substack.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'facebook.com',
  'instagram.com',
  'youtube.com',
  'reddit.com',
  'discord.com',
  'discord.gg',
  'slack.com',
  'telegram.org',
  't.me',
  'whatsapp.com',

  // News / content
  'news.ycombinator.com',
  'ycombinator.com',
  'techcrunch.com',
  'wired.com',
  'theverge.com',
  'arstechnica.com',
  'engadget.com',
  'mashable.com',
  'cnet.com',
  'zdnet.com',
  'venturebeat.com',
  'reuters.com',
  'bloomberg.com',
  'wsj.com',
  'nytimes.com',
  'bbc.com',
  'bbc.co.uk',
  'cnn.com',
  'theguardian.com',
  'forbes.com',
  'businessinsider.com',
  'vice.com',
  'gizmodo.com',
  'kotaku.com',

  // Infrastructure / tools
  'google.com',
  'googleapis.com',
  'gstatic.com',
  'amazon.com',
  'amazonaws.com',
  'aws.amazon.com',
  'cloudflare.com',
  'cloudfront.net',
  'fastly.net',
  'akamai.com',
  'akamaized.net',
  'microsoft.com',
  'azure.com',
  'apple.com',
  'icloud.com',

  // Dev tools / docs
  'stackoverflow.com',
  'stackexchange.com',
  'npmjs.com',
  'pypi.org',
  'rubygems.org',
  'docs.google.com',
  'drive.google.com',
  'notion.so',
  'figma.com',
  'miro.com',
  'trello.com',
  'asana.com',
  'jira.atlassian.com',
  'confluence.atlassian.com',
  'atlassian.com',

  // Hosting / blogs
  'wordpress.com',
  'blogger.com',
  'blogspot.com',
  'squarespace.com',
  'wix.com',
  'weebly.com',
  'ghost.io',
  'hashnode.com',
  'dev.to',
  'hackernoon.com',

  // File sharing
  'dropbox.com',
  'box.com',
  'wetransfer.com',
  'sendgrid.com',

  // URL shorteners
  'bit.ly',
  'tinyurl.com',
  'goo.gl',
  't.co',
  'ow.ly',

  // Generic TLDs that are usually not companies
  'example.com',
  'localhost',
  'test.com',

  // Archive / cache
  'archive.org',
  'web.archive.org',
  'archive.is',
  'archive.today',
  'webcache.googleusercontent.com',

  // Wikipedia
  'wikipedia.org',
  'en.wikipedia.org',
  'wikimedia.org',
]);

// Domains we specifically WANT to track even though they might seem generic
const DOMAIN_ALLOWLIST = new Set([
  'reddit.com', // They're a potential customer
  'discord.com',
  'slack.com',
  'notion.so',
  'figma.com',
]);

// ============================================
// URL PARSING
// ============================================

/**
 * Extract domain from a URL
 */
export function extractDomainFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    let domain = parsed.hostname.toLowerCase();

    // Remove www. prefix
    if (domain.startsWith('www.')) {
      domain = domain.slice(4);
    }

    return domain;
  } catch {
    return null;
  }
}

/**
 * Normalize a domain (lowercase, remove www, etc.)
 */
export function normalizeDomain(domain: string): string {
  let normalized = domain.toLowerCase().trim();

  // Remove protocol if present
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    try {
      const parsed = new URL(normalized);
      normalized = parsed.hostname;
    } catch {
      // If URL parsing fails, try to extract domain manually
      normalized = normalized.replace(/^https?:\/\//, '').split('/')[0];
    }
  }

  // Remove www.
  if (normalized.startsWith('www.')) {
    normalized = normalized.slice(4);
  }

  // Remove trailing dots/slashes
  normalized = normalized.replace(/[./]+$/, '');

  return normalized;
}

/**
 * Check if a domain is a company domain (not blocked)
 */
export function isCompanyDomain(domain: string): boolean {
  const normalized = normalizeDomain(domain);

  // Check allowlist first
  if (DOMAIN_ALLOWLIST.has(normalized)) {
    return true;
  }

  // Check blocklist
  if (DOMAIN_BLOCKLIST.has(normalized)) {
    return false;
  }

  // Check if it's a subdomain of a blocked domain
  for (const blocked of DOMAIN_BLOCKLIST) {
    if (normalized.endsWith('.' + blocked)) {
      return false;
    }
  }

  // Must have at least one dot (valid TLD)
  if (!normalized.includes('.')) {
    return false;
  }

  // Reject IP addresses
  if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) {
    return false;
  }

  return true;
}

// ============================================
// TEXT EXTRACTION
// ============================================

/**
 * Extract domains mentioned in text
 * Looks for URLs, domain mentions, and email domains
 */
export function extractDomainsFromText(text: string): ExtractedDomain[] {
  const domains: ExtractedDomain[] = [];
  const seen = new Set<string>();

  // 1. Extract from URLs (http:// or https://)
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const urls = text.match(urlRegex) || [];

  for (const url of urls) {
    const domain = extractDomainFromUrl(url);
    if (domain && isCompanyDomain(domain) && !seen.has(domain)) {
      seen.add(domain);
      domains.push({
        domain,
        source: 'url',
        confidence: 0.9,
        context: extractContext(text, text.indexOf(url)),
      });
    }
  }

  // 2. Extract from domain mentions (e.g., "example.com")
  // More restrictive pattern to avoid false positives
  const domainRegex = /\b([a-zA-Z0-9][-a-zA-Z0-9]*\.)+(?:com|org|net|io|co|ai|app|dev|tech|cloud|so)\b/gi;
  const mentions = text.match(domainRegex) || [];

  for (const mention of mentions) {
    const domain = normalizeDomain(mention);
    if (domain && isCompanyDomain(domain) && !seen.has(domain)) {
      seen.add(domain);
      domains.push({
        domain,
        source: 'mention',
        confidence: 0.7,
        context: extractContext(text, text.indexOf(mention)),
      });
    }
  }

  // 3. Extract from email addresses
  const emailRegex = /[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
  let emailMatch;
  while ((emailMatch = emailRegex.exec(text)) !== null) {
    const domain = normalizeDomain(emailMatch[1]);
    if (domain && isCompanyDomain(domain) && !seen.has(domain)) {
      seen.add(domain);
      domains.push({
        domain,
        source: 'email',
        confidence: 0.6,
        context: extractContext(text, emailMatch.index),
      });
    }
  }

  return domains;
}

/**
 * Extract all domains from a URL and its associated text
 */
export function extractDomainsFromSource(
  url: string | undefined,
  title: string | undefined,
  text: string | undefined
): ExtractedDomain[] {
  const domains: ExtractedDomain[] = [];
  const seen = new Set<string>();

  // 1. Primary domain from URL (highest confidence)
  if (url) {
    const urlDomain = extractDomainFromUrl(url);
    if (urlDomain && isCompanyDomain(urlDomain) && !seen.has(urlDomain)) {
      seen.add(urlDomain);
      domains.push({
        domain: urlDomain,
        source: 'url',
        confidence: 0.95,
        context: title || url,
      });
    }
  }

  // 2. Domains from title
  if (title) {
    const titleDomains = extractDomainsFromText(title);
    for (const d of titleDomains) {
      if (!seen.has(d.domain)) {
        seen.add(d.domain);
        // Slightly boost confidence for title mentions
        domains.push({ ...d, confidence: Math.min(d.confidence + 0.1, 0.95) });
      }
    }
  }

  // 3. Domains from text/content
  if (text) {
    const textDomains = extractDomainsFromText(text);
    for (const d of textDomains) {
      if (!seen.has(d.domain)) {
        seen.add(d.domain);
        domains.push(d);
      }
    }
  }

  return domains;
}

// ============================================
// HELPERS
// ============================================

/**
 * Extract surrounding context for a position in text
 */
function extractContext(text: string, position: number, chars: number = 100): string {
  const start = Math.max(0, position - chars);
  const end = Math.min(text.length, position + chars);

  let context = text.slice(start, end);

  // Clean up whitespace
  context = context.replace(/\s+/g, ' ').trim();

  // Add ellipsis if truncated
  if (start > 0) context = '...' + context;
  if (end < text.length) context = context + '...';

  return context;
}

/**
 * Try to extract company name from domain
 * e.g., "acme-corp.com" -> "Acme Corp"
 */
export function domainToCompanyName(domain: string): string {
  // Remove TLD
  const parts = domain.split('.');
  if (parts.length < 2) return domain;

  const name = parts.slice(0, -1).join('.');

  // Convert to title case, handle hyphens
  return name
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}
