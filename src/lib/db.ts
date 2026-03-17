/**
 * Turso Database Client — Native Fetch Implementation
 * 
 * Bypasses @libsql/client entirely (its node-fetch causes TLS failures
 * on Node v24 / Vercel). Uses Turso HTTP Pipeline API directly with
 * native fetch.
 */

// Re-export InValue type for API routes that import it
export type InValue = string | number | null | boolean | Uint8Array;

interface TursoResult {
  cols: Array<{ name: string; decltype: string | null }>;
  rows: Array<Array<{ type: string; value: string | number | null }>>;
  affected_row_count: number;
  last_insert_rowid: string | null;
}

interface TursoPipelineResponse {
  baton: string | null;
  base_url: string | null;
  results: Array<{
    type: 'ok' | 'error';
    response?: { type: string; result: TursoResult };
    error?: { message: string; code: string };
  }>;
}

export interface ResultSet {
  columns: string[];
  rows: Record<string, unknown>[];
  rowsAffected: number;
  lastInsertRowid: bigint | null;
}

let schemaInitialized = false;

function getConfig() {
  const rawUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  
  if (!rawUrl) {
    console.error('[DB] ❌ TURSO_DATABASE_URL is NOT set. Available env keys:', Object.keys(process.env).filter(k => k.startsWith('TURSO')).join(', ') || '(none)');
    throw new Error('TURSO_DATABASE_URL is required');
  }
  if (!authToken) {
    console.error('[DB] ❌ TURSO_AUTH_TOKEN is NOT set. Available env keys:', Object.keys(process.env).filter(k => k.startsWith('TURSO')).join(', ') || '(none)');
    throw new Error('TURSO_AUTH_TOKEN is required');
  }

  // Convert libsql:// to https://
  const httpUrl = rawUrl.replace('libsql://', 'https://');
  console.log(`[DB] Config OK → ${httpUrl.substring(0, 40)}... token=${authToken.substring(0, 8)}...`);
  return { httpUrl, authToken };
}

function serializeArgs(args: InValue[]): Array<{ type: string; value: string | number | null }> {
  return args.map(a => {
    if (a === null || a === undefined) return { type: 'null', value: null };
    if (typeof a === 'number') {
      return Number.isInteger(a) 
        ? { type: 'integer', value: String(a) }
        : { type: 'float', value: a };
    }
    if (typeof a === 'boolean') return { type: 'integer', value: a ? '1' : '0' };
    return { type: 'text', value: String(a) };
  });
}

function rowToObject(cols: Array<{ name: string }>, row: Array<{ type: string; value: string | number | null }>): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < cols.length; i++) {
    const cell = row[i];
    if (cell.type === 'null' || cell.value === null) {
      obj[cols[i].name] = null;
    } else if (cell.type === 'integer') {
      obj[cols[i].name] = parseInt(String(cell.value), 10);
    } else if (cell.type === 'float') {
      obj[cols[i].name] = typeof cell.value === 'number' ? cell.value : parseFloat(String(cell.value));
    } else {
      obj[cols[i].name] = cell.value;
    }
  }
  return obj;
}

type PipelineRequest = 
  | { type: 'execute'; stmt: { sql: string; args?: Array<{ type: string; value: string | number | null }> } }
  | { type: 'close' };

async function pipeline(requests: PipelineRequest[]): Promise<TursoPipelineResponse> {
  const { httpUrl, authToken } = getConfig();
  const url = `${httpUrl}/v2/pipeline`;
  const sqlPreview = requests
    .filter(r => r.type === 'execute')
    .map(r => (r as { type: 'execute'; stmt: { sql: string } }).stmt.sql.substring(0, 80))
    .join(' | ');
  
  const startMs = Date.now();
  console.log(`[DB] Pipeline → ${requests.filter(r => r.type === 'execute').length} stmt(s): ${sqlPreview}`);
  
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });
  } catch (fetchError) {
    const elapsed = Date.now() - startMs;
    console.error(`[DB] ❌ Fetch FAILED after ${elapsed}ms → ${url}`, fetchError);
    throw fetchError;
  }

  const elapsed = Date.now() - startMs;

  if (!res.ok) {
    const text = await res.text();
    console.error(`[DB] ❌ Turso HTTP ${res.status} after ${elapsed}ms: ${text.substring(0, 500)}`);
    throw new Error(`Turso HTTP error ${res.status}: ${text}`);
  }

  console.log(`[DB] ✅ Pipeline OK (${elapsed}ms, status=${res.status})`);
  return res.json();
}

