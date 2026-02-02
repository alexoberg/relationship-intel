#!/usr/bin/env node
// Export prospects to CSV
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
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

async function main() {
  console.log('📊 EXPORTING PROSPECTS TO CSV\n');

  const { data: prospects, error } = await supabase
    .from('prospects')
    .select(`
      company_name,
      company_domain,
      company_industry,
      funding_stage,
      description,
      helix_fit_score,
      helix_fit_reason,
      priority_score,
      connection_score,
      has_warm_intro,
      best_connector,
      connections_count,
      status
    `)
    .eq('team_id', TEAM_ID)
    .order('priority_score', { ascending: false });

  if (error) {
    console.log(`❌ Error: ${error.message}`);
    return;
  }

  const headers = [
    'Company Name',
    'Website',
    'Industry',
    'Funding Stage',
    'Description',
    'Helix Fit Score',
    'Why Helix Fits',
    'Priority Score',
    'Connection Score',
    'Has Warm Intro',
    'Best Connector',
    'Connections Count',
    'Status',
  ];

  const escapeCSV = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = prospects.map(p => [
    p.company_name,
    p.company_domain,
    p.company_industry,
    p.funding_stage,
    p.description,
    p.helix_fit_score,
    p.helix_fit_reason,
    p.priority_score,
    p.connection_score,
    p.has_warm_intro ? 'Yes' : 'No',
    p.best_connector,
    p.connections_count,
    p.status,
  ].map(escapeCSV).join(','));

  const csv = [headers.join(','), ...rows].join('\n');

  const filename = `helix-prospects-${new Date().toISOString().split('T')[0]}.csv`;
  const outputPath = join(__dirname, '..', filename);
  writeFileSync(outputPath, csv);

  console.log(`✅ Exported ${prospects.length} prospects to ${filename}`);
  console.log(`   Path: ${outputPath}`);
}

main().catch(console.error);
