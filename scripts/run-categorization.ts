import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// Load .env.local manually
const envContent = fs.readFileSync('.env.local', 'utf-8');
envContent.split('\n').forEach(line => {
  const [key, ...valueParts] = line.split('=');
  if (key && valueParts.length > 0) {
    process.env[key.trim()] = valueParts.join('=').trim();
  }
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string
);

// Known VC/Angel firm patterns
const VC_PATTERNS = [
  /venture/i, /capital/i, /partners$/i, /ventures$/i, /fund/i,
  /sequoia/i, /a16z/i, /andreessen/i, /accel/i, /benchmark/i,
  /greylock/i, /kleiner/i, /lightspeed/i, /general catalyst/i,
  /index/i, /first round/i, /union square/i, /bessemer/i,
  /nea/i, /insight/i, /tiger global/i, /softbank/i,
  /ggv/i, /foundry/i, /spark/i, /ribbit/i, /coatue/i,
  /dragoneer/i, /iconiq/i, /ivp/i, /menlo/i, /redpoint/i,
];

const VC_TITLE_PATTERNS = [
  /^partner$/i, /general partner/i, /managing partner/i,
  /venture partner/i, /principal/i, /^investor$/i,
  /investment/i, /portfolio/i, /associate.*venture/i,
];

const ANGEL_TITLE_PATTERNS = [
  /angel/i, /founder.*investor/i, /serial entrepreneur/i,
  /angel investor/i, /seed investor/i,
];

interface Contact {
  id: string;
  full_name: string;
  current_title: string | null;
  current_company: string | null;
  company_domain: string | null;
  category: string;
}

interface WorkHistory {
  contact_id: string;
  company_name: string;
  company_domain: string | null;
  title: string;
  is_current: boolean;
}

interface Prospect {
  company_domain: string;
  company_name: string;
}

function categorizeContact(
  contact: Contact,
  workHistory: WorkHistory[],
  prospectDomains: Set<string>,
  prospectNames: Set<string>
): { category: string; confidence: number; reason: string } {
  const title = (contact.current_title || '').toLowerCase();
  const company = (contact.current_company || '').toLowerCase();

  // Check current position for VC
  for (const pattern of VC_PATTERNS) {
    if (pattern.test(company)) {
      for (const titlePattern of VC_TITLE_PATTERNS) {
        if (titlePattern.test(title)) {
          return {
            category: 'vc',
            confidence: 0.9,
            reason: `Works at ${contact.current_company} as ${contact.current_title}`,
          };
        }
      }
    }
  }

  // Check work history for VC experience
  for (const job of workHistory) {
    const jobCompany = (job.company_name || '').toLowerCase();
    const jobTitle = (job.title || '').toLowerCase();

    for (const pattern of VC_PATTERNS) {
      if (pattern.test(jobCompany)) {
        for (const titlePattern of VC_TITLE_PATTERNS) {
          if (titlePattern.test(jobTitle)) {
            return {
              category: 'vc',
              confidence: job.is_current ? 0.9 : 0.7,
              reason: job.is_current
                ? `Currently at ${job.company_name} as ${job.title}`
                : `Previously at ${job.company_name} as ${job.title}`,
            };
          }
        }
      }
    }
  }

  // Check for angel investor
  for (const pattern of ANGEL_TITLE_PATTERNS) {
    if (pattern.test(title)) {
      return {
        category: 'angel',
        confidence: 0.8,
        reason: `Title suggests angel investor: ${contact.current_title}`,
      };
    }
  }

  // Check for investor in title
  if (/investor/i.test(title) && !/relations/i.test(title)) {
    return {
      category: 'angel',
      confidence: 0.7,
      reason: `Title contains investor: ${contact.current_title}`,
    };
  }

  // Check for sales prospect - current company matches a prospect
  const contactDomain = (contact.company_domain || '').toLowerCase().replace(/^www\./, '');
  if (contactDomain && prospectDomains.has(contactDomain)) {
    return {
      category: 'sales_prospect',
      confidence: 0.95,
      reason: `Currently works at prospect company (${contactDomain})`,
    };
  }

  // Check if current company name matches a prospect
  if (company && prospectNames.has(company)) {
    return {
      category: 'sales_prospect',
      confidence: 0.85,
      reason: `Currently works at prospect company: ${contact.current_company}`,
    };
  }

  // Check work history for sales prospect - any past/current job at a prospect company
  for (const job of workHistory) {
    const jobDomain = (job.company_domain || '').toLowerCase().replace(/^www\./, '');
    const jobCompanyLower = (job.company_name || '').toLowerCase();

    if (jobDomain && prospectDomains.has(jobDomain)) {
      return {
        category: 'sales_prospect',
        confidence: job.is_current ? 0.95 : 0.8,
        reason: job.is_current
          ? `Currently works at prospect: ${job.company_name}`
          : `Previously worked at prospect: ${job.company_name}`,
      };
    }

    if (jobCompanyLower && prospectNames.has(jobCompanyLower)) {
      return {
        category: 'sales_prospect',
        confidence: job.is_current ? 0.85 : 0.7,
        reason: job.is_current
          ? `Currently works at prospect: ${job.company_name}`
          : `Previously worked at prospect: ${job.company_name}`,
      };
    }
  }

  // If no match found, mark as irrelevant (no sales/investor connection found)
  return { category: 'irrelevant', confidence: 0.5, reason: 'No VC/Angel/Prospect connection found' };
}

async function runCategorization() {
  console.log('=== Running Contact Categorization ===\n');

  // Load all prospects to get their domains and names
  console.log('Loading prospects...');
  const { data: prospects, error: prospectError } = await supabase
    .from('prospects')
    .select('company_domain, company_name');

  if (prospectError) {
    console.error('Error loading prospects:', prospectError);
    return;
  }

  const prospectDomains = new Set<string>();
  const prospectNames = new Set<string>();

  for (const p of prospects || []) {
    if (p.company_domain) {
      // Normalize domain - remove www. prefix and lowercase
      const domain = p.company_domain.toLowerCase().replace(/^www\./, '');
      prospectDomains.add(domain);
    }
    if (p.company_name) {
      prospectNames.add(p.company_name.toLowerCase());
    }
  }

  console.log(`Loaded ${prospectDomains.size} prospect domains and ${prospectNames.size} prospect names\n`);

  // Get uncategorized contacts with their work history
  let page = 0;
  let totalProcessed = 0;
  let categorizedCount = 0;
  let vcCount = 0;
  let angelCount = 0;
  let salesProspectCount = 0;
  let irrelevantCount = 0;
  let errors = 0;

  while (true) {
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('id, full_name, current_title, current_company, company_domain, category')
      .eq('category', 'uncategorized')
      .range(page * 500, (page + 1) * 500 - 1);

    if (error) {
      console.error('Error fetching contacts:', error);
      break;
    }

    if (!contacts || contacts.length === 0) break;

    console.log(`Processing batch ${page + 1} (${contacts.length} contacts)...`);

    // Get work history for all contacts in batch
    const contactIds = contacts.map(c => c.id);
    const { data: workHistory } = await supabase
      .from('work_history')
      .select('contact_id, company_name, company_domain, title, is_current')
      .in('contact_id', contactIds);

    // Group work history by contact
    const workHistoryByContact = new Map<string, WorkHistory[]>();
    (workHistory || []).forEach(wh => {
      const existing = workHistoryByContact.get(wh.contact_id) || [];
      existing.push(wh);
      workHistoryByContact.set(wh.contact_id, existing);
    });

    // Process each contact
    const updates: Array<{
      id: string;
      category: string;
      category_confidence: number;
      category_source: string;
    }> = [];

    for (const contact of contacts) {
      const contactWorkHistory = workHistoryByContact.get(contact.id) || [];
      const result = categorizeContact(contact, contactWorkHistory, prospectDomains, prospectNames);

      // Now we categorize everything (no more uncategorized)
      updates.push({
        id: contact.id,
        category: result.category,
        category_confidence: result.confidence,
        category_source: 'rule',
      });

      if (result.category === 'vc') vcCount++;
      if (result.category === 'angel') angelCount++;
      if (result.category === 'sales_prospect') salesProspectCount++;
      if (result.category === 'irrelevant') irrelevantCount++;
      categorizedCount++;

      totalProcessed++;
    }

    // Batch update
    if (updates.length > 0) {
      for (const update of updates) {
        const { error: updateError } = await supabase
          .from('contacts')
          .update({
            category: update.category,
            category_confidence: update.category_confidence,
            category_source: update.category_source,
          })
          .eq('id', update.id);

        if (updateError) {
          console.error(`Error updating:`, updateError.message);
          errors++;
        }
      }
    }

    page++;
  }

  console.log('\n=== Complete ===');
  console.log(`Total processed: ${totalProcessed}`);
  console.log(`Categorized: ${categorizedCount}`);
  console.log(`  - VC: ${vcCount}`);
  console.log(`  - Angel: ${angelCount}`);
  console.log(`  - Sales Prospect: ${salesProspectCount}`);
  console.log(`  - Irrelevant: ${irrelevantCount}`);
  console.log(`Errors: ${errors}`);

  // Final stats
  const { data: finalStats } = await supabase
    .from('contacts')
    .select('category');

  const categories: Record<string, number> = {};
  finalStats?.forEach(c => {
    categories[c.category] = (categories[c.category] || 0) + 1;
  });

  console.log('\nFinal category breakdown:');
  for (const [cat, count] of Object.entries(categories)) {
    console.log(`  ${cat}: ${count}`);
  }
}

runCategorization().catch(console.error);
