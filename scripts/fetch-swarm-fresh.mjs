#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
});

const SWARM_API_KEY = process.env.SWARM_API_KEY;
const SWARM_API_BASE = 'https://bee.theswarm.com/v2';

async function fetchPage(size, offset) {
  const response = await fetch(`${SWARM_API_BASE}/profiles/network-mapper`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': SWARM_API_KEY,
    },
    body: JSON.stringify({
      query: { match_all: {} },
      size,
      from: offset,
    }),
  });
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  return response.json();
}

async function main() {
  console.log('🔄 FRESH SWARM FETCH\n');

  // Get total count
  const test = await fetchPage(1, 0);
  const total = test.total_count;
  console.log(`Total in Swarm: ${total}\n`);

  const allItems = [];
  const seenIds = new Set();
  const pageSize = 100;
  let offset = 0;

  while (offset < total) {
    const pct = Math.round((offset / total) * 100);
    process.stdout.write(`\r${offset}/${total} (${pct}%) - ${allItems.length} unique`);

    const result = await fetchPage(pageSize, offset);
    if (!result.items || result.items.length === 0) break;

    for (const item of result.items) {
      const id = item.profile?.id;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        allItems.push(item);
      }
    }

    offset += result.items.length;
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n\n✅ Fetched ${allItems.length} UNIQUE contacts`);

  // Save
  const outPath = join(__dirname, '..', 'data', 'swarm-fresh.json');
  writeFileSync(outPath, JSON.stringify(allItems, null, 2));
  console.log(`💾 Saved to ${outPath}`);
}

main().catch(console.error);
