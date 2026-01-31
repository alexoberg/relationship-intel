/**
 * Email filtering utility to detect junk, marketing, and system emails
 * Prevents wasting PDL API quota on non-person contacts
 */

// Patterns that indicate automated/system emails
const JUNK_EMAIL_PATTERNS: RegExp[] = [
  // No-reply patterns
  /^no-?reply@/i,
  /^do-?not-?reply@/i,
  /^noreply-/i,

  // Notification patterns
  /^notifications?@/i,
  /^alerts?@/i,
  /^notify@/i,
  /^updates?@/i,
  /^news(letter)?@/i,

  // System patterns
  /^system@/i,
  /^mailer(-daemon)?@/i,
  /^postmaster@/i,
  /^bounce[s]?@/i,
  /^daemon@/i,
  /^auto(-)?reply@/i,

  // Marketing patterns
  /^marketing@/i,
  /^promo(tions)?@/i,
  /^newsletter@/i,
  /^campaign@/i,
  /^email@/i,  // generic marketing sender
  /^mail@/i,

  // Service patterns
  /^billing@/i,
  /^receipts?@/i,
  /^orders?@/i,
  /^shipping@/i,
  /^tracking@/i,
  /^confirmation@/i,
  /^verify@/i,
  /^verification@/i,
  /^security@/i,
  /^password@/i,
  /^account@/i,

  // Form submissions
  /^contact(-?form)?@/i,
  /^form(s)?@/i,
  /^feedback@/i,
  /^webmaster@/i,
];

// Known automation service domains to always exclude
const AUTOMATION_DOMAINS: string[] = [
  // Code/Dev tools
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'circleci.com',
  'travis-ci.org',
  'jenkins.io',

  // Communication tools (notifications, not direct messages)
  'slack.com',
  'slackbot.com',
  'discord.com',
  'intercom.io',
  'intercom-mail.com',
  'drift.com',
  'crisp.chat',

  // Project management
  'atlassian.com',
  'jira.com',
  'asana.com',
  'monday.com',
  'notion.so',
  'trello.com',
  'linear.app',

  // Marketing/Email platforms
  'mailchimp.com',
  'sendgrid.net',
  'sendgrid.com',
  'mailgun.org',
  'mailgun.com',
  'amazonses.com',
  'postmarkapp.com',
  'sparkpostmail.com',
  'constantcontact.com',
  'hubspot.com',
  'hubspotmail.com',
  'salesforce.com',
  'marketo.com',
  'pardot.com',
  'klaviyo.com',
  'brevo.com',
  'sendinblue.com',

  // E-commerce
  'shopify.com',
  'stripe.com',
  'paypal.com',
  'square.com',

  // Social media
  'facebookmail.com',
  'linkedin.com',
  'twittermail.com',
  'x.com',
  'instagram.com',
  'pinterest.com',

  // Cloud services
  'googlemail.com', // Not gmail - this is system mail
  'cloud.google.com',
  'aws.amazon.com',
  'azure.microsoft.com',

  // Misc services
  'calendly.com',
  'zoom.us',
  'docusign.net',
  'dropboxmail.com',
  'figma.com',
  'canva.com',
  'typeform.com',
  'surveymonkey.com',
];

// Generic prefixes that indicate company mailboxes (not individuals)
// These are only filtered if we can't identify the domain as a legit company
const GENERIC_MAILBOX_PREFIXES: string[] = [
  'info',
  'hello',
  'hi',
  'contact',
  'support',
  'help',
  'sales',
  'team',
  'admin',
  'office',
  'general',
  'enquiries',
  'inquiries',
];

export interface EmailClassification {
  email: string;
  isLikelyMarketing: boolean;
  isAutomation: boolean;
  isGenericMailbox: boolean;
  shouldEnrich: boolean;
  reason?: string;
}

/**
 * Classify an email address to determine if it should be enriched
 */
export function classifyEmail(email: string): EmailClassification {
  const normalizedEmail = email.toLowerCase().trim();
  const [localPart, domain] = normalizedEmail.split('@');

  if (!localPart || !domain) {
    return {
      email: normalizedEmail,
      isLikelyMarketing: false,
      isAutomation: false,
      isGenericMailbox: false,
      shouldEnrich: false,
      reason: 'Invalid email format',
    };
  }

  // Check for automation domains
  const isAutomationDomain = AUTOMATION_DOMAINS.some(d => domain.endsWith(d));
  if (isAutomationDomain) {
    return {
      email: normalizedEmail,
      isLikelyMarketing: false,
      isAutomation: true,
      isGenericMailbox: false,
      shouldEnrich: false,
      reason: `Automation domain: ${domain}`,
    };
  }

  // Check for junk patterns
  for (const pattern of JUNK_EMAIL_PATTERNS) {
    if (pattern.test(normalizedEmail)) {
      return {
        email: normalizedEmail,
        isLikelyMarketing: true,
        isAutomation: false,
        isGenericMailbox: false,
        shouldEnrich: false,
        reason: `Matches junk pattern: ${pattern.source}`,
      };
    }
  }

  // Check for generic mailbox prefixes
  const isGeneric = GENERIC_MAILBOX_PREFIXES.includes(localPart);
  if (isGeneric) {
    return {
      email: normalizedEmail,
      isLikelyMarketing: false,
      isAutomation: false,
      isGenericMailbox: true,
      shouldEnrich: false, // Don't enrich generic company mailboxes
      reason: `Generic mailbox: ${localPart}@`,
    };
  }

  // Passed all filters - likely a real person
  return {
    email: normalizedEmail,
    isLikelyMarketing: false,
    isAutomation: false,
    isGenericMailbox: false,
    shouldEnrich: true,
  };
}

/**
 * Batch classify multiple emails
 */
export function classifyEmails(emails: string[]): Map<string, EmailClassification> {
  const results = new Map<string, EmailClassification>();

  for (const email of emails) {
    const classification = classifyEmail(email);
    results.set(email.toLowerCase().trim(), classification);
  }

  return results;
}

/**
 * Quick check if an email should be created as a contact
 * Use this in the sync pipeline before creating contacts
 */
export function shouldCreateContact(email: string): boolean {
  return classifyEmail(email).shouldEnrich;
}

/**
 * Quick check if an existing contact should be enriched
 * Use this in the enrichment pipeline
 */
export function shouldEnrichContact(email: string | null, isAlreadyMarkedMarketing?: boolean): boolean {
  if (!email) return false;
  if (isAlreadyMarkedMarketing) return false;
  return classifyEmail(email).shouldEnrich;
}

/**
 * Get classification reason for logging/debugging
 */
export function getFilterReason(email: string): string {
  const classification = classifyEmail(email);
  return classification.reason || 'Passed all filters';
}

// Export patterns for testing
export const patterns = {
  JUNK_EMAIL_PATTERNS,
  AUTOMATION_DOMAINS,
  GENERIC_MAILBOX_PREFIXES,
};
