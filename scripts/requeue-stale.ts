import { resolve } from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: resolve('.env.local') });

import { execute, getAll } from '../src/lib/db';

/**
 * Temporal Decay Autoregulation Script
 * 
 * Target: Finds profiles that were analyzed more than 45 days ago,
 * specifically those in Tier B or C (potentials), and resets their 
 * lead status to 'pending' so the batch processor can pick them up again.
 * 
 * Cybernetics: Ensures the AI's worldview doesn't stagnate while creators improve.
 */
async function requeueStaleProfiles() {
  console.log('⏳ Checking for stale profiles (Temporal Decay Autoregulation)...');

  // Find profiles (B/C tier) aged > 45 days
  const staleLeads = await getAll<{ username: string; tier: string; analyzed_at: string }>(`
    SELECT p.username, a.tier, a.analyzed_at 
    FROM analysis_results a
    JOIN profiles p ON a.profile_id = p.id
    WHERE a.tier IN ('B', 'C') 
      AND a.analyzed_at < datetime('now', '-45 days')
  `);

  if (staleLeads.length === 0) {
    console.log('✅ No stale profiles found. The ecosystem is fresh.');
    return;
  }

  console.log(`♻️ Found ${staleLeads.length} stale profiles. Re-queueing...`);

  let count = 0;
  for (const lead of staleLeads) {
    try {
      // The historical analysis remains in `analysis_results` until the AI overwrites it,
      // and the old analysis will be safely snapshotted by the re-verify logic if needed.
      await execute(
         "UPDATE leads SET fetch_status = 'pending', updated_at = datetime('now') WHERE username = ?",
         [lead.username]
      );
      count++;
      console.log(`  🔄 Re-queued @${lead.username} (Was Tier ${lead.tier}, analyzed on ${lead.analyzed_at})`);
    } catch (error: unknown) {
      const e = error as Error;
      console.error(`  ❌ Failed to re-queue @${lead.username}:`, e.message);
    }
  }

  console.log(`🏁 Successfully reset ${count} leads to pending state for the next batch run.`);
}

requeueStaleProfiles().catch(console.error);
