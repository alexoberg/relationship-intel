import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic();

const TEAM_ID = 'aa2e0a01-03e4-419c-971a-0a80b187778f';
const BATCH_SIZE = 10;

// Valid categories in database: vc, angel, uncategorized
const CATEGORY_MAP = {
  'vc': 'vc',
  'angel': 'angel',
  'sales_target': 'uncategorized',
  'advisor': 'uncategorized',
  'other': 'uncategorized',
};

async function categorizeContacts(contacts) {
  const contactsInfo = contacts.map(c => {
    const jobHistory = c.job_history || [];
    const currentJobs = jobHistory.filter(j => j.is_current);
    const pastJobs = jobHistory.filter(j => !j.is_current).slice(0, 5);

    return {
      id: c.id,
      name: c.full_name,
      current_company: c.current_company,
      current_title: c.current_title,
      current_jobs: currentJobs.map(j => `${j.title} at ${j.company}`).join(', '),
      past_jobs: pastJobs.map(j => `${j.title} at ${j.company}`).join(', '),
    };
  });

  const prompt = `Analyze these contacts and categorize each one into ONE primary category.

Categories (pick the BEST fit):
- vc: Venture capitalist, works at VC firm, partner/associate/analyst at investment fund, works at firm with "Ventures", "Capital", "Partners" in name
- angel: Angel investor, wealthy individual who invests in startups, successful founder/exec who likely invests
- other: Everyone else (employees at tech companies, regular professionals, etc.)

Contacts to categorize:
${JSON.stringify(contactsInfo, null, 2)}

Return ONLY valid JSON:
{
  "results": [
    {"id": "uuid", "category": "vc|angel|other"},
    ...
  ]
}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');

  return JSON.parse(jsonMatch[0]).results;
}

async function main() {
  console.log('Fetching contacts for AI categorization...');

  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, full_name, current_title, current_company, job_history, category')
    .eq('team_id', TEAM_ID)
    .not('job_history', 'is', null);

  if (error) throw error;

  // Filter to those without category or uncategorized
  const needsCategorization = contacts.filter(c => !c.category || c.category === '' || c.category === 'uncategorized');

  console.log(`Found ${contacts.length} contacts with job_history`);
  console.log(`${needsCategorization.length} need AI categorization`);

  if (needsCategorization.length === 0) {
    console.log('All contacts already categorized!');
    return;
  }

  let processed = 0;
  let errors = 0;
  const categoryStats = { vc: 0, angel: 0, uncategorized: 0 };

  for (let i = 0; i < needsCategorization.length; i += BATCH_SIZE) {
    const batch = needsCategorization.slice(i, i + BATCH_SIZE);

    try {
      const results = await categorizeContacts(batch);

      for (const result of results) {
        // Map AI category to valid database category
        const aiCategory = result.category || 'other';
        const dbCategory = CATEGORY_MAP[aiCategory] || 'uncategorized';

        const { error: updateError } = await supabase
          .from('contacts')
          .update({
            category: dbCategory,
            category_source: 'ai',
          })
          .eq('id', result.id);

        if (updateError) {
          console.error(`Error updating ${result.id}:`, updateError.message);
          errors++;
        } else {
          processed++;
          if (categoryStats[dbCategory] !== undefined) categoryStats[dbCategory]++;
        }
      }

      console.log(`Processed ${Math.min(i + BATCH_SIZE, needsCategorization.length)}/${needsCategorization.length} (${processed} updated, ${errors} errors)`);
      await new Promise(r => setTimeout(r, 1000));

    } catch (err) {
      console.error(`Batch error at ${i}:`, err.message);
      errors += batch.length;
    }
  }

  console.log('\n=== AI Categorization Complete ===');
  console.log(`Processed: ${processed}`);
  console.log(`Errors: ${errors}`);
  console.log('\nCategory distribution:');
  Object.entries(categoryStats).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count}`);
  });

  // Show final counts
  const { count: vcCount } = await supabase.from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', TEAM_ID)
    .eq('category', 'vc');
  const { count: angelCount } = await supabase.from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', TEAM_ID)
    .eq('category', 'angel');

  console.log('\n=== Total in Database ===');
  console.log(`  VCs: ${vcCount}`);
  console.log(`  Angels: ${angelCount}`);
}

main().catch(console.error);
