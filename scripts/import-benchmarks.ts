import { resolve } from 'path';
import * as fs from 'fs';
require('dotenv').config({ path: resolve('.env.local') });

import { execute } from '../src/lib/db';

async function importBenchmarks() {
  console.log('📖 Reading tier-ai.txt...');
  const text = fs.readFileSync(resolve('tier-ai.txt'), 'utf-8');
  
  // Match everything after "examples:" on each line
  const lines = text.split('\n');
  const usernames = new Set<string>();
  
  for (const line of lines) {
    if (line.includes('examples:')) {
      const parts = line.split('examples:');
      if (parts.length > 1) {
        const namesString = parts[1].trim();
        // Split by comma
        const namesArr = namesString.split(',');
        for (let name of namesArr) {
          name = name.trim();
          if (name.endsWith('.')) {
              name = name.slice(0, -1);
          }
          if (name) {
              usernames.add(name.toLowerCase());
          }
        }
      }
    }
  }
  
  console.log(`🔍 Found ${usernames.size} unique influencers to import.`);
  
  let inserted = 0;
  let existing = 0;
  
  for (const username of usernames) {
    try {
      await execute(
        "INSERT INTO leads (username, fetch_status) VALUES (?, 'pending')",
        [username]
      );
      inserted++;
      process.stdout.write(`+ ${username} `);
    } catch (e: any) {
      if (e.message.includes('UNIQUE constraint failed') || e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        // Lead exists, reset status to pending to re-fetch with new logic
        await execute(
           "UPDATE leads SET fetch_status = 'pending' WHERE username = ?",
           [username]
        );
        existing++;
        process.stdout.write(`~ ${username} `);
      } else {
        console.error(`\n❌ Error inserting @${username}:`, e.message);
      }
    }
  }
  
  console.log(`\n\n✅ Done! Inserted: ${inserted}, Existing (Reset to Pending): ${existing}`);
  console.log('🚀 Triggering the fetcher to process these benchmarks...');
  
  try {
     const res = await fetch('http://localhost:3000/api/leads/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await res.json();
    console.log('Fetcher response:', data);
  } catch (err) {
     console.error('Failed to trigger fetcher API (it might not be running on 3000). You can run it from the UI manually or wait for the cron job.');
  }
}

importBenchmarks().catch(console.error);
