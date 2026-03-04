import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();

    const profile = db.prepare(`
      SELECT p.*, 
        a.primary_cluster, a.secondary_cluster, a.relevance_score, 
        a.authority_score, a.engagement_rate, a.monetization_signals, 
        a.audience_alignment, a.risk_flags, a.tier, a.content_summary, a.analyzed_at
      FROM profiles p
      LEFT JOIN analysis_results a ON a.profile_id = p.id
      WHERE p.id = ?
    `).get(Number(id));

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const media = db.prepare('SELECT * FROM media WHERE profile_id = ? ORDER BY timestamp DESC').all(Number(id));

    const p = profile as Record<string, unknown>;
    const parsed = {
      ...p,
      monetization_signals: p.monetization_signals ? JSON.parse(p.monetization_signals as string) : [],
      risk_flags: p.risk_flags ? JSON.parse(p.risk_flags as string) : [],
      is_verified: Boolean(p.is_verified),
      media,
    };

    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Profile fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}