async function executeRaw(sql: string, args: InValue[] = []): Promise<ResultSet> {
  const serialized = serializeArgs(args);
  const resp = await pipeline([
    { type: 'execute', stmt: { sql, args: serialized } },
    { type: 'close' },
  ]);

  const first = resp.results[0];
  if (first.type === 'error') {
    console.error(`[DB] ❌ SQL Error for query: ${sql.substring(0, 120)}`, first.error);
    throw new Error(`SQL Error: ${first.error?.message || 'Unknown'} (code: ${first.error?.code || '?'})`);
  }

  const result = first.response!.result;
  const rowCount = result.rows.length;
  console.log(`[DB] Query returned ${rowCount} row(s), ${result.affected_row_count} affected`);
  return {
    columns: result.cols.map(c => c.name),
    rows: result.rows.map(row => rowToObject(result.cols, row)),
    rowsAffected: result.affected_row_count,
    lastInsertRowid: result.last_insert_rowid ? BigInt(result.last_insert_rowid) : null,
  };
}

/** Run a write/mutation query. Returns { lastInsertRowid, rowsAffected }. */
export async function execute(sql: string, args: InValue[] = []): Promise<ResultSet> {
  await ensureSchema();
  return executeRaw(sql, args);
}

/** Run a read query, return the first row or null. */
export async function getOne<T = Record<string, unknown>>(sql: string, args: InValue[] = []): Promise<T | null> {
  await ensureSchema();
  const result = await executeRaw(sql, args);
  return (result.rows[0] as T) ?? null;
}

/** Run a read query, return all rows. */
export async function getAll<T = Record<string, unknown>>(sql: string, args: InValue[] = []): Promise<T[]> {
  await ensureSchema();
  const result = await executeRaw(sql, args);
  return result.rows as T[];
}

/** Run multiple statements in a batch (sequential pipeline). */
export async function batch(statements: Array<{ sql: string; args?: InValue[] }>) {
  await ensureSchema();
  const requests: PipelineRequest[] = statements.map(s => ({
    type: 'execute' as const,
    stmt: {
      sql: s.sql,
      args: s.args ? serializeArgs(s.args) : [],
    },
  }));
  requests.push({ type: 'close' });

  const resp = await pipeline(requests as Parameters<typeof pipeline>[0]);

  for (const r of resp.results) {
    if (r.type === 'error') {
      throw new Error(`Batch SQL Error: ${r.error?.message || 'Unknown'}`);
    }
  }
  return resp.results;
}

