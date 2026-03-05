import Database from 'better-sqlite3';
import { createClient } from '@libsql/client';

// ─── Config ──────────────────────────────────────────────────────────────────
const LOCAL_DB = 'data/influencer-tracker.db';
const TURSO_URL = 'https://lionalyze.atticawe-aws-eu-west-1.turso.io';
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzI3MTg3MTAsImlkIjoiMDE5Y2JlM2YtZTMwMS03NWYxLTkzYmQtYmIzZjllMDYwN2I4IiwicmlkIjoiMzQ5ZmJhNjctYzczYS00NWE1LWFjNTQtYTBlZmQ2ZjRmNmE2In0.mwreZZC_BC8lrlFOqVu3p1ubOlLDgcI5WSiPJEvGGBdpbMxt-2SPxLbr5ZSktAaGhiwDqVVRFbZeXiE0QdRaCA';

const CHUNK = 50; // Turso batch limit

// ─── Connect ─────────────────────────────────────────────────────────────────
const local = new Database(LOCAL_DB, { readonly: true });
const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

// ─── Helpers ─────────────────────────────────────────────────────────────────
function buildInsert(table, cols) {
  const placeholders = cols.map(() => '?').join(', ');
  return `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`;
}

async function migrateTable(table, cols) {
  const rows = local.prepare(`SELECT ${cols.join(', ')} FROM ${table}`).all();
  console.log(`  ${table}: ${rows.length} rows`);
  if (rows.length === 0) return;

  const sql = buildInsert(table, cols);

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const statements = chunk.map(row => ({
      sql,
      args: cols.map(c => row[c] ?? null),
    }));

    let retries = 3;
    while (retries > 0) {
      try {
        await turso.batch(statements, 'write');
        break;
      } catch (err) {
        retries--;
        if (retries === 0) throw err;
        console.log(`    Retry (${3-retries}/3) for ${table} chunk ${i}...`);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    process.stdout.write(`    ${Math.min(i + CHUNK, rows.length)}/${rows.length}\r`);
  }
  console.log(`  ✅ ${table} done`);
}

// ─── Migration Order (respect FK constraints) ────────────────────────────────
console.log('🚀 Starting data migration: SQLite → Turso\n');

try {
  // 1. users (if any)
  await migrateTable('users', ['id', 'username', 'password_hash', 'created_at']);

  // 2. research
  await migrateTable('research', ['id', 'seed_type', 'seed_value', 'status', 'profiles_found', 'profiles_analyzed', 'error_message', 'created_at', 'completed_at']);

  // 3. profiles (FK → research)
  await migrateTable('profiles', ['id', 'instagram_id', 'username', 'full_name', 'bio', 'followers_count', 'following_count', 'media_count', 'profile_pic_url', 'website', 'is_verified', 'fetched_at', 'research_id']);

  // 4. media (FK → profiles)
  await migrateTable('media', ['id', 'profile_id', 'instagram_media_id', 'media_type', 'caption', 'like_count', 'comments_count', 'timestamp', 'permalink']);

  // 5. analysis_results (FK → profiles)
  await migrateTable('analysis_results', ['id', 'profile_id', 'primary_cluster', 'secondary_cluster', 'relevance_score', 'authority_score', 'engagement_rate', 'monetization_signals', 'audience_alignment', 'risk_flags', 'tier', 'tier_reason', 'content_summary', 'content_style', 'is_approved', 'rejection_reason', 'analyzed_at']);

  // 6. editor_decision_logs (FK → profiles)
  await migrateTable('editor_decision_logs', ['id', 'profile_id', 'username', 'previous_tier', 'new_tier', 'editor_reason', 'ai_summary', 'editor_note', 'created_at']);

  // 7. reports (FK → research)
  await migrateTable('reports', ['id', 'title', 'research_id', 'report_type', 'data', 'created_at']);

  // 8. leads (FK → profiles)
  await migrateTable('leads', ['id', 'username', 'instagram_url', 'csv_niche', 'csv_followers_range', 'csv_hq_score', 'csv_hq', 'fetch_status', 'error_message', 'profile_id', 'created_at', 'updated_at']);

  // 9. batch_jobs
  await migrateTable('batch_jobs', ['id', 'total_leads', 'processed', 'fetched', 'unfetchable', 'errors', 'status', 'started_at', 'completed_at', 'created_at']);

  // 10. analysis_snapshots (FK → profiles)
  await migrateTable('analysis_snapshots', ['id', 'profile_id', 'snapshot_reason', 'primary_cluster', 'secondary_cluster', 'relevance_score', 'authority_score', 'engagement_rate', 'monetization_signals', 'audience_alignment', 'tier', 'tier_reason', 'content_style', 'content_summary', 'is_approved', 'rejection_reason', 'snapshotted_at']);

  // 11. verified_profiles (FK → profiles)
  await migrateTable('verified_profiles', ['id', 'profile_id', 'tier', 'is_approved', 'rejection_reason', 'editor_tier', 'editor_note', 'verified_at']);

  console.log('\n🎉 Migration complete!');
} catch (err) {
  console.error('\n❌ Migration failed:', err.message || err);
  process.exit(1);
} finally {
  local.close();
}
