import { getOne, batch as dbBatch } from '@/lib/db';
import { type InValue } from '@libsql/client';
import { NextRequest, NextResponse } from 'next/server';

function extractUsername(url: string): string | null {
  try {
    let cleaned = url.split('?')[0].replace(/\/+$/, '');
    cleaned = cleaned
      .replace('https://www.instagram.com/', '')
      .replace('https://instagram.com/', '')
      .replace('http://www.instagram.com/', '')
      .replace('http://instagram.com/', '');
    const username = cleaned.split('/')[0].trim();
    return username && username.length > 0 ? username : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { csv_data } = body as { csv_data: string };

    if (!csv_data) {
      return NextResponse.json({ error: 'csv_data is required (raw CSV string)' }, { status: 400 });
    }

    const lines = csv_data.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV must have a header row and at least one data row' }, { status: 400 });
    }

    // Parse header
    const header = lines[0].split(',').map(h => h.trim().toUpperCase());
    const linkIdx = header.indexOf('LINK');
    const nicheIdx = header.indexOf('NICHE');
    const followersIdx = header.indexOf('FOLLOWERS');
    const accountIdx = header.indexOf('ACCOUNT');
    const hqIdx = header.indexOf('HQ');

    if (linkIdx === -1) {
      return NextResponse.json({ error: 'CSV must have a LINK column' }, { status: 400 });
    }

    let imported = 0;
    let skipped = 0;
    let duplicates = 0;
    const seenUsernames = new Set<string>();
    const statements: Array<{ sql: string; args: InValue[] }> = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim());
      const url = cols[linkIdx] || '';
      const username = extractUsername(url);

      if (!username) {
        skipped++;
        continue;
      }

      if (seenUsernames.has(username)) {
        duplicates++;
        continue;
      }
      seenUsernames.add(username);

      const niche = nicheIdx >= 0 ? (cols[nicheIdx] || '').trim() : null;
      const followersRange = followersIdx >= 0 ? (cols[followersIdx] || '').trim() : null;
      const hqScore = accountIdx >= 0 ? parseFloat(cols[accountIdx]) || 0 : 0;
      const hq = hqIdx >= 0 ? (cols[hqIdx] || '').toUpperCase() === 'TRUE' ? 1 : 0 : 0;

      statements.push({
        sql: `INSERT INTO leads (username, instagram_url, csv_niche, csv_followers_range, csv_hq_score, csv_hq, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
              ON CONFLICT(username) DO UPDATE SET
                instagram_url = COALESCE(excluded.instagram_url, leads.instagram_url),
                csv_niche = COALESCE(excluded.csv_niche, leads.csv_niche),
                csv_followers_range = COALESCE(excluded.csv_followers_range, leads.csv_followers_range),
                csv_hq_score = COALESCE(excluded.csv_hq_score, leads.csv_hq_score),
                csv_hq = COALESCE(excluded.csv_hq, leads.csv_hq),
                updated_at = datetime('now')`,
        args: [username, url, niche, followersRange, hqScore, hq],
      });
      imported++;
    }

    // Run all upserts in a batch
    if (statements.length > 0) {
      // Turso batch limit is ~100 statements, chunk if needed
      const CHUNK = 80;
      for (let i = 0; i < statements.length; i += CHUNK) {
        await dbBatch(statements.slice(i, i + CHUNK));
      }
    }

    const totalRow = await getOne<{ count: number }>('SELECT COUNT(*) as count FROM leads');
    const totalLeads = totalRow?.count ?? 0;

    return NextResponse.json({
      imported,
      duplicates_in_csv: duplicates,
      skipped,
      total_rows_parsed: lines.length - 1,
      total_leads_in_db: totalLeads,
    }, { status: 201 });
  } catch (error) {
    console.error('CSV import error:', error);
    return NextResponse.json({ error: 'Failed to import CSV', details: (error as Error).message }, { status: 500 });
  }
}
