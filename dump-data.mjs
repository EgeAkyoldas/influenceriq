import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';

const db = new Database('data/influencer-tracker.db', { readonly: true });
const lines = [];

function escapeVal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  // Escape single quotes by doubling them
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

function dumpTable(table, cols) {
  const rows = db.prepare(`SELECT ${cols.join(', ')} FROM ${table}`).all();
  console.log(`${table}: ${rows.length} rows`);
  if (rows.length === 0) return;
  
  for (const row of rows) {
    const vals = cols.map(c => escapeVal(row[c])).join(', ');
    lines.push(`INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${vals});`);
  }
  lines.push(''); // blank line separator
}

// ─── Dump in FK order ────────────────────────────────────────────────────────
dumpTable('settings', ['key', 'value']);
dumpTable('research', ['id', 'seed_type', 'seed_value', 'status', 'profiles_found', 'profiles_analyzed', 'error_message', 'created_at', 'completed_at']);
dumpTable('profiles', ['id', 'instagram_id', 'username', 'full_name', 'bio', 'followers_count', 'following_count', 'media_count', 'profile_pic_url', 'website', 'is_verified', 'fetched_at', 'research_id']);
dumpTable('analysis_results', ['id', 'profile_id', 'primary_cluster', 'secondary_cluster', 'relevance_score', 'authority_score', 'engagement_rate', 'monetization_signals', 'audience_alignment', 'risk_flags', 'tier', 'tier_reason', 'content_summary', 'content_style', 'is_approved', 'rejection_reason', 'analyzed_at']);
dumpTable('editor_decision_logs', ['id', 'profile_id', 'username', 'previous_tier', 'new_tier', 'editor_reason', 'ai_summary', 'editor_note', 'created_at']);
dumpTable('leads', ['id', 'username', 'instagram_url', 'csv_niche', 'csv_followers_range', 'csv_hq_score', 'csv_hq', 'fetch_status', 'error_message', 'profile_id', 'created_at', 'updated_at']);
dumpTable('batch_jobs', ['id', 'total_leads', 'processed', 'fetched', 'unfetchable', 'errors', 'status', 'started_at', 'completed_at', 'created_at']);
dumpTable('analysis_snapshots', ['id', 'profile_id', 'snapshot_reason', 'primary_cluster', 'secondary_cluster', 'relevance_score', 'authority_score', 'engagement_rate', 'monetization_signals', 'audience_alignment', 'tier', 'tier_reason', 'content_style', 'content_summary', 'is_approved', 'rejection_reason', 'snapshotted_at']);
dumpTable('verified_profiles', ['id', 'profile_id', 'tier', 'is_approved', 'rejection_reason', 'editor_tier', 'editor_note', 'verified_at']);
dumpTable('reports', ['id', 'title', 'research_id', 'report_type', 'data', 'created_at']);

// ─── Write ───────────────────────────────────────────────────────────────────
const output = lines.join('\n');
writeFileSync('turso-seed-data.sql', output, 'utf-8');
console.log(`\n✅ turso-seed-data.sql written (${lines.length} lines, ${(output.length / 1024).toFixed(1)} KB)`);

db.close();
