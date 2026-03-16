import { getOne, getAll } from '@/lib/db';
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

    const allowedSorts = ['authority_score', 'followers_count', 'engagement_rate', 'relevance_score', 'username', 'is_approved'];
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
      whereClause += ' AND (p.username LIKE ? OR p.full_name LIKE ?)';
      queryParams.push(`%${search}%`, `%${search}%`);
    }
    if (source) {
      whereClause += ' AND l.source = ?';
      queryParams.push(source);
    }

    const sortColumn =
      safeSortBy === 'username' || safeSortBy === 'followers_count' ? `p.${safeSortBy}` :
      safeSortBy === 'is_approved' ? `COALESCE(a.is_approved, v.is_approved)` :
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
        a.audience_alignment, a.content_style, a.content_summary, a.analyzed_at,
        COALESCE(v.editor_tier, v.tier, a.tier) as tier,
        COALESCE(a.is_approved, v.is_approved) as is_approved,
        COALESCE(a.rejection_reason, v.rejection_reason) as rejection_reason,
        l.source as lead_source
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
      content_style: (p.content_style as string) || 'Unknown',
      is_verified: Boolean(p.is_verified),
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
