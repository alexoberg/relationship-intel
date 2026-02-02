#!/usr/bin/env node
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

const TEAM_ID = 'aa2e0a01-03e4-419c-971a-0a80b187778f';

function normLi(url) {
  if (!url) return null;
  const m = url.match(/linkedin\.com\/in\/([^\/\?#]+)/i);
  return m ? m[1].toLowerCase() : null;
}

async function main() {
  console.log('🔍 DETAILED MATCHING ANALYSIS\n');

  const swarm = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'swarm-contacts.json'), 'utf-8'));
  console.log(`Swarm contacts: ${swarm.length}`);

  // Get existing
  let all = [], page = 0;
  while (true) {
    const { data } = await supabase.from('contacts')
      .select('email, linkedin_url')
      .eq('team_id', TEAM_ID)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    page++;
    if (data.length < 1000) break;
  }
  console.log(`Existing contacts: ${all.length}`);

  const existingEmails = new Set();
  const existingLinkedins = new Set();
  for (const c of all) {
    if (c.email) existingEmails.add(c.email.toLowerCase());
    if (c.linkedin_url) {
      const norm = normLi(c.linkedin_url);
      if (norm) existingLinkedins.add(norm);
    }
  }

  console.log(`Existing unique emails: ${existingEmails.size}`);
  console.log(`Existing unique linkedins: ${existingLinkedins.size}\n`);

  // Analyze swarm matches
  let matchedByEmail = 0, matchedByLinkedin = 0, matchedByBoth = 0;
  let noMatch = 0;
  const unmatched = [];

  for (const item of swarm) {
    const p = item.profile;
    const email = p.work_email?.toLowerCase();
    const li = normLi(p.linkedin_url);

    const emailMatch = email && existingEmails.has(email);
    const liMatch = li && existingLinkedins.has(li);

    if (emailMatch && liMatch) matchedByBoth++;
    else if (emailMatch) matchedByEmail++;
    else if (liMatch) matchedByLinkedin++;
    else {
      noMatch++;
      if (unmatched.length < 20) {
        unmatched.push({
          name: p.full_name,
          email: email || '(none)',
          linkedin: li || '(none)'
        });
      }
    }
  }

  console.log('SWARM MATCHING BREAKDOWN:');
  console.log(`  Matched by BOTH email+linkedin: ${matchedByBoth}`);
  console.log(`  Matched by email only: ${matchedByEmail}`);
  console.log(`  Matched by linkedin only: ${matchedByLinkedin}`);
  console.log(`  NO MATCH: ${noMatch}`);
  console.log(`  TOTAL: ${matchedByBoth + matchedByEmail + matchedByLinkedin + noMatch}`);

  if (unmatched.length > 0) {
    console.log('\nSAMPLE UNMATCHED:');
    unmatched.forEach(u => console.log(`  ${u.name} | ${u.email} | ${u.linkedin}`));
  }
}

main().catch(console.error);
