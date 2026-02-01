#!/usr/bin/env node
// ============================================
// END-TO-END TEST SCRIPT
// ============================================
// Tests the full prospect pipeline:
// 1. Test Swarm API connection
// 2. Import seed prospects
// 3. Ingest Swarm contacts
// 4. Match prospects with connections
// 5. Score Helix fit
// ============================================

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env file manually
const envPath = join(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    const value = match[2].trim();
    if (!process.env[key]) process.env[key] = value;
  }
});

// Create Supabase admin client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SWARM_API_KEY = process.env.SWARM_API_KEY;
const SWARM_API_BASE = 'https://bee.theswarm.com/v2';

// ============================================
// HELPERS
// ============================================

async function fetchSwarmNetwork(pageSize = 50, offset = 0) {
  const response = await fetch(`${SWARM_API_BASE}/profiles/network-mapper`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': SWARM_API_KEY,
    },
    body: JSON.stringify({
      query: { match_all: {} },
      size: pageSize,
      from: offset,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Swarm API error: ${response.status} - ${text.slice(0, 200)}`);
  }

  return response.json();
}

// ============================================
// STEP 1: TEST SWARM CONNECTION
// ============================================

async function testSwarmConnection() {
  console.log('\n🔌 STEP 1: Testing Swarm API connection...');
  
  try {
    const result = await fetchSwarmNetwork(1, 0);
    console.log(`   ✅ Connected! Total profiles in network: ${result.total_count}`);
    return { success: true, totalCount: result.total_count };
  } catch (error) {
    console.error(`   ❌ Failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// ============================================
// STEP 2: GET OR CREATE TEAM
// ============================================

async function getOrCreateTeam() {
  console.log('\n👥 STEP 2: Setting up team...');
  
  // Check for existing team
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name')
    .limit(1);

  if (teams && teams.length > 0) {
    console.log(`   ✅ Using existing team: ${teams[0].name} (${teams[0].id})`);
    return teams[0].id;
  }

  // Create new team
  const { data: newTeam, error } = await supabase
    .from('teams')
    .insert({ name: 'Helix Sales Team' })
    .select()
    .single();

  if (error) {
    console.error(`   ❌ Failed to create team: ${error.message}`);
    throw error;
  }

  console.log(`   ✅ Created new team: ${newTeam.name} (${newTeam.id})`);
  return newTeam.id;
}

// ============================================
// STEP 3: IMPORT SEED PROSPECTS
// ============================================

async function importSeedProspects(teamId) {
  console.log('\n📋 STEP 3: Importing seed prospects...');
  
  // Load seed data
  const seedPath = join(__dirname, '..', 'src', 'data', 'helix-prospects-seed.json');
  const seedData = JSON.parse(readFileSync(seedPath, 'utf-8'));
  
  console.log(`   Found ${seedData.prospects.length} prospects in seed file`);
  
  let imported = 0;
  let updated = 0;
  let errors = [];

  for (const prospect of seedData.prospects) {
    try {
      const { data, error } = await supabase
        .from('prospects')
        .upsert({
          team_id: teamId,
          company_name: prospect.company_name,
          company_domain: prospect.company_domain,
          status: 'new',
        }, {
          onConflict: 'team_id,company_domain',
        })
        .select()
        .single();

      if (error) {
        errors.push(`${prospect.company_domain}: ${error.message}`);
      } else {
        // Check if it was insert or update based on created_at vs updated_at
        imported++;
      }
    } catch (err) {
      errors.push(`${prospect.company_domain}: ${err.message}`);
    }
  }

  console.log(`   ✅ Imported/updated ${imported} prospects`);
  if (errors.length > 0) {
    console.log(`   ⚠️  ${errors.length} errors (showing first 3):`);
    errors.slice(0, 3).forEach(e => console.log(`      - ${e}`));
  }
  
  return { imported, errors: errors.length };
}

// ============================================
// STEP 4: INGEST SWARM CONTACTS
// ============================================

async function ingestSwarmContacts(teamId, maxContacts = 10000) {
  console.log(`\n📥 STEP 4: Ingesting Swarm contacts (max ${maxContacts})...`);
  
  const batchSize = 50;
  let offset = 0;
  let totalIngested = 0;
  let totalUpdated = 0;
  let totalConnections = 0;
  let errors = [];

  while (offset < maxContacts) {
    try {
      const result = await fetchSwarmNetwork(batchSize, offset);
      const { items, total_count } = result;

      if (!items || items.length === 0) break;

      console.log(`   Processing batch ${Math.floor(offset/batchSize) + 1}: ${items.length} profiles (${offset + items.length}/${total_count})`);

      for (const item of items) {
        try {
          // Parse name
          const nameParts = item.profile.full_name?.split(' ') || ['Unknown'];
          const firstName = item.profile.first_name || nameParts[0] || '';
          const lastName = item.profile.last_name || nameParts.slice(1).join(' ') || '';

          // Extract domain
          let companyDomain = null;
          if (item.profile.current_company_website) {
            companyDomain = item.profile.current_company_website
              .replace(/^https?:\/\//, '')
              .replace(/^www\./, '')
              .split('/')[0];
          }

          // Best connection strength
          const bestStrength = item.connections?.length > 0
            ? Math.max(...item.connections.map(c => c.connection_strength || 0))
            : 0;

          const contactData = {
            team_id: teamId,
            swarm_profile_id: item.profile.id,
            full_name: item.profile.full_name || 'Unknown',
            first_name: firstName,
            last_name: lastName,
            email: item.profile.work_email || null,
            linkedin_url: item.profile.linkedin_url || null,
            current_title: item.profile.current_title || null,
            current_company: item.profile.current_company_name || null,
            company_domain: companyDomain,
            source: 'swarm',
            connection_strength: bestStrength,
            swarm_synced_at: new Date().toISOString(),
          };

          // Upsert contact
          const { data: existing } = await supabase
            .from('contacts')
            .select('id')
            .eq('team_id', teamId)
            .eq('swarm_profile_id', item.profile.id)
            .single();

          let contactId;
          if (existing) {
            await supabase.from('contacts').update(contactData).eq('id', existing.id);
            contactId = existing.id;
            totalUpdated++;
          } else {
            const { data: newContact, error } = await supabase
              .from('contacts')
              .insert(contactData)
              .select('id')
              .single();
            if (error) {
              errors.push(`${item.profile.full_name}: ${error.message}`);
              continue;
            }
            contactId = newContact.id;
            totalIngested++;
          }

          // Save connections
          for (const conn of item.connections || []) {
            await supabase
              .from('contact_connections')
              .upsert({
                contact_id: contactId,
                connector_name: conn.connector_name,
                connector_linkedin_url: conn.connector_linkedin_url || null,
                connection_strength: conn.connection_strength || 0,
                connection_sources: conn.sources || [],
              }, {
                onConflict: 'contact_id,connector_name',
              });
            totalConnections++;
          }
        } catch (err) {
          errors.push(`${item.profile?.full_name || 'Unknown'}: ${err.message}`);
        }
      }

      offset += items.length;
      
      // Rate limit
      await new Promise(r => setTimeout(r, 200));
      
    } catch (err) {
      console.error(`   ❌ Batch error: ${err.message}`);
      errors.push(`Batch at offset ${offset}: ${err.message}`);
      break;
    }
  }

  console.log(`   ✅ Ingested ${totalIngested} new contacts`);
  console.log(`   ✅ Updated ${totalUpdated} existing contacts`);
  console.log(`   ✅ Saved ${totalConnections} connection records`);
  if (errors.length > 0) {
    console.log(`   ⚠️  ${errors.length} errors`);
  }

  return { ingested: totalIngested, updated: totalUpdated, connections: totalConnections, errors: errors.length };
}

// ============================================
// STEP 5: MATCH PROSPECTS WITH CONNECTIONS
// ============================================

async function matchProspectsWithConnections(teamId) {
  console.log('\n🔗 STEP 5: Matching prospects with Swarm connections...');

  // Get all prospects
  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, company_name, company_domain')
    .eq('team_id', teamId);

  console.log(`   Found ${prospects?.length || 0} prospects to match`);

  let matchedCount = 0;
  let connectionCount = 0;

  for (const prospect of prospects || []) {
    // Find contacts at this company
    const { data: contacts } = await supabase
      .from('contacts')
      .select(`
        id, full_name, current_title, email, linkedin_url, connection_strength,
        contact_connections (
          connector_name,
          connection_strength,
          connection_sources
        )
      `)
      .eq('team_id', teamId)
      .eq('company_domain', prospect.company_domain);

    if (!contacts || contacts.length === 0) continue;

    matchedCount++;
    
    // Create prospect_connections for each contact
    for (const contact of contacts) {
      for (const conn of contact.contact_connections || []) {
        await supabase
          .from('prospect_connections')
          .upsert({
            prospect_id: prospect.id,
            target_name: contact.full_name,
            target_title: contact.current_title,
            target_email: contact.email,
            target_linkedin: contact.linkedin_url,
            connector_name: conn.connector_name,
            connection_strength: conn.connection_strength,
            shared_context: JSON.stringify(conn.connection_sources),
          }, {
            onConflict: 'prospect_id,target_email',
            ignoreDuplicates: true,
          });
        connectionCount++;
      }
    }

    // Update prospect with warm intro flag
    const bestStrength = Math.max(...contacts.map(c => c.connection_strength || 0));
    await supabase
      .from('prospects')
      .update({
        has_warm_intro: bestStrength >= 0.5,
        connection_score: bestStrength,
      })
      .eq('id', prospect.id);
  }

  console.log(`   ✅ Matched ${matchedCount} prospects with contacts`);
  console.log(`   ✅ Created ${connectionCount} prospect connections`);

  return { matched: matchedCount, connections: connectionCount };
}

// ============================================
// STEP 6: SCORE HELIX FIT
// ============================================

async function scoreHelixFit(teamId) {
  console.log('\n📊 STEP 6: Scoring Helix fit for all prospects...');

  // Get all prospects
  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, company_name, company_domain, connection_score')
    .eq('team_id', teamId);

  let scoredCount = 0;

  for (const prospect of prospects || []) {
    // Calculate Helix fit based on domain/name keywords
    let helixFitScore = 0.3; // Base score
    const domain = prospect.company_domain?.toLowerCase() || '';
    const name = prospect.company_name?.toLowerCase() || '';

    // High-fit keywords (ticketing, sneakers, social, gaming, identity)
    const highFitKeywords = ['ticket', 'event', 'concert', 'live', 'sneaker', 'drop', 'hype', 'social', 'game', 'gaming', 'auth', 'identity', 'verify', 'captcha', 'bot'];
    const mediumFitKeywords = ['fintech', 'bank', 'finance', 'dating', 'match', 'market', 'commerce', 'platform'];

    for (const kw of highFitKeywords) {
      if (domain.includes(kw) || name.includes(kw)) {
        helixFitScore = Math.min(1, helixFitScore + 0.3);
      }
    }
    for (const kw of mediumFitKeywords) {
      if (domain.includes(kw) || name.includes(kw)) {
        helixFitScore = Math.min(1, helixFitScore + 0.15);
      }
    }

    // Calculate priority score: helix_fit * 0.4 + connection * 0.6
    const connectionScore = prospect.connection_score || 0;
    const priorityScore = (helixFitScore * 0.4) + (connectionScore * 0.6);

    await supabase
      .from('prospects')
      .update({
        helix_fit_score: helixFitScore,
        priority_score: priorityScore,
      })
      .eq('id', prospect.id);

    scoredCount++;
  }

  console.log(`   ✅ Scored ${scoredCount} prospects`);
  return { scored: scoredCount };
}

// ============================================
// STEP 7: GENERATE SUMMARY
// ============================================

async function generateSummary(teamId) {
  console.log('\n📈 FINAL SUMMARY:');
  console.log('================');

  // Count prospects
  const { count: prospectCount } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId);

  // Count contacts
  const { count: contactCount } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId);

  // Count with warm intro
  const { count: warmIntroCount } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true })
    .eq('team_id', teamId)
    .eq('has_warm_intro', true);

  // Top prospects by priority
  const { data: topProspects } = await supabase
    .from('prospects')
    .select('company_name, company_domain, priority_score, helix_fit_score, connection_score, has_warm_intro')
    .eq('team_id', teamId)
    .order('priority_score', { ascending: false })
    .limit(10);

  console.log(`   Total Prospects: ${prospectCount}`);
  console.log(`   Total Contacts: ${contactCount}`);
  console.log(`   Prospects with Warm Intros: ${warmIntroCount}`);
  console.log('\n   🏆 TOP 10 PROSPECTS (by priority score):');
  
  topProspects?.forEach((p, i) => {
    const warmIcon = p.has_warm_intro ? '🤝' : '  ';
    console.log(`   ${i + 1}. ${warmIcon} ${p.company_name} (${p.company_domain}) - Priority: ${(p.priority_score || 0) * 100 / 100}%`);
  });

  return { prospects: prospectCount, contacts: contactCount, warmIntros: warmIntroCount };
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🚀 RELATIONSHIP INTEL - END-TO-END TEST');
  console.log('========================================');
  console.log(`   Supabase URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log(`   Swarm API Key: ${SWARM_API_KEY ? '✅ Set' : '❌ Missing'}`);

  // Step 1: Test Swarm
  const swarmTest = await testSwarmConnection();
  if (!swarmTest.success) {
    console.error('\n❌ Cannot proceed without Swarm connection');
    process.exit(1);
  }

  // Step 2: Get team
  const teamId = await getOrCreateTeam();

  // Step 3: Import prospects
  await importSeedProspects(teamId);

  // Step 4: Ingest Swarm contacts (all ~8600)
  await ingestSwarmContacts(teamId, 10000);

  // Step 5: Match prospects
  await matchProspectsWithConnections(teamId);

  // Step 6: Score fit
  await scoreHelixFit(teamId);

  // Step 7: Summary
  await generateSummary(teamId);

  console.log('\n✅ END-TO-END TEST COMPLETE!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
