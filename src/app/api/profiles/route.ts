import { getOne, getAll, execute } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    
    const cluster = url.searchParams.get('cluster');
    const tier = url.searchParams.get('tier');
    const archetype = url.searchParams.get('archetype');
    const source = url.searchParams.get('source');
    const search = url.searchParams.get('search');
    const sortBy = url.searchParams.get('sortBy') || 'authority_score';
    const sortOrder = url.searchParams.get('sortOrder') || 'DESC';
    const page = Number(url.searchParams.get('page') || '1');
    const limit = Number(url.searchParams.get('limit') || '25');
    const offset = (page - 1) * limit;

    // Build archetype → cluster key lookup (static, never changes)
    const archetypeToKey: Record<string, { primary: string; secondary: string }> = {
      'Pure Seducer':     { primary: 'dating',        secondary: '' },
      'Approach Artist':  { primary: 'dating',        secondary: 'mindset' },
      'Commitment Path':  { primary: 'dating',        secondary: 'relationships' },
      'Alpha Playbook':   { primary: 'dating',        secondary: 'masculinity' },
      'Mind Forge':       { primary: 'mindset',       secondary: '' },
      'Frame Lord':       { primary: 'mindset',       secondary: 'dating' },
      'Inner Architect':  { primary: 'mindset',       secondary: 'relationships' },
      'Grounded King':    { primary: 'mindset',       secondary: 'masculinity' },
      'Bonds Builder':    { primary: 'relationships', secondary: '' },
      'Converted Romeo':  { primary: 'relationships', secondary: 'dating' },
      'Depth Builder':    { primary: 'relationships', secondary: 'mindset' },
      'Masculine Partner':{ primary: 'relationships', secondary: 'masculinity' },
      'Raw Alpha':        { primary: 'masculinity',   secondary: '' },
      'Street Sigma':     { primary: 'masculinity',   secondary: 'dating' },
      'Iron Mind':        { primary: 'masculinity',   secondary: 'mindset' },
      'Tribe Father':     { primary: 'masculinity',   secondary: 'relationships' },
    };

    const allowedSorts = ['authority_score', 'followers_count', 'engagement_rate', 'relevance_score', 'username', 'is_approved', 'lead_source', 'tier'];
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
    if (archetype && archetypeToKey[archetype]) {
      const { primary, secondary } = archetypeToKey[archetype];
      whereClause += ' AND a.primary_cluster = ?';
      queryParams.push(primary);
      if (secondary) {
        whereClause += ' AND a.secondary_cluster = ?';
        queryParams.push(secondary);
      } else {
        whereClause += " AND (a.secondary_cluster IS NULL OR a.secondary_cluster = '')";
      }
    }
    if (search) {
      whereClause += ' AND (p.username LIKE ? OR p.full_name LIKE ? OR l.source LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (source) {
      whereClause += ' AND l.source = ?';
      queryParams.push(source);
    }

    const sortColumn =
      safeSortBy === 'username' || safeSortBy === 'followers_count' ? `p.${safeSortBy}` :
      safeSortBy === 'is_approved' ? `COALESCE(a.is_approved, v.is_approved)` :
      safeSortBy === 'lead_source' ? `l.source` :
      safeSortBy === 'tier' ? `CASE COALESCE(v.editor_tier, v.tier, a.tier) WHEN 'S' THEN 1 WHEN 'A' THEN 2 WHEN 'B' THEN 3 WHEN 'C' THEN 4 WHEN 'D' THEN 5 ELSE 6 END` :
      `a.${safeSortBy}`;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM profiles p
      LEFT JOIN analysis_results a ON a.profile_id = p.id
      LEFT JOIN verified_profiles v ON v.profile_id = p.id
      LEFT JOIN leads l ON l.username = p.username
      ${whereClause}
    `;
    const countResult = await getOne<{ total: number }>(countQuery, queryParams);
    const total = countResult?.total ?? 0;

    const dataQuery = `
      SELECT p.*,
        a.primary_cluster, a.secondary_cluster, a.relevance_score,
        a.authority_score, a.engagement_rate, a.monetization_signals, a.dynamic_tags,
        a.audience_alignment, a.content_style, a.content_summary, a.tier_reason, a.risk_flags, a.analyzed_at,
        COALESCE(v.editor_tier, v.tier, a.tier) as tier,
        COALESCE(a.is_approved, v.is_approved) as is_approved,
        COALESCE(a.rejection_reason, v.rejection_reason) as rejection_reason,
        l.source as lead_source,
        EXISTS (
          SELECT 1 FROM analysis_snapshots s
          WHERE s.profile_id = p.id
            AND s.snapshot_reason IN ('reverify', 'batch_reverify')
        ) as has_been_reverified
      FROM profiles p
      LEFT JOIN analysis_results a ON a.profile_id = p.id
      LEFT JOIN verified_profiles v ON v.profile_id = p.id
      LEFT JOIN leads l ON l.username = p.username
      ${whereClause}
      ORDER BY ${sortColumn} ${safeSortOrder} NULLS LAST
      LIMIT ? OFFSET ?
    `;
    const profiles = await getAll(dataQuery, [...queryParams, limit, offset]);

    // Parse JSON fields
    const parsed = (profiles as Record<string, unknown>[]).map(p => ({
      ...p,
      monetization_signals: p.monetization_signals ? JSON.parse(p.monetization_signals as string) : [],
      dynamic_tags: p.dynamic_tags ? JSON.parse(p.dynamic_tags as string) : [],
      risk_flags: p.risk_flags ? JSON.parse(p.risk_flags as string) : [],
      content_style: (p.content_style as string) || 'Unknown',
      is_verified: Boolean(p.is_verified),
      has_been_reverified: Boolean(p.has_been_reverified),
      is_approved: p.is_approved === null || p.is_approved === undefined ? null : (p.is_approved === 1 ? 1 : 0),
      rejection_reason: (p.rejection_reason as string) || null,
    }));

    // Get available sources for filter dropdown
    const sources = await getAll<{ source: string; count: number }>(
      `SELECT l.source, COUNT(*) as count
       FROM profiles p
       LEFT JOIN leads l ON l.username = p.username
       LEFT JOIN analysis_results a ON a.profile_id = p.id
       WHERE a.id IS NOT NULL
       GROUP BY l.source
       ORDER BY count DESC`
    );

    return NextResponse.json({
      data: parsed,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      sources,
    });
  } catch (error) {
    console.error('Profiles list error:', error);
    return NextResponse.json({ error: 'Failed to fetch profiles' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { ids } = (await req.json()) as { ids: number[] };
    if (!ids || ids.length === 0) {
      return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
    }

    // Fetch usernames to reset leads
    const placeholders = ids.map(() => '?').join(',');
    const profiles = await getAll<{ username: string }>(
      `SELECT username FROM profiles WHERE id IN (${placeholders})`,
      ids
    );
    const usernames = profiles.map(p => p.username);

    if (usernames.length > 0) {
      const uph = usernames.map(() => '?').join(',');
      await execute(
        `UPDATE leads SET profile_id = NULL, fetch_status = 'pending', updated_at = datetime('now') WHERE username IN (${uph})`,
        usernames
      );
    }

    // Delete profiles — cascades to media, analysis_results, verified_profiles
    const result = await execute(`DELETE FROM profiles WHERE id IN (${placeholders})`, ids);

    return NextResponse.json({ deleted: result.rowsAffected });
  } catch (error) {
    console.error('Profiles bulk delete error:', error);
    return NextResponse.json({ error: 'Failed to delete profiles' }, { status: 500 });
  }
}
