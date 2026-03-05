import Database from 'better-sqlite3';

const LOCAL_DB = 'data/influencer-tracker.db';
const TURSO_URL = 'https://lionalyze-atticawe.turso.io';
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN || 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzI3MTg3MTAsImlkIjoiMDE5Y2JlM2YtZTMwMS03NWYxLTkzYmQtYmIzZjllMDYwN2I4IiwicmlkIjoiMzQ5ZmJhNjctYzczYS00NWE1LWFjNTQtYTBlZmQ2ZjRmNmE2In0.mwreZZC_BC8lrlFOqVu3p1ubOlLDgcI5WSiPJEvGGBdpbMxt-2SPxLbr5ZSktAaGhiwDqVVRFbZeXiE0QdRaCA';
const CHUNK = 30; // Rows per pipeline request

const db = new Database(LOCAL_DB, { readonly: true });

function serialize(v) {
  if (v === null || v === undefined) return { type: 'null', value: null };
  if (typeof v === 'number') return Number.isInteger(v) ? { type: 'integer', value: String(v) } : { type: 'float', value: String(v) };
  return { type: 'text', value: String(v) };
}

async function tursoPipeline(requests) {
  const res = await fetch(`${TURSO_URL}/v2/pipeline`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${TURSO_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  for (const r of data.results) {
    if (r.type === 'error') throw new Error(`SQL Error: ${r.error?.message}`);
  }
  return data;
}

async function migrateTable(table, cols) {
  const rows = db.prepare(`SELECT ${cols.join(', ')} FROM ${table}`).all();
  console.log(`\n📋 ${table}: ${rows.length} rows`);
  if (rows.length === 0) return;

  const sql = `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  let done = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const requests = chunk.map(row => ({
      type: 'execute',
      stmt: { sql, args: cols.map(c => serialize(row[c])) },
    }));
    requests.push({ type: 'close' });

    let retries = 3;
    while (retries > 0) {
      try {
        await tursoPipeline(requests);
        break;
      } catch (err) {
        retries--;
        if (retries === 0) { console.error(`  ❌ Failed at chunk ${i}: ${err.message}`); throw err; }
        console.log(`  ⟳ Retry (${3-retries}/3)...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    done += chunk.length;
    process.stdout.write(`  ${done}/${rows.length} (${Math.round(done/rows.length*100)}%)\r`);
  }
  console.log(`  ✅ ${table}: ${done} rows migrated`);
}

// ─── Run ─────────────────────────────────────────────────────────────────────
console.log('🚀 Migrating media data to Turso (native fetch)...\n');

try {
  await migrateTable('media', ['id', 'profile_id', 'instagram_media_id', 'media_type', 'caption', 'like_count', 'comments_count', 'timestamp', 'permalink']);
  console.log('\n🎉 Media migration complete!');
} catch (err) {
  console.error('\n❌ Migration failed:', err.message);
  process.exit(1);
} finally {
  db.close();
}
