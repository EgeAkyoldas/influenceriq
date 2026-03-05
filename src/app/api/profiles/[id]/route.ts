import { getOne, getAll } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const profile = await getOne(`
      SELECT p.*,
        a.primary_cluster, a.secondary_cluster, a.relevance_score,
        a.authority_score, a.engagement_rate, a.monetization_signals, a.risk_flags,
        a.audience_alignment, a.content_style, a.tier, a.tier_reason, a.content_summary, a.analyzed_at,
        COALESCE(a.is_approved, v.is_approved) as is_approved,
        COALESCE(a.rejection_reason, v.rejection_reason) as rejection_reason
      FROM profiles p
      LEFT JOIN analysis_results a ON a.profile_id = p.id
      LEFT JOIN verified_profiles v ON v.profile_id = p.id
      WHERE p.id = ?
    `, [Number(id)]);

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const media = await getAll('SELECT * FROM media WHERE profile_id = ? ORDER BY timestamp DESC', [Number(id)]);

    const p = profile as Record<string, unknown>;
    const parsed = {
      ...p,
      monetization_signals: p.monetization_signals ? JSON.parse(p.monetization_signals as string) : [],
      risk_flags: p.risk_flags ? JSON.parse(p.risk_flags as string) : [],
      content_style: (p.content_style as string) || 'Unknown',
      is_verified: Boolean(p.is_verified),
      is_approved: p.is_approved === null || p.is_approved === undefined ? null : (p.is_approved === 1 || p.is_approved === true) ? 1 : 0,
      rejection_reason: (p.rejection_reason as string) || null,
      media,
    };

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Profile fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
