#!/usr/bin/env node
// Add descriptions to prospects in DB
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '..', '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TEAM_ID = 'aa2e0a01-03e4-419c-971a-0a80b187778f';

// Prospect descriptions - what they do and why Helix fits
const descriptions = {
  'alt.xyz': { desc: 'Alternative asset investment platform for sports cards and collectibles. Users buy/sell fractional shares.', why_helix: 'High-value transactions attract bots and fraud. Identity verification for authenticity.' },
  'xp.events': { desc: 'Modern event ticketing platform focused on fan experience and anti-scalping.', why_helix: 'Bot Sorter prevents ticket scalping bots.' },
  'self.ai': { desc: 'Privacy-preserving proof-of-humanity using ZK proofs and biometric passports.', why_helix: 'Potential partner - complementary identity verification tech.' },
  'karmacheck.com': { desc: 'Modern background check platform for employment verification.', why_helix: 'Voice Captcha for continuous auth in sensitive verification flows.' },
  'mythicalgames.com': { desc: 'Game studio: NFL Rivals, FIFA Rivals, Pudgy Party. Uses World ID.', why_helix: 'Bot Sorter alternative to World ID for human verification.' },
  'tixr.com': { desc: 'Premium event ticketing with mobile-first experience.', why_helix: 'Anti-bot protection for high-demand events.' },
  'fizzsocial.app': { desc: 'College-only social network requiring .edu verification.', why_helix: 'Age verification and bot prevention for authentic community.' },
  'roblox.com': { desc: 'Massive gaming platform with major bot/identity issues.', why_helix: 'Bot Sorter for game integrity, Voice Captcha for age verification.' },
  'shotgun.live': { desc: 'Music event ticketing platform popular in Europe.', why_helix: 'Anti-scalping bot protection.' },
  'gametime.co': { desc: 'Last-minute ticket marketplace with dynamic pricing.', why_helix: 'Bot protection for fair ticket access.' },
  'ticketswap.com': { desc: 'Fan-to-fan ticket exchange at fair prices.', why_helix: 'Prevent reseller bots from cornering inventory.' },
  'goat.com': { desc: 'Leading sneaker and apparel marketplace with authentication.', why_helix: 'Bot protection for limited drops.' },
  'stockx.com': { desc: 'Stock market for sneakers and collectibles.', why_helix: 'Bot prevention for fair access to drops.' },
  'bumble.com': { desc: 'Dating app where women make the first move.', why_helix: 'Voice Captcha for identity verification, reduce fake profiles.' },
  'feeld.co': { desc: 'Dating app for open-minded individuals and couples.', why_helix: 'Identity verification for trust and safety.' },
  'posh.dating': { desc: 'Premium dating app with curated profiles.', why_helix: 'Identity verification to ensure authentic users.' },
  'chime.com': { desc: 'Digital banking platform with no fees.', why_helix: 'KYC identity verification for account opening.' },
  'current.com': { desc: 'Mobile banking for teens and young adults.', why_helix: 'Age verification for minors, parent consent flows.' },
  'step.com': { desc: 'Teen banking and spending card.', why_helix: 'Age verification and parental controls.' },
  'bluesky.bsky.app': { desc: 'Decentralized Twitter alternative.', why_helix: 'Bot prevention for authentic discourse.' },
  'rec Room.com': { desc: 'Social gaming and VR platform.', why_helix: 'Bot prevention and age verification for safety.' },
  'vrchat.com': { desc: 'Social VR platform with user-created worlds.', why_helix: 'Identity verification for trust in virtual spaces.' },
  'whatnot.com': { desc: 'Live shopping for collectibles and trading cards.', why_helix: 'Bot protection for fair access to limited items.' },
  'dice.fm': { desc: 'Anti-scalping ticketing with fan-first approach.', why_helix: 'Bot Sorter aligns with anti-scalping mission.' },
  'seatgeek.com': { desc: 'Ticket search and marketplace platform.', why_helix: 'Bot protection for inventory integrity.' },
  'grailed.com': { desc: 'Streetwear and designer fashion marketplace.', why_helix: 'Bot protection for limited drops.' },
  'spykegames.com': { desc: 'Mobile gaming studio focused on social games.', why_helix: 'Bot prevention for fair play.' },
  'prosopo.io': { desc: 'Privacy-first CAPTCHA alternative.', why_helix: 'Direct competitor - study their approach.' },
  'spruceid.com': { desc: 'Web3 identity infrastructure (Sign-in with Ethereum).', why_helix: 'Potential partner for decentralized identity.' },
  'footprint.io': { desc: 'Identity verification and KYC platform.', why_helix: 'Competitor - analyze their positioning.' },
};

async function main() {
  console.log('📝 ADDING PROSPECT DESCRIPTIONS\n');

  let updated = 0;
  for (const [domain, data] of Object.entries(descriptions)) {
    const { error } = await supabase
      .from('prospects')
      .update({
        description: data.desc,
        helix_fit_reason: data.why_helix,
      })
      .eq('team_id', TEAM_ID)
      .eq('company_domain', domain);

    if (!error) {
      updated++;
      console.log(`✅ ${domain}`);
    }
  }

  console.log(`\n✅ Updated ${updated} prospects with descriptions`);
}

main().catch(console.error);
