import { getAll, execute } from '@/lib/db';
import { NextResponse } from 'next/server';
import { analyzeProfile, type EditorExample } from '@/lib/services/ai-analyzer';

export async function POST() {
  try {
    const profiles = await getAll<{
      id: number; full_name: string; username: string; bio: string;
      followers_count: number; following_count: number; media_count: number; website: string;
    }>(`SELECT p.id, p.full_name, p.username, p.bio, p.followers_count, p.following_count, p.media_count, p.website FROM profiles p`);

    if (profiles.length === 0) {
      return NextResponse.json({ message: 'No profiles found to verify.' }, { status: 404 });
    }

    processVerification(profiles).catch(err => console.error('Background verification error:', err));

    return NextResponse.json({ message: 'Started retroactive verification', total: profiles.length }, { status: 201 });
  } catch (error) {
    console.error('Verification trigger error:', error);
    return NextResponse.json({ error: 'Failed to start verification' }, { status: 500 });
  }
}

async function processVerification(profiles: Array<{
  id: number; full_name: string; username: string; bio: string;
  followers_count: number; following_count: number; media_count: number; website: string;
}>) {
  const editorExamples = await getAll<EditorExample>(`
    SELECT username, previous_tier, new_tier, editor_reason, editor_note
    FROM editor_decision_logs
    ORDER BY created_at DESC LIMIT 10
  `);

  for (const profile of profiles) {
    try {
      const media = await getAll<{ caption: string; like_count: number; comments_count: number }>(
        'SELECT * FROM media WHERE profile_id = ? ORDER BY timestamp DESC LIMIT 25',
        [profile.id]
      );
      
      const captions = media.map(m => m.caption || '').filter(Boolean);
      const totalLikes = media.reduce((s, m) => s + (Number(m.like_count) || 0), 0);
      const totalComments = media.reduce((s, m) => s + (Number(m.comments_count) || 0), 0);
      const avgLikes = media.length > 0 ? totalLikes / media.length : 0;
      const avgComments = media.length > 0 ? totalComments / media.length : 0;
      const engRate = profile.followers_count && profile.followers_count > 0
        ? ((avgLikes + avgComments) / profile.followers_count) * 100 : 0;

      await new Promise(resolve => setTimeout(resolve, 1000));

      const analysis = await analyzeProfile({
        username: profile.username,
        full_name: profile.full_name || '',
        bio: profile.bio || '',
        followers_count: profile.followers_count || 0,
        following_count: profile.following_count || 0,
        media_count: profile.media_count || 0,
        website: profile.website || '',
        recent_captions: captions,
        avg_likes: avgLikes,
        avg_comments: avgComments,
        engagement_rate: engRate,
        editorExamples: editorExamples.length > 0 ? editorExamples : undefined,
      });

      if (analysis) {
        await execute(
          `INSERT INTO analysis_results (profile_id, primary_cluster, secondary_cluster, relevance_score, authority_score, engagement_rate, monetization_signals, risk_flags, content_style, audience_alignment, tier, tier_reason, content_summary, is_approved, rejection_reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(profile_id) DO UPDATE SET
             primary_cluster = excluded.primary_cluster,
             secondary_cluster = excluded.secondary_cluster,
             relevance_score = excluded.relevance_score,
             monetization_signals = excluded.monetization_signals,
             risk_flags = excluded.risk_flags,
             content_style = excluded.content_style,
             audience_alignment = excluded.audience_alignment,
             tier = excluded.tier,
             tier_reason = excluded.tier_reason,
             content_summary = excluded.content_summary,
             is_approved = excluded.is_approved,
             rejection_reason = excluded.rejection_reason,
             analyzed_at = datetime('now')`,
          [
            profile.id, analysis.primary_cluster, analysis.secondary_cluster || null,
            analysis.relevance_score || 0, analysis.authority_score || 0,
            engRate, JSON.stringify(analysis.monetization_signals || []),
            JSON.stringify(analysis.risk_flags || []),
            analysis.content_style || 'Mixed', analysis.audience_alignment || 0,
            analysis.tier || 'D', analysis.tier_reason || '', analysis.content_summary || '',
            analysis.is_approved ? 1 : 0, analysis.is_approved ? null : (analysis.rejection_reason || null)
          ]
        );

        await execute(
          `INSERT INTO verified_profiles (profile_id, tier, is_approved, rejection_reason, verified_at)
           VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(profile_id) DO UPDATE SET
             tier = excluded.tier,
             is_approved = excluded.is_approved,
             rejection_reason = excluded.rejection_reason,
             verified_at = datetime('now')`,
          [profile.id, analysis.tier || 'D', analysis.is_approved ? 1 : 0, analysis.rejection_reason || null]
        );

        console.log(`[Verification] Re-verified ${profile.username}: Approved=${analysis.is_approved}, Tier=${analysis.tier}`);
      }

    } catch (err) {
      console.error(`[Verification] Failed for ${profile.username}:`, (err as Error).message);
    }
  }

  console.log('[Verification] Background verification job completed.');
}
