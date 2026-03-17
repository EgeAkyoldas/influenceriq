import { getOne, getAll, execute, type InValue } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const startMs = Date.now();
  console.log('[Leads API] GET request received');
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const offset = (page - 1) * limit;
    const search = searchParams.get('search') || '';
    const niche = searchParams.get('niche') || '';
    const fetchStatus = searchParams.get('fetch_status') || '';
    const source = searchParams.get('source') || '';
    const hqOnly = searchParams.get('hq_only') === 'true';
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const sortDir = searchParams.get('sort_dir') === 'asc' ? 'ASC' : 'DESC';

    console.log(`[Leads API] Params: page=${page}, limit=${limit}, search="${search}", niche="${niche}", status="${fetchStatus}", source="${source}"`);

    let where = 'WHERE 1=1';
    const params: InValue[] = [];

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
    if (source) {
      where += ' AND l.source = ?';
      params.push(source);
    }
    if (hqOnly) {
      where += ' AND l.csv_hq = 1';
    }

    const allowedSorts = ['created_at', 'username', 'csv_niche', 'csv_hq_score', 'fetch_status', 'csv_followers_range'];
    const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';

    console.log('[Leads API] Running count query...');
    const countResult = await getOne<{ count: number }>(`SELECT COUNT(*) as count FROM leads l ${where}`, params);
    console.log(`[Leads API] Count result: ${countResult?.count ?? 'null'}`);

    console.log('[Leads API] Running main query...');
    const leads = await getAll(
      `SELECT l.*, p.followers_count, p.full_name, p.profile_pic_url
       FROM leads l LEFT JOIN profiles p ON l.profile_id = p.id
       ${where} ORDER BY l.${safeSort} ${sortDir} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    console.log(`[Leads API] Fetched ${leads.length} leads`);

    // Get niche distribution
    const niches = await getAll('SELECT csv_niche, COUNT(*) as count FROM leads GROUP BY csv_niche ORDER BY count DESC');
    const statusCounts = await getAll('SELECT fetch_status, COUNT(*) as count FROM leads GROUP BY fetch_status');
    const sourceCounts = await getAll('SELECT source, COUNT(*) as count FROM leads GROUP BY source ORDER BY count DESC');

    const elapsed = Date.now() - startMs;
    console.log(`[Leads API] ✅ Response ready in ${elapsed}ms (${leads.length} leads, total=${countResult?.count})`);

    return NextResponse.json({
      data: leads,
      pagination: { page, limit, total: countResult?.count ?? 0, totalPages: Math.ceil((countResult?.count ?? 0) / limit) },
      filters: { niches, statusCounts, sourceCounts },
    });
  } catch (error) {
    const elapsed = Date.now() - startMs;
    console.error(`[Leads API] ❌ FAILED after ${elapsed}ms:`, error);
    console.error(`[Leads API] Error name: ${(error as Error).name}, message: ${(error as Error).message}`);
    console.error(`[Leads API] Stack:`, (error as Error).stack);
    return NextResponse.json({ error: 'Failed to fetch leads', details: (error as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, csv_niche, csv_followers_range, csv_hq_score, csv_hq, source } = body;

    if (!username) {
      return NextResponse.json({ error: 'username is required' }, { status: 400 });
    }

    const cleaned = username.trim().replace('@', '').toLowerCase();
    const result = await execute(
      `INSERT INTO leads (username, csv_niche, csv_followers_range, csv_hq_score, csv_hq, source)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET
         csv_niche = COALESCE(excluded.csv_niche, leads.csv_niche),
         csv_followers_range = COALESCE(excluded.csv_followers_range, leads.csv_followers_range),
         updated_at = datetime('now')`,
      [cleaned, csv_niche || null, csv_followers_range || null, csv_hq_score || 0, csv_hq ? 1 : 0, source || 'manual']
    );

    return NextResponse.json({ id: Number(result.lastInsertRowid), username: cleaned }, { status: 201 });
  } catch (error) {
    console.error('Lead create error:', error);
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { ids } = body as { ids: number[] };

    if (!ids || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    const placeholders = ids.map(() => '?').join(',');
    const result = await execute(`DELETE FROM leads WHERE id IN (${placeholders})`, ids);

    return NextResponse.json({ deleted: result.rowsAffected });
  } catch (error) {
    console.error('Lead delete error:', error);
    return NextResponse.json({ error: 'Failed to delete leads' }, { status: 500 });
  }
}
