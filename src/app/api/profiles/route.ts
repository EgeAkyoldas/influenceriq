import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const url = new URL(req.url);
    
    const cluster = url.searchParams.get('cluster');
    const tier = url.searchParams.get('tier');
    const search = url.searchParams.get('search');
    const sortBy = url.searchParams.get('sortBy') || 'authority_score';
    const sortOrder = url.searchParams.get('sortOrder') || 'DESC';
    const page = Number(url.searchParams.get('page') || '1');
    const limit = Number(url.searchParams.get('limit') || '25');
    const offset = (page - 1) * limit;

    const allowedSorts = ['authority_score', 'followers_count', 'engagement_rate', 'relevance_score', 'username'];
    const safeSortBy = allowedSorts.includes(sortBy) ? sortBy : 'authority_score';
    const safeSortOrder = sortOrder === 'ASC' ? 'ASC' : 'DESC';

    let whereClause = 'WHERE 1=1';
    const queryParams: (string | number)[] = [];

    if (cluster) {
      whereClause += ' AND a.primary_cluster = ?';
      queryParams.push(cluster);
    }
    if (tier) {
      whereClause += ' AND a.tier = ?';
      queryParams.push(tier);
    }
    if (search) {
      whereClause += ' AND (p.username LIKE ? OR p.full_name LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    const sortColumn = safeSortBy === 'username' || safeSortBy === 'followers_count' ? `p.${safeSortBy}` : `a.${safeSortBy}`;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM profiles p
      LEFT JOIN analysis_results a ON a.profile_id = p.id
      ${whereClause}
    `;
    const total = (db.prepare(countQuery).get(...queryParams) as { total: number }).total;

    const dataQuery = `
      SELECT p.*, 
        a.primary_cluster, a.secondary_cluster, a.relevance_score, 
        a.authority_score, a.engagement_rate, a.monetization_signals, 
        a.audience_alignment, a.risk_flags, a.tier, a.content_summary, a.analyzed_at
      FROM profiles p
      LEFT JOIN analysis_results a ON a.profile_id = p.id
      ${whereClause}
      ORDER BY ${sortColumn} ${safeSortOrder} NULLS LAST
      LIMIT ? OFFSET ?
    `;
    queryParams.push(limit, offset);
    const profiles = db.prepare(dataQuery).all(...queryParams);

    // Parse JSON fields
    const parsed = (profiles as Record<string, unknown>[]).map(p => ({
      ...p,
      monetization_signals: p.monetization_signals ? JSON.parse(p.monetization_signals as string) : [],
      risk_flags: p.risk_flags ? JSON.parse(p.risk_flags as string) : [],
      is_verified: Boolean(p.is_verified),
    }));

    return NextResponse.json({
      data: parsed,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Profiles list error:', error);
    return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 });
  }
}
