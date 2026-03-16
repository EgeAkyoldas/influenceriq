import { NextRequest, NextResponse } from 'next/server';
import { getOne, getAll, execute } from '@/lib/db';
import { analyzeProfile, type EditorExample } from '@/lib/services/ai-analyzer';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const profileId = Number(id);

    // 1. Fetch profile
    const profile = await getOne<{
      id: number; username: string; full_name: string; bio: string;
      followers_count: number; following_count: number; media_count: number; website: string;
    }>('SELECT * FROM profiles WHERE id = ?', [profileId]);

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // 2. Fetch existing media captions
    const media = await getAll<{ like_count: number; comments_count: number; caption: string; timestamp: string }>(
      'SELECT like_count, comments_count, caption, timestamp FROM media WHERE profile_id = ? ORDER BY timestamp DESC LIMIT 25',
      [profileId]
    );

    const captions = media.map(m => m.caption || '').filter(Boolean);
    const avgLikes = media.length > 0 ? media.reduce((s, m) => s + (Number(m.like_count) || 0), 0) / media.length : 0;
    const avgComments = media.length > 0 ? media.reduce((s, m) => s + (Number(m.comments_count) || 0), 0) / media.length : 0;
    const followersCount = Number(profile.followers_count) || 1;
    const engagementRate = media.length > 0 ? ((avgLikes + avgComments) / followersCount) * 100 : 0;

    // 3. Fetch current analysis (to snapshot)
    const currentAnalysis = await getOne<{
      primary_cluster: string; secondary_cluster: string; relevance_score: number;
      authority_score: number; engagement_rate: number; monetization_signals: string;
      dynamic_tags: string;
      audience_alignment: number; tier: string; tier_reason: string; content_style: string;
      content_summary: string; risk_flags: string; is_approved: number; rejection_reason: string;
    }>('SELECT * FROM analysis_results WHERE profile_id = ?', [profileId]);

    // 4. Snapshot existing analysis before overwriting
    let snapshotId: number | null = null;
    if (currentAnalysis) {
      const snap = await execute(`
        INSERT INTO analysis_snapshots
          (profile_id, snapshot_reason, primary_cluster, secondary_cluster, relevance_score,
           authority_score, engagement_rate, monetization_signals, dynamic_tags, audience_alignment, tier,
           tier_reason, content_style, content_summary, is_approved, rejection_reason)
        VALUES (?, 'reverify', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        profileId,
        currentAnalysis.primary_cluster, currentAnalysis.secondary_cluster,
        Number(currentAnalysis.relevance_score) || 0, Number(currentAnalysis.authority_score) || 0,
        Number(currentAnalysis.engagement_rate) || 0, currentAnalysis.monetization_signals,
        currentAnalysis.dynamic_tags,
        Number(currentAnalysis.audience_alignment) || 0, currentAnalysis.tier, currentAnalysis.tier_reason,
        currentAnalysis.content_style, currentAnalysis.content_summary,
        currentAnalysis.is_approved, currentAnalysis.rejection_reason
      ]);
      snapshotId = Number(snap.lastInsertRowid);
    }

    // 5. Load recent editor examples
    const editorExamples = await getAll<EditorExample>(`
      SELECT username, previous_tier, new_tier, editor_reason, editor_note
      FROM editor_decision_logs
      ORDER BY created_at DESC LIMIT 10
    `);

    // 6. Run AI re-analysis
    const newAnalysis = await analyzeProfile({
      username: profile.username,
      full_name: profile.full_name || '',
      bio: profile.bio || '',
      followers_count: Number(profile.followers_count) || 0,
      following_count: Number(profile.following_count) || 0,
      media_count: Number(profile.media_count) || 0,
      website: profile.website || '',
      recent_captions: captions,
      avg_likes: avgLikes,
      avg_comments: avgComments,
      engagement_rate: engagementRate,
      editorExamples: editorExamples.slice(0, 5),
    });

    const changed =
      !currentAnalysis ||
      currentAnalysis.tier !== newAnalysis.tier ||
      currentAnalysis.is_approved !== (newAnalysis.is_approved ? 1 : 0);

    return NextResponse.json({
      profile_id: profileId,
      username: profile.username,
      old_analysis: currentAnalysis ? {
        tier: currentAnalysis.tier,
        relevance_score: currentAnalysis.relevance_score,
        authority_score: currentAnalysis.authority_score,
        audience_alignment: currentAnalysis.audience_alignment,
        primary_cluster: currentAnalysis.primary_cluster,
        secondary_cluster: currentAnalysis.secondary_cluster,
        monetization_signals: (() => {
          try { return JSON.parse(currentAnalysis.monetization_signals || '[]'); } catch { return []; }
        })(),
        risk_flags: (() => {
          try { return JSON.parse(currentAnalysis.risk_flags || '[]'); } catch { return []; }
        })(),
        is_approved: currentAnalysis.is_approved === 1,
        rejection_reason: currentAnalysis.rejection_reason,
        content_style: currentAnalysis.content_style,
        content_summary: currentAnalysis.content_summary,
        tier_reason: currentAnalysis.tier_reason,
      } : null,
      new_analysis: {
        tier: newAnalysis.tier,
        relevance_score: newAnalysis.relevance_score,
        authority_score: newAnalysis.authority_score,
        audience_alignment: newAnalysis.audience_alignment,
        primary_cluster: newAnalysis.primary_cluster,
        secondary_cluster: newAnalysis.secondary_cluster,
        monetization_signals: newAnalysis.monetization_signals,
        risk_flags: newAnalysis.risk_flags,
        is_approved: newAnalysis.is_approved,
        rejection_reason: newAnalysis.rejection_reason,
        content_style: newAnalysis.content_style,
        content_summary: newAnalysis.content_summary,
        tier_reason: newAnalysis.tier_reason,
      },
      changed,
      snapshot_id: snapshotId,
    });
  } catch (error) {
    console.error('[Reverify] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Reverify failed' },
      { status: 500 }
    );
  }
}
