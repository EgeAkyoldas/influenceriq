import { NextRequest, NextResponse } from 'next/server';
import { getOne, getAll, execute } from '@/lib/db';
import { analyzeProfile, type EditorExample } from '@/lib/services/ai-analyzer';

async function processBatchReverify(jobId: number) {
  await execute("UPDATE reverify_jobs SET status = 'running', started_at = datetime('now') WHERE id = ?", [jobId]);

  // Only process profiles that have NOT been reverified yet
  const profiles = await getAll<{
    id: number; username: string; full_name: string; bio: string;
    followers_count: number; following_count: number; media_count: number; website: string;
  }>(`
    SELECT p.id, p.username, p.full_name, p.bio, p.followers_count, p.following_count, p.media_count, p.website
    FROM profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM analysis_snapshots s
      WHERE s.profile_id = p.id
        AND s.snapshot_reason IN ('reverify', 'batch_reverify')
    )
    ORDER BY p.id ASC
  `);

  await execute('UPDATE reverify_jobs SET total_profiles = ? WHERE id = ?', [profiles.length, jobId]);

  // Load recent editor decisions for AI few-shot calibration
  const editorExamples = await getAll<EditorExample>(`
    SELECT username, previous_tier, new_tier, editor_reason, editor_note
    FROM editor_decision_logs
    ORDER BY created_at DESC LIMIT 10
  `);

  for (const profile of profiles) {
    // Check if job was cancelled
    const job = await getOne<{ status: string }>('SELECT status FROM reverify_jobs WHERE id = ?', [jobId]);
    if (job?.status === 'cancelled') break;

    // Track which profile is currently being processed
    await execute('UPDATE reverify_jobs SET current_username = ? WHERE id = ?', [profile.username, jobId]);

    try {
      // 1. Load cached media from DB
      const media = await getAll<{ like_count: number; comments_count: number; caption: string; timestamp: string }>(
        'SELECT like_count, comments_count, caption, timestamp FROM media WHERE profile_id = ? ORDER BY timestamp DESC LIMIT 25',
        [profile.id]
      );

      const captions = media.map(m => m.caption || '').filter(Boolean);
      const avgLikes = media.length > 0 ? media.reduce((s, m) => s + (Number(m.like_count) || 0), 0) / media.length : 0;
      const avgComments = media.length > 0 ? media.reduce((s, m) => s + (Number(m.comments_count) || 0), 0) / media.length : 0;
      const followersCount = Number(profile.followers_count) || 1;
      const engagementRate = media.length > 0 ? ((avgLikes + avgComments) / followersCount) * 100 : 0;
      const lastPostTs = media.length > 0 ? media[0].timestamp : null;
      const daysSinceLastPost = lastPostTs
        ? Math.floor((Date.now() - new Date(lastPostTs).getTime()) / 86_400_000)
        : undefined;

      // 2. Snapshot current analysis before overwriting
      const currentAnalysis = await getOne<{
        primary_cluster: string; secondary_cluster: string; relevance_score: number;
        authority_score: number; engagement_rate: number; monetization_signals: string;
        dynamic_tags: string; audience_alignment: number; tier: string; tier_reason: string;
        content_style: string; content_summary: string; risk_flags: string;
        is_approved: number; rejection_reason: string;
      }>('SELECT * FROM analysis_results WHERE profile_id = ?', [profile.id]);

      if (currentAnalysis) {
        await execute(`
          INSERT INTO analysis_snapshots
            (profile_id, snapshot_reason, primary_cluster, secondary_cluster, relevance_score,
             authority_score, engagement_rate, monetization_signals, dynamic_tags, audience_alignment, tier,
             tier_reason, content_style, content_summary, is_approved, rejection_reason)
          VALUES (?, 'batch_reverify', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          profile.id,
          currentAnalysis.primary_cluster, currentAnalysis.secondary_cluster,
          Number(currentAnalysis.relevance_score) || 0, Number(currentAnalysis.authority_score) || 0,
          Number(currentAnalysis.engagement_rate) || 0, currentAnalysis.monetization_signals,
          currentAnalysis.dynamic_tags,
          Number(currentAnalysis.audience_alignment) || 0, currentAnalysis.tier, currentAnalysis.tier_reason,
          currentAnalysis.content_style, currentAnalysis.content_summary,
          currentAnalysis.is_approved, currentAnalysis.rejection_reason
        ]);
      }

      // 3. Run AI analysis with editor examples
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
        days_since_last_post: daysSinceLastPost,
        editorExamples: editorExamples.length > 0 ? editorExamples.slice(0, 5) : undefined,
      });

      // 4. Upsert analysis_results — full field set, same safe logic as reverify/apply
      await execute(`
        INSERT INTO analysis_results
          (profile_id, primary_cluster, secondary_cluster, relevance_score, authority_score,
           engagement_rate, monetization_signals, risk_flags, dynamic_tags, audience_alignment,
           tier, tier_reason, content_summary, content_style, is_approved, rejection_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(profile_id) DO UPDATE SET
          primary_cluster    = excluded.primary_cluster,
          secondary_cluster  = COALESCE(excluded.secondary_cluster, secondary_cluster),
          relevance_score    = CASE WHEN excluded.relevance_score > 0 THEN excluded.relevance_score ELSE relevance_score END,
          authority_score    = CASE WHEN excluded.authority_score >= 1 THEN excluded.authority_score ELSE authority_score END,
          engagement_rate    = excluded.engagement_rate,
          monetization_signals = CASE WHEN json_array_length(excluded.monetization_signals) > 0 THEN excluded.monetization_signals ELSE monetization_signals END,
          risk_flags         = excluded.risk_flags,
          dynamic_tags       = CASE WHEN json_array_length(excluded.dynamic_tags) > 0 THEN excluded.dynamic_tags ELSE dynamic_tags END,
          audience_alignment = CASE WHEN excluded.audience_alignment > 0 THEN excluded.audience_alignment ELSE audience_alignment END,
          tier               = excluded.tier,
          tier_reason        = CASE WHEN excluded.tier_reason != '' THEN excluded.tier_reason ELSE tier_reason END,
          content_summary    = CASE WHEN excluded.content_summary != '' THEN excluded.content_summary ELSE content_summary END,
          content_style      = CASE WHEN excluded.content_style != '' AND excluded.content_style != 'Unknown' THEN excluded.content_style ELSE COALESCE(content_style, 'Mixed') END,
          is_approved        = excluded.is_approved,
          rejection_reason   = CASE
                                 WHEN excluded.is_approved = 1 THEN NULL
                                 WHEN excluded.rejection_reason IS NOT NULL THEN excluded.rejection_reason
                                 ELSE rejection_reason
                               END,
          analyzed_at        = datetime('now')
      `, [
        profile.id,
        newAnalysis.primary_cluster,
        newAnalysis.secondary_cluster ?? null,
        newAnalysis.relevance_score || 0,
        newAnalysis.authority_score || 0,
        engagementRate,
        JSON.stringify(newAnalysis.monetization_signals || []),
        JSON.stringify(newAnalysis.risk_flags || []),
        JSON.stringify(newAnalysis.dynamic_tags || []),
        newAnalysis.audience_alignment || 0,
        newAnalysis.tier || 'D',
        newAnalysis.tier_reason || '',
        newAnalysis.content_summary || '',
        newAnalysis.content_style || 'Mixed',
        newAnalysis.is_approved ? 1 : 0,
        newAnalysis.is_approved ? null : (newAnalysis.rejection_reason ?? null),
      ]);

      // 5. Upsert verified_profiles
      await execute(`
        INSERT INTO verified_profiles (profile_id, tier, is_approved, rejection_reason, verified_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(profile_id) DO UPDATE SET
          tier = excluded.tier,
          is_approved = excluded.is_approved,
          rejection_reason = excluded.rejection_reason,
          verified_at = datetime('now')
      `, [profile.id, newAnalysis.tier || 'D', newAnalysis.is_approved ? 1 : 0, newAnalysis.is_approved ? null : (newAnalysis.rejection_reason ?? null)]);

      await execute('UPDATE reverify_jobs SET processed = processed + 1 WHERE id = ?', [jobId]);

      // Small delay to avoid hammering the AI API
      await new Promise(resolve => setTimeout(resolve, 800));

    } catch (err) {
      console.error(`[BatchReverify] Error processing @${profile.username}:`, (err as Error).message);
      await execute('UPDATE reverify_jobs SET processed = processed + 1, errors = errors + 1 WHERE id = ?', [jobId]);
    }
  }

  await execute("UPDATE reverify_jobs SET status = 'complete', completed_at = datetime('now'), current_username = NULL WHERE id = ? AND status = 'running'", [jobId]);
}

export async function POST() {
  try {
    // Block if already running
    const running = await getOne<{ id: number }>("SELECT id FROM reverify_jobs WHERE status = 'running'");
    if (running) {
      return NextResponse.json({ error: 'A batch reverify is already running', job_id: running.id }, { status: 409 });
    }

    const profileCount = ((await getOne<{ count: number }>(`
      SELECT COUNT(*) as count FROM profiles p
      WHERE NOT EXISTS (
        SELECT 1 FROM analysis_snapshots s
        WHERE s.profile_id = p.id
          AND s.snapshot_reason IN ('reverify', 'batch_reverify')
      )
    `)) ?? { count: 0 }).count;
    if (Number(profileCount) === 0) {
      return NextResponse.json({ error: 'No un-reverified profiles remaining' }, { status: 400 });
    }

    const result = await execute("INSERT INTO reverify_jobs (total_profiles, status) VALUES (?, 'pending')", [profileCount]);
    const jobId = Number(result.lastInsertRowid);

    // Fire and forget
    processBatchReverify(jobId).catch(async (err) => {
      console.error('[BatchReverify] Fatal error:', err);
      await execute("UPDATE reverify_jobs SET status = 'complete', completed_at = datetime('now') WHERE id = ?", [jobId]);
    });

    return NextResponse.json({ job_id: jobId, total_profiles: profileCount }, { status: 201 });
  } catch (error) {
    console.error('[BatchReverify] Start error:', error);
    return NextResponse.json({ error: 'Failed to start batch reverify' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const current = await getOne<{
      id: number; total_profiles: number; processed: number; errors: number;
      status: string; started_at: string | null; current_username: string | null;
    }>("SELECT * FROM reverify_jobs WHERE status = 'running' LIMIT 1");
    const history = await getAll('SELECT * FROM reverify_jobs ORDER BY created_at DESC LIMIT 5');

    let eta_seconds: number | null = null;
    if (current && current.started_at && current.processed > 0) {
      const elapsedMs = Date.now() - new Date(current.started_at + 'Z').getTime();
      const msPerProfile = elapsedMs / current.processed;
      const remaining = current.total_profiles - current.processed;
      eta_seconds = Math.round((remaining * msPerProfile) / 1000);
    }

    return NextResponse.json({ current: current ? { ...current, eta_seconds } : null, history });
  } catch (error) {
    console.error('[BatchReverify] Status error:', error);
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === 'reset') {
      const result = await execute(
        "DELETE FROM analysis_snapshots WHERE snapshot_reason IN ('reverify', 'batch_reverify')"
      );
      return NextResponse.json({ reset: true, deleted_snapshots: result.rowsAffected });
    }

    await execute("UPDATE reverify_jobs SET status = 'cancelled' WHERE id = ? AND status = 'running'", [body.job_id]);
    return NextResponse.json({ cancelled: true });
  } catch (error) {
    console.error('[BatchReverify] Cancel/reset error:', error);
    return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 });
  }
}
