#!/usr/bin/env node
/**
 * Update Priority Scores for All Prospects
 * Computes helix_fit_score and connection_score, which drives priority_score
 * 
 * priority_score = (helix_fit_score * 0.4 + connection_score * 0.6)
 */
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

// Helix fit scoring weights
const HELIX_SCORING = {
  // Base score per product (having products = good fit)
  perProduct: 25,
  maxProductScore: 60,
  
  // Known high-value customer signals
  knownCustomerBonus: 30,
  knownCustomers: [
    'ticketmaster', 'stubhub', 'draftkings', 'fanduel', 'reddit',
    'twitter', 'x.com', 'instagram', 'tiktok', 'roblox', 'discord',
    'spotify', 'pinterest', 'onlyfans', 'twitch', 'youtube'
  ],
  
  // Industry bonuses
  industryScores: {
    'ticketing': 20,
    'events': 15,
    'gaming': 20,
    'gambling': 25,
    'social': 15,
    'marketplace': 15,
    'fintech': 15,
    'e-commerce': 10,
    'adult': 25,
  },
};

// Connection scoring weights
const CONNECTION_SCORING = {
  // Per current employee
  currentEmployee: 20,
  // Per alumni
  alumni: 10,
  // Max from connections alone
  maxConnectionScore: 80,
  // Bonus for having warm intro
  warmIntroBonus: 20,
};

function calculateHelixFitScore(prospect) {
  let score = 0;
  
  // Score from products
  const products = prospect.helix_products || [];
  score += Math.min(products.length * HELIX_SCORING.perProduct, HELIX_SCORING.maxProductScore);
  
  // Known customer bonus
  const domain = (prospect.company_domain || '').toLowerCase();
  const name = (prospect.company_name || '').toLowerCase();
  for (const customer of HELIX_SCORING.knownCustomers) {
    if (domain.includes(customer) || name.includes(customer)) {
      score += HELIX_SCORING.knownCustomerBonus;
      break;
    }
  }
  
  // Industry bonus
  const industry = (prospect.company_industry || '').toLowerCase();
  for (const [ind, bonus] of Object.entries(HELIX_SCORING.industryScores)) {
    if (industry.includes(ind)) {
      score += bonus;
      break;
    }
  }
  
  return Math.min(score, 100);
}

function calculateConnectionScore(prospect, connections) {
  let score = 0;
  
  // Score from connections
  const currentEmployees = connections.filter(c => c.relationship_type === 'current_employee');
  const alumni = connections.filter(c => c.relationship_type === 'alumni');
  
  score += Math.min(
    currentEmployees.length * CONNECTION_SCORING.currentEmployee +
    alumni.length * CONNECTION_SCORING.alumni,
    CONNECTION_SCORING.maxConnectionScore
  );
  
  // Warm intro bonus
  if (prospect.has_warm_intro) {
    score += CONNECTION_SCORING.warmIntroBonus;
  }
  
  return Math.min(score, 100);
}

async function main() {
  console.log('=== Updating Priority Scores ===\n');

  // Get all prospects
  const { data: prospects, error: pErr } = await supabase
    .from('prospects')
    .select('*')
    .eq('team_id', TEAM_ID);

  if (pErr) throw pErr;
  console.log(`Found ${prospects.length} prospects`);

  // Get all connections
  const { data: allConnections, error: cErr } = await supabase
    .from('prospect_connections')
    .select('*')
    .eq('team_id', TEAM_ID);

  if (cErr) throw cErr;
  console.log(`Found ${allConnections.length} connections\n`);

  // Group connections by prospect_id
  const connectionsByProspect = new Map();
  for (const conn of allConnections) {
    if (!connectionsByProspect.has(conn.prospect_id)) {
      connectionsByProspect.set(conn.prospect_id, []);
    }
    connectionsByProspect.get(conn.prospect_id).push(conn);
  }

  // Calculate and update scores
  let updated = 0;
  const scoreStats = { 
    helix_fit_score: { min: 100, max: 0, sum: 0 },
    connection_score: { min: 100, max: 0, sum: 0 },
    priority_score: { min: 100, max: 0, sum: 0 }
  };

  for (const prospect of prospects) {
    const connections = connectionsByProspect.get(prospect.id) || [];
    
    const helix_fit_score = calculateHelixFitScore(prospect);
    const connection_score = calculateConnectionScore(prospect, connections);
    
    // priority_score is computed automatically in DB, but let's track it
    const priority_score = Math.round(helix_fit_score * 0.4 + connection_score * 0.6);
    
    // Update stats
    scoreStats.helix_fit_score.min = Math.min(scoreStats.helix_fit_score.min, helix_fit_score);
    scoreStats.helix_fit_score.max = Math.max(scoreStats.helix_fit_score.max, helix_fit_score);
    scoreStats.helix_fit_score.sum += helix_fit_score;
    
    scoreStats.connection_score.min = Math.min(scoreStats.connection_score.min, connection_score);
    scoreStats.connection_score.max = Math.max(scoreStats.connection_score.max, connection_score);
    scoreStats.connection_score.sum += connection_score;
    
    scoreStats.priority_score.min = Math.min(scoreStats.priority_score.min, priority_score);
    scoreStats.priority_score.max = Math.max(scoreStats.priority_score.max, priority_score);
    scoreStats.priority_score.sum += priority_score;

    // Update database
    const { error: updateErr } = await supabase
      .from('prospects')
      .update({
        helix_fit_score,
        connection_score,
      })
      .eq('id', prospect.id);

    if (updateErr) {
      console.error(`Error updating ${prospect.company_name}:`, updateErr.message);
    } else {
      updated++;
      if (priority_score >= 70) {
        console.log(`🔥 ${prospect.company_name}: priority=${priority_score} (helix=${helix_fit_score}, conn=${connection_score})`);
      }
    }
  }

  console.log(`\n=== Updated ${updated} prospects ===\n`);
  
  // Print stats
  console.log('Score Statistics:');
  for (const [name, stats] of Object.entries(scoreStats)) {
    const avg = Math.round(stats.sum / prospects.length);
    console.log(`  ${name}: min=${stats.min}, max=${stats.max}, avg=${avg}`);
  }

  // Show top 20 prospects by priority
  console.log('\n=== Top 20 Prospects by Priority ===');
  const { data: topProspects } = await supabase
    .from('prospects')
    .select('company_name, priority_score, helix_fit_score, connection_score, has_warm_intro, helix_products')
    .eq('team_id', TEAM_ID)
    .order('priority_score', { ascending: false })
    .limit(20);

  for (let i = 0; i < topProspects.length; i++) {
    const p = topProspects[i];
    const warm = p.has_warm_intro ? '🤝' : '  ';
    const products = (p.helix_products || []).map(prod => prod.charAt(0).toUpperCase()).join('');
    console.log(`${(i+1).toString().padStart(2)}. ${warm} ${p.company_name.padEnd(25)} priority=${p.priority_score.toString().padStart(2)} (helix=${p.helix_fit_score.toString().padStart(2)}, conn=${p.connection_score.toString().padStart(2)}) [${products}]`);
  }
}

main().catch(console.error);
