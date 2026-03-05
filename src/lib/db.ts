import { createClient, type Client, type InArgs, type ResultSet } from '@libsql/client';

let client: Client | null = null;
let schemaInitialized = false;

export function getClient(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
      throw new Error('TURSO_DATABASE_URL environment variable is required');
    }

    client = createClient({ url, authToken });
  }
  return client;
}

/** Run a write/mutation query. Returns { lastInsertRowid, rowsAffected }. */
export async function execute(sql: string, args: InArgs = []): Promise<ResultSet> {
  const c = getClient();
  await ensureSchema(c);
  return c.execute({ sql, args });
}

/** Run a read query, return the first row or null. */
export async function getOne<T = Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T | null> {
  const c = getClient();
  await ensureSchema(c);
  const result = await c.execute({ sql, args });
  return (result.rows[0] as T) ?? null;
}

/** Run a read query, return all rows. */
export async function getAll<T = Record<string, unknown>>(sql: string, args: InArgs = []): Promise<T[]> {
  const c = getClient();
  await ensureSchema(c);
  const result = await c.execute({ sql, args });
  return result.rows as T[];
}

/** Run multiple statements in a batch (write transaction). */
export async function batch(statements: Array<{ sql: string; args?: InArgs }>) {
  const c = getClient();
  await ensureSchema(c);
  return c.batch(
    statements.map(s => ({ sql: s.sql, args: s.args ?? [] })),
    'write'
  );
}

// ─── Schema Initialization ───────────────────────────────────────────────────

async function ensureSchema(c: Client) {
  if (schemaInitialized) return;
  schemaInitialized = true;

  await c.batch(
    [
      {
        sql: `CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS research (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          seed_type TEXT NOT NULL CHECK(seed_type IN ('username', 'hashtag', 'csv')),
          seed_value TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'fetching', 'analyzing', 'complete', 'failed')),
          profiles_found INTEGER DEFAULT 0,
          profiles_analyzed INTEGER DEFAULT 0,
          error_message TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          completed_at TEXT
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          instagram_id TEXT UNIQUE,
          username TEXT NOT NULL,
          full_name TEXT DEFAULT '',
          bio TEXT DEFAULT '',
          followers_count INTEGER DEFAULT 0,
          following_count INTEGER DEFAULT 0,
          media_count INTEGER DEFAULT 0,
          profile_pic_url TEXT DEFAULT '',
          website TEXT DEFAULT '',
          is_verified INTEGER DEFAULT 0,
          fetched_at TEXT DEFAULT (datetime('now')),
          research_id INTEGER,
          FOREIGN KEY (research_id) REFERENCES research(id) ON DELETE CASCADE
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS media (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          profile_id INTEGER NOT NULL,
          instagram_media_id TEXT UNIQUE,
          media_type TEXT DEFAULT 'IMAGE',
          caption TEXT DEFAULT '',
          like_count INTEGER DEFAULT 0,
          comments_count INTEGER DEFAULT 0,
          timestamp TEXT,
          permalink TEXT DEFAULT '',
          FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS analysis_results (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          profile_id INTEGER UNIQUE NOT NULL,
          primary_cluster TEXT CHECK(primary_cluster IN ('dating', 'mindset', 'relationships', 'masculinity')),
          secondary_cluster TEXT CHECK(secondary_cluster IS NULL OR secondary_cluster IN ('dating', 'mindset', 'relationships', 'masculinity')),
          relevance_score REAL DEFAULT 0,
          authority_score REAL DEFAULT 0,
          engagement_rate REAL DEFAULT 0,
          monetization_signals TEXT DEFAULT '[]',
          audience_alignment REAL DEFAULT 0,
          risk_flags TEXT DEFAULT '[]',
          tier TEXT CHECK(tier IN ('S', 'A', 'B', 'C', 'D')),
          tier_reason TEXT DEFAULT '',
          content_summary TEXT DEFAULT '',
          content_style TEXT DEFAULT 'Unknown',
          is_approved INTEGER DEFAULT NULL,
          rejection_reason TEXT DEFAULT NULL,
          analyzed_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS editor_decision_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          profile_id INTEGER NOT NULL,
          username TEXT NOT NULL,
          previous_tier TEXT,
          new_tier TEXT NOT NULL,
          editor_reason TEXT NOT NULL,
          ai_summary TEXT DEFAULT '',
          editor_note TEXT DEFAULT '',
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
        )`,
      },
      { sql: `CREATE INDEX IF NOT EXISTS idx_decision_logs_profile ON editor_decision_logs(profile_id)` },
      { sql: `CREATE INDEX IF NOT EXISTS idx_decision_logs_created ON editor_decision_logs(created_at)` },
      {
        sql: `CREATE TABLE IF NOT EXISTS reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          research_id INTEGER,
          report_type TEXT CHECK(report_type IN ('leaderboard', 'cluster_distribution', 'full_analysis')),
          data TEXT DEFAULT '{}',
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (research_id) REFERENCES research(id) ON DELETE SET NULL
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS leads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          instagram_url TEXT,
          csv_niche TEXT,
          csv_followers_range TEXT,
          csv_hq_score REAL DEFAULT 0,
          csv_hq INTEGER DEFAULT 0,
          fetch_status TEXT DEFAULT 'pending' CHECK(fetch_status IN ('pending', 'fetching', 'fetched', 'unfetchable', 'error')),
          error_message TEXT,
          profile_id INTEGER REFERENCES profiles(id),
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS batch_jobs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          total_leads INTEGER DEFAULT 0,
          processed INTEGER DEFAULT 0,
          fetched INTEGER DEFAULT 0,
          unfetchable INTEGER DEFAULT 0,
          errors INTEGER DEFAULT 0,
          status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'complete', 'cancelled')),
          started_at TEXT,
          completed_at TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS analysis_snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          profile_id INTEGER NOT NULL,
          snapshot_reason TEXT DEFAULT 'reverify',
          primary_cluster TEXT,
          secondary_cluster TEXT,
          relevance_score REAL,
          authority_score REAL,
          engagement_rate REAL,
          monetization_signals TEXT DEFAULT '[]',
          audience_alignment REAL,
          tier TEXT,
          tier_reason TEXT,
          content_style TEXT,
          content_summary TEXT,
          is_approved INTEGER,
          rejection_reason TEXT,
          snapshotted_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
        )`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS verified_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          profile_id INTEGER UNIQUE NOT NULL,
          tier TEXT CHECK(tier IN ('S', 'A', 'B', 'C', 'D')),
          is_approved INTEGER DEFAULT 0,
          rejection_reason TEXT,
          editor_tier TEXT DEFAULT NULL,
          editor_note TEXT DEFAULT NULL,
          verified_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
        )`,
      },
      { sql: `CREATE INDEX IF NOT EXISTS idx_leads_username ON leads(username)` },
      { sql: `CREATE INDEX IF NOT EXISTS idx_leads_fetch_status ON leads(fetch_status)` },
      { sql: `CREATE INDEX IF NOT EXISTS idx_leads_csv_niche ON leads(csv_niche)` },
    ],
    'write'
  );

  // Insert default settings
  await c.batch(
    [
      { sql: `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, args: ['min_followers', '5000'] },
      { sql: `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, args: ['min_engagement_rate', '1.0'] },
      { sql: `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, args: ['min_english_content', '60'] },
      { sql: `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, args: ['min_posts_per_month', '2'] },
    ],
    'write'
  );
}
