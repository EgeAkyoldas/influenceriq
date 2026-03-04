import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(process.cwd(), 'data', 'influencer-tracker.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
  }
  return db;
}

function initializeSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS research (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seed_type TEXT NOT NULL CHECK(seed_type IN ('username', 'hashtag', 'csv')),
      seed_value TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'fetching', 'analyzing', 'complete', 'failed')),
      profiles_found INTEGER DEFAULT 0,
      profiles_analyzed INTEGER DEFAULT 0,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS profiles (
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
    );

    CREATE TABLE IF NOT EXISTS media (
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
    );

    CREATE TABLE IF NOT EXISTS analysis_results (
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
      tier TEXT CHECK(tier IN ('A', 'B', 'C', 'D')),
      content_summary TEXT DEFAULT '',
      analyzed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      research_id INTEGER,
      report_type TEXT CHECK(report_type IN ('leaderboard', 'cluster_distribution', 'full_analysis')),
      data TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (research_id) REFERENCES research(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leads (
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
    );

    CREATE TABLE IF NOT EXISTS batch_jobs (
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
    );

    CREATE INDEX IF NOT EXISTS idx_leads_username ON leads(username);
    CREATE INDEX IF NOT EXISTS idx_leads_fetch_status ON leads(fetch_status);
    CREATE INDEX IF NOT EXISTS idx_leads_csv_niche ON leads(csv_niche);
  `);

  // Insert default settings if not present
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('min_followers', '5000');
  insertSetting.run('min_engagement_rate', '1.0');
  insertSetting.run('min_english_content', '60');
  insertSetting.run('min_posts_per_month', '2');
}
