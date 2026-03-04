import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const offset = (page - 1) * limit;
    const search = searchParams.get('search') || '';
    const niche = searchParams.get('niche') || '';
    const fetchStatus = searchParams.get('fetch_status') || '';
    const hqOnly = searchParams.get('hq_only') === 'true';
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const sortDir = searchParams.get('sort_dir') === 'asc' ? 'ASC' : 'DESC';

    let where = 'WHERE 1=1';
    const params: unknown[] = [];

    if (search) {
      where += ' AND (l.username LIKE ? OR l.csv_niche LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (niche) {
      where += ' AND l.csv_niche = ?';
      params.push(niche);
    }
    if (fetchStatus) {
      where += ' AND l.fetch_status = ?';
      params.push(fetchStatus);
    }
    if (hqOnly) {
      where += ' AND l.csv_hq = 1';
    }

    const allowedSorts = ['created_at', 'username', 'csv_niche', 'csv_hq_score', 'fetch_status', 'csv_followers_range'];
    const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';

    const countResult = db.prepare(`SELECT COUNT(*) as count FROM leads l ${where}`).get(...params) as { count: number };
    const leads = db.prepare(
      `SELECT l.*, p.followers_count, p.full_name, p.profile_pic_url
       FROM leads l LEFT JOIN profiles p ON l.profile_id = p.id
       ${where} ORDER BY l.${safeSort} ${sortDir} LIMIT ? OFFSET ?`
    ).all(...params, limit, offset);

    // Get niche distribution
    const niches = db.prepare('SELECT csv_niche, COUNT(*) as count FROM leads GROUP BY csv_niche ORDER BY count DESC').all();
    const statusCounts = db.prepare('SELECT fetch_status, COUNT(*) as count FROM leads GROUP BY fetch_status').all();

    return NextResponse.json({
      data: leads,
      pagination: { page, limit, total: countResult.count, totalPages: Math.ceil(countResult.count / limit) },
      filters: { niches, statusCounts },
    });
  } catch (error) {
    console.error('Leads list error:', error);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { username, csv_niche, csv_followers_range, csv_hq_score, csv_hq } = body;

    if (!username) {
      return NextResponse.json({ error: 'username is required' }, { status: 400 });
    }

    const cleaned = username.trim().replace('@', '').toLowerCase();
    const result = db.prepare(
      `INSERT INTO leads (username, csv_niche, csv_followers_range, csv_hq_score, csv_hq)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET
         csv_niche = COALESCE(excluded.csv_niche, leads.csv_niche),
         csv_followers_range = COALESCE(excluded.csv_followers_range, leads.csv_followers_range),
         updated_at = datetime('now')`
    ).run(cleaned, csv_niche || null, csv_followers_range || null, csv_hq_score || 0, csv_hq ? 1 : 0);

    return NextResponse.json({ id: result.lastInsertRowid, username: cleaned }, { status: 201 });
  } catch (error) {
    console.error('Lead create error:', error);
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { ids } = body as { ids: number[] };

    if (!ids || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    const placeholders = ids.map(() => '?').join(',');
    const result = db.prepare(`DELETE FROM leads WHERE id IN (${placeholders})`).run(...ids);

    return NextResponse.json({ deleted: result.changes });
  } catch (error) {
    console.error('Lead delete error:', error);
    return NextResponse.json({ error: 'Failed to delete leads' }, { status: 500 });
  }
}
