#!/usr/bin/env node
// Direct Swarm to Supabase upsert - with rate limit handling

const SWARM_API = 'https://bee.theswarm.com/v2/profiles/network-mapper';
const SWARM_KEY = process.env.SWARM_API_KEY;
const SUPABASE_URL = 'https://qqfqpjjquiktljofctby.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEAM_ID = '4a494f67-5e07-4e1b-a5de-32ad4dcdb285';
const OWNER_ID = '10846680-69ac-4e2a-a8ec-2e6c263f5765';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchSwarmPage(offset, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(SWARM_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': SWARM_KEY },
      body: JSON.stringify({ query: { match_all: {} }, size: 50, from: offset }),
    });

    if (res.ok) {
      return await res.json();
    }

    if (res.status === 429) {
      const waitTime = (attempt + 1) * 5000; // 5s, 10s, 15s
      console.log(`Rate limited at offset ${offset}, waiting ${waitTime/1000}s...`);
      await sleep(waitTime);
      continue;
    }

    console.error(`Swarm API error: ${res.status}`);
    return null;
  }
  return null;
}

async function fetchAllSwarm() {
  const all = [];
  let offset = 0;

  while (true) {
    if (offset % 500 === 0) console.log(`Fetching Swarm offset ${offset}...`);

    const data = await fetchSwarmPage(offset);
    if (!data || !data.items || data.items.length === 0) break;

    all.push(...data.items);
    offset += data.items.length;

    // Delay between requests - be gentle with the API
    await sleep(300);
  }

  console.log(`\nTotal fetched: ${all.length} contacts from Swarm\n`);
  return all;
}

async function upsertContact(item) {
  const profile = item.profile;

  const nameParts = profile.full_name?.split(' ') || ['Unknown'];
  const firstName = profile.first_name || nameParts[0] || '';
  const lastName = profile.last_name || nameParts.slice(1).join(' ') || '';

  let companyDomain = null;
  if (profile.current_company_website) {
    companyDomain = profile.current_company_website
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0];
  }

  const bestStrength = item.connections?.length > 0
    ? Math.max(...item.connections.map(c => c.connection_strength || 0))
    : 0;

  const contactData = {
    owner_id: OWNER_ID,
    team_id: TEAM_ID,
    swarm_profile_id: profile.id,
    full_name: profile.full_name || 'Unknown',
    first_name: firstName,
    last_name: lastName,
    email: profile.work_email || null,
    linkedin_url: profile.linkedin_url || null,
    current_title: profile.current_title || null,
    current_company: profile.current_company_name || null,
    company_domain: companyDomain,
    source: 'swarm',
    connection_strength: bestStrength,
    swarm_synced_at: new Date().toISOString(),
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/contacts?on_conflict=team_id,swarm_profile_id`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(contactData),
  });

  if (!res.ok) {
    const err = await res.text();
    return { success: false, error: err.slice(0, 150) };
  }

  return { success: true };
}

async function main() {
  if (!SWARM_KEY || !SUPABASE_KEY) {
    console.error('Missing SWARM_API_KEY or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  console.log('=== Swarm Contact Upsert ===\n');

  // Fetch all from Swarm
  const swarmContacts = await fetchAllSwarm();
  if (swarmContacts.length === 0) {
    console.log('No contacts fetched, exiting.');
    process.exit(1);
  }

  let success = 0, errors = 0;
  const errorSamples = [];

  for (let i = 0; i < swarmContacts.length; i++) {
    const result = await upsertContact(swarmContacts[i]);

    if (result.success) {
      success++;
    } else {
      errors++;
      if (errorSamples.length < 5) {
        errorSamples.push(result.error);
      }
    }

    if ((i + 1) % 500 === 0) {
      console.log(`Progress: ${i + 1}/${swarmContacts.length} | ${success} ok, ${errors} err`);
    }

    // Gentle rate limiting for Supabase
    if ((i + 1) % 20 === 0) {
      await sleep(50);
    }
  }

  console.log(`\n=== COMPLETE ===`);
  console.log(`Total processed: ${swarmContacts.length}`);
  console.log(`Success: ${success}`);
  console.log(`Errors: ${errors}`);

  if (errorSamples.length > 0) {
    console.log('\nError samples:');
    errorSamples.forEach(e => console.log(' -', e));
  }
}

main().catch(console.error);