async function ensureSchema() {
  if (schemaInitialized) return;
  schemaInitialized = true; // Set early to prevent recursion
  console.log('[DB] 🔧 Schema initialization starting...');

  try {
    const stmts = [
      `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS research (id INTEGER PRIMARY KEY AUTOINCREMENT, seed_type TEXT NOT NULL CHECK(seed_type IN ('username','hashtag','csv')), seed_value TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','fetching','analyzing','complete','failed')), profiles_found INTEGER DEFAULT 0, profiles_analyzed INTEGER DEFAULT 0, error_message TEXT, created_at TEXT DEFAULT (datetime('now')), completed_at TEXT)`,
      `CREATE TABLE IF NOT EXISTS profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, instagram_id TEXT UNIQUE, username TEXT NOT NULL, full_name TEXT DEFAULT '', bio TEXT DEFAULT '', followers_count INTEGER DEFAULT 0, following_count INTEGER DEFAULT 0, media_count INTEGER DEFAULT 0, profile_pic_url TEXT DEFAULT '', website TEXT DEFAULT '', is_verified INTEGER DEFAULT 0, fetched_at TEXT DEFAULT (datetime('now')), research_id INTEGER, FOREIGN KEY (research_id) REFERENCES research(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS media (id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id INTEGER NOT NULL, instagram_media_id TEXT UNIQUE, media_type TEXT DEFAULT 'IMAGE', caption TEXT DEFAULT '', like_count INTEGER DEFAULT 0, comments_count INTEGER DEFAULT 0, timestamp TEXT, permalink TEXT DEFAULT '', FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS analysis_results (id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id INTEGER UNIQUE NOT NULL, primary_cluster TEXT CHECK(primary_cluster IN ('dating','mindset','relationships','masculinity')), secondary_cluster TEXT CHECK(secondary_cluster IS NULL OR secondary_cluster IN ('dating','mindset','relationships','masculinity')), relevance_score REAL DEFAULT 0, authority_score REAL DEFAULT 0, engagement_rate REAL DEFAULT 0, monetization_signals TEXT DEFAULT '[]', audience_alignment REAL DEFAULT 0, risk_flags TEXT DEFAULT '[]', dynamic_tags TEXT DEFAULT '[]', tier TEXT CHECK(tier IN ('S','A','B','C','D')), tier_reason TEXT DEFAULT '', content_summary TEXT DEFAULT '', content_style TEXT DEFAULT 'Unknown', is_approved INTEGER DEFAULT NULL, rejection_reason TEXT DEFAULT NULL, analyzed_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS editor_decision_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id INTEGER NOT NULL, username TEXT NOT NULL, previous_tier TEXT, new_tier TEXT NOT NULL, editor_reason TEXT NOT NULL, ai_summary TEXT DEFAULT '', editor_note TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE)`,
      `CREATE INDEX IF NOT EXISTS idx_decision_logs_profile ON editor_decision_logs(profile_id)`,
      `CREATE INDEX IF NOT EXISTS idx_decision_logs_created ON editor_decision_logs(created_at)`,
      `CREATE TABLE IF NOT EXISTS reports (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, research_id INTEGER, report_type TEXT CHECK(report_type IN ('leaderboard','cluster_distribution','full_analysis')), data TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (research_id) REFERENCES research(id) ON DELETE SET NULL)`,
      `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, instagram_url TEXT, csv_niche TEXT, csv_followers_range TEXT, csv_hq_score REAL DEFAULT 0, csv_hq INTEGER DEFAULT 0, fetch_status TEXT DEFAULT 'pending' CHECK(fetch_status IN ('pending','fetching','fetched','unfetchable','error')), error_message TEXT, profile_id INTEGER REFERENCES profiles(id), source TEXT DEFAULT 'csv_import', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS batch_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, total_leads INTEGER DEFAULT 0, processed INTEGER DEFAULT 0, fetched INTEGER DEFAULT 0, unfetchable INTEGER DEFAULT 0, errors INTEGER DEFAULT 0, status TEXT DEFAULT 'pending' CHECK(status IN ('pending','running','complete','cancelled')), started_at TEXT, completed_at TEXT, created_at TEXT DEFAULT (datetime('now')))`,
      `CREATE TABLE IF NOT EXISTS analysis_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id INTEGER NOT NULL, snapshot_reason TEXT DEFAULT 'reverify', primary_cluster TEXT, secondary_cluster TEXT, relevance_score REAL, authority_score REAL, engagement_rate REAL, monetization_signals TEXT DEFAULT '[]', dynamic_tags TEXT DEFAULT '[]', audience_alignment REAL, tier TEXT, tier_reason TEXT, content_style TEXT, content_summary TEXT, is_approved INTEGER, rejection_reason TEXT, snapshotted_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS verified_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id INTEGER UNIQUE NOT NULL, tier TEXT CHECK(tier IN ('S','A','B','C','D')), is_approved INTEGER DEFAULT 0, rejection_reason TEXT, editor_tier TEXT DEFAULT NULL, editor_note TEXT DEFAULT NULL, verified_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE)`,
      `CREATE INDEX IF NOT EXISTS idx_leads_username ON leads(username)`,
      `CREATE INDEX IF NOT EXISTS idx_leads_fetch_status ON leads(fetch_status)`,
      `CREATE INDEX IF NOT EXISTS idx_leads_csv_niche ON leads(csv_niche)`,
    ];

    const schemaRequests: PipelineRequest[] = stmts.map(sql => ({
      type: 'execute' as const,
      stmt: { sql, args: [] },
    }));
    schemaRequests.push({ type: 'close' });
    await pipeline(schemaRequests);

    // Migration: add source column if missing (for existing DBs)
    try {
      await pipeline([
        { type: 'execute', stmt: { sql: `ALTER TABLE leads ADD COLUMN source TEXT DEFAULT 'csv_import'`, args: [] } },
        { type: 'close' },
      ]);
    } catch {
      // Column already exists — ignore
    }

    // Migration: add avatar_data column to profiles (base64 image storage)
    try {
      await pipeline([
        { type: 'execute', stmt: { sql: `ALTER TABLE profiles ADD COLUMN avatar_data TEXT DEFAULT NULL`, args: [] } },
        { type: 'close' },
      ]);
    } catch {
      // Column already exists — ignore
    }

    // Default settings
    const settingRequests: PipelineRequest[] = [
      { type: 'execute', stmt: { sql: `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, args: serializeArgs(['min_followers', '5000']) } },
      { type: 'execute', stmt: { sql: `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, args: serializeArgs(['min_engagement_rate', '1.0']) } },
      { type: 'execute', stmt: { sql: `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, args: serializeArgs(['min_english_content', '60']) } },
      { type: 'execute', stmt: { sql: `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, args: serializeArgs(['min_posts_per_month', '2']) } },
      { type: 'close' },
    ];
    await pipeline(settingRequests);
    console.log('[DB] ✅ Schema initialization complete');
  } catch (err) {
    schemaInitialized = false; // Allow retry on failure
    console.error('[DB] ❌ Schema initialization FAILED:', err);
    throw err;
  }
}
