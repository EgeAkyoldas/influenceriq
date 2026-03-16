import { NextRequest, NextResponse } from 'next/server';
import { getOne, getAll, execute } from '@/lib/db';
import type { NicheCluster, Tier } from '@/types';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profileId = Number(id);

    const body = await req.json() as {
      primary_cluster: NicheCluster;
      secondary_cluster: NicheCluster | null;
      relevance_score: number;
      authority_score: number;
      audience_alignment: number;
      monetization_signals: string[];
      risk_flags: string[];
      dynamic_tags: string[];
      tier: Tier;
      tier_reason: string;
      content_style: string;
      content_summary: string;
      is_approved: boolean;
      rejection_reason: string | null;
    };

    // Coerce numeric scores to actual numbers (AI/frontend may send strings like "8.5")
    const relevanceScore = Number(body.relevance_score) || 0;
    const authorityScore = Number(body.authority_score) || 0;
    const audienceAlignment = Number(body.audience_alignment) || 0;

    // Check if a row already exists
    const existing = await getOne('SELECT profile_id FROM analysis_results WHERE profile_id = ?', [profileId]);

    if (!existing) {
      // Calculate engagement_rate for brand-new row
      const media = await getAll<{ like_count: number; comments_count: number }>(
        'SELECT like_count, comments_count FROM media WHERE profile_id = ? ORDER BY timestamp DESC LIMIT 25',
        [profileId]
      );
      const profile = await getOne<{ followers_count: number }>(
        'SELECT followers_count FROM profiles WHERE id = ?',
        [profileId]
      );
      const followersCount = Number(profile?.followers_count) || 1;
      const avgLikes = media.length > 0 ? media.reduce((s, m) => s + (Number(m.like_count) || 0), 0) / media.length : 0;
      const avgComments = media.length > 0 ? media.reduce((s, m) => s + (Number(m.comments_count) || 0), 0) / media.length : 0;
      const engagementRate = ((avgLikes + avgComments) / followersCount) * 100;

      await execute(`
        INSERT INTO analysis_results
          (profile_id, primary_cluster, secondary_cluster, relevance_score, authority_score,
           engagement_rate, monetization_signals, risk_flags, dynamic_tags, audience_alignment, tier, tier_reason,
           content_summary, content_style, is_approved, rejection_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        profileId,
        body.primary_cluster, body.secondary_cluster ?? null,
        relevanceScore, authorityScore,
        engagementRate,
        JSON.stringify(body.monetization_signals ?? []),
        JSON.stringify(body.risk_flags ?? []),
        JSON.stringify(body.dynamic_tags ?? []),
        audienceAlignment,
        body.tier, body.tier_reason ?? '',
        body.content_summary || '',
        body.content_style || 'Mixed',
        body.is_approved ? 1 : 0,
        body.is_approved ? null : (body.rejection_reason ?? null),
      ]);
    } else {
      const isApprovedInt = body.is_approved ? 1 : 0;

      await execute(`
        UPDATE analysis_results SET
          primary_cluster    = ?,
          secondary_cluster  = COALESCE(?, secondary_cluster),
          relevance_score    = CASE WHEN ? > 0 THEN ? ELSE relevance_score END,
          authority_score    = CASE WHEN ? >= 1 THEN ? ELSE authority_score END,
          monetization_signals = CASE WHEN json_array_length(?) > 0 THEN ? ELSE monetization_signals END,
          risk_flags         = CASE WHEN json_array_length(?) > 0 THEN ? ELSE risk_flags END,
          dynamic_tags       = CASE WHEN json_array_length(?) > 0 THEN ? ELSE dynamic_tags END,
          audience_alignment = CASE WHEN ? > 0 THEN ? ELSE audience_alignment END,
          tier               = ?,
          tier_reason        = CASE WHEN ? != '' THEN ? ELSE tier_reason END,
          content_summary    = CASE
                                 WHEN content_summary IS NULL OR content_summary = '' THEN ?
                                 ELSE content_summary
                               END,
          content_style      = CASE
                                 WHEN ? != '' AND ? != 'Unknown' THEN ?
                                 ELSE COALESCE(content_style, 'Mixed')
                               END,
          is_approved        = ?,
          rejection_reason   = CASE
                                 WHEN ? = 1 THEN NULL
                                 WHEN ? IS NOT NULL THEN ?
                                 ELSE rejection_reason
                               END
        WHERE profile_id = ?
      `, [
        body.primary_cluster,
        body.secondary_cluster ?? null,
        relevanceScore, relevanceScore,
        authorityScore, authorityScore,
        JSON.stringify(body.monetization_signals ?? []), JSON.stringify(body.monetization_signals ?? []),
        JSON.stringify(body.risk_flags ?? []), JSON.stringify(body.risk_flags ?? []),
        JSON.stringify(body.dynamic_tags ?? []), JSON.stringify(body.dynamic_tags ?? []),
        audienceAlignment, audienceAlignment,
        body.tier,
        body.tier_reason ?? '', body.tier_reason ?? '',
        body.content_summary ?? '',
        body.content_style ?? '', body.content_style ?? '', body.content_style ?? '',
        isApprovedInt,
        isApprovedInt, body.rejection_reason ?? null, body.rejection_reason ?? null,
        profileId,
      ]);
    }

    return NextResponse.json({ ok: true, profile_id: profileId });
  } catch (error) {
    console.error('[Reverify Apply] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Apply failed' },
      { status: 500 }
    );
  }
}
