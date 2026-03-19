import { NextRequest, NextResponse } from 'next/server';
import { getOne, getAll, execute, batch } from '@/lib/db';
import { analyzeProfile, type EditorExample } from '@/lib/services/ai-analyzer';

// ─── Concurrency config ──────────────────────────────────────────────────────
const CONCURRENCY = 3;        // Process 3 profiles in parallel
const INTER_BATCH_DELAY = 150; // ms between concurrent batches (rate-limit guard)

type ProfileRow = {
  id: number; username: string; full_name: string; bio: string;
  followers_count: number; following_count: number; media_count: number; website: string;
};

type MediaRow = {
  profile_id: number; like_count: number; comments_count: number;
  caption: string; timestamp: string;
};

type AnalysisRow = {
  profile_id: number; primary_cluster: string; secondary_cluster: string;
  relevance_score: number; authority_score: number; engagement_rate: number;
  monetization_signals: string; dynamic_tags: string; audience_alignment: number;
  tier: string; tier_reason: string; content_style: string; content_summary: string;
  risk_flags: string; is_approved: number; rejection_reason: string;
};

async function processSingleProfile(
  profile: ProfileRow,
  mediaMap: Map<number, MediaRow[]>,
  analysisMap: Map<number, AnalysisRow>,
  editorExamples: EditorExample[],
) {
  const media = mediaMap.get(profile.id) || [];
  const captions = media.map(m => m.caption || '').filter(Boolean);
  const avgLikes = media.length > 0 ? media.reduce((s, m) => s + (Number(m.like_count) || 0), 0) / media.length : 0;
  const avgComments = media.length > 0 ? media.reduce((s, m) => s + (Number(m.comments_count) || 0), 0) / media.length : 0;
  const followersCount = Number(profile.followers_count) || 1;
  const engagementRate = media.length > 0 ? ((avgLikes + avgComments) / followersCount) * 100 : 0;
  const lastPostTs = media.length > 0 ? media[0].timestamp : null;
  const daysSinceLastPost = lastPostTs
    ? Math.floor((Date.now() - new Date(lastPostTs).getTime()) / 86_400_000)
    : undefined;

  // Snapshot current analysis before overwriting
  const currentAnalysis = analysisMap.get(profile.id);

  // Build DB writes to execute in a single batch call later
  const dbWrites: Array<{ sql: string; args: (string | number | null)[] }> = [];

  if (currentAnalysis) {
    dbWrites.push({
      sql: `INSERT INTO analysis_snapshots
        (profile_id, snapshot_reason, primary_cluster, secondary_cluster, relevance_score,
         authority_score, engagement_rate, monetization_signals, dynamic_tags, audience_alignment, tier,
         tier_reason, content_style, content_summary, is_approved, rejection_reason)
        VALUES (?, 'batch_reverify', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        profile.id,
        currentAnalysis.primary_cluster, currentAnalysis.secondary_cluster,
        Number(currentAnalysis.relevance_score) || 0, Number(currentAnalysis.authority_score) || 0,
        Number(currentAnalysis.engagement_rate) || 0, currentAnalysis.monetization_signals,
        currentAnalysis.dynamic_tags,
        Number(currentAnalysis.audience_alignment) || 0, currentAnalysis.tier, currentAnalysis.tier_reason,
        currentAnalysis.content_style, currentAnalysis.content_summary,
        currentAnalysis.is_approved, currentAnalysis.rejection_reason,
      ],
    });
  }

  // AI analysis — this is the slow part
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

  // Upsert analysis_results
  dbWrites.push({
    sql: `INSERT INTO analysis_results
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
        analyzed_at        = datetime('now')`,
    args: [
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
    ],
  });

  // Upsert verified_profiles
  dbWrites.push({
    sql: `INSERT INTO verified_profiles (profile_id, tier, is_approved, rejection_reason, verified_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(profile_id) DO UPDATE SET
        tier = excluded.tier,
        is_approved = excluded.is_approved,
        rejection_reason = excluded.rejection_reason,
        verified_at = datetime('now')`,
    args: [profile.id, newAnalysis.tier || 'D', newAnalysis.is_approved ? 1 : 0, newAnalysis.is_approved ? null : (newAnalysis.rejection_reason ?? null)],
  });

  // Execute all DB writes in a single pipeline call
  await batch(dbWrites);

  return { username: profile.username, success: true };
}

async function processBatchReverify(jobId: number) {
  await execute("UPDATE reverify_jobs SET status = 'running', started_at = datetime('now') WHERE id = ?", [jobId]);

  // 1. Get all un-reverified profile IDs
  const profiles = await getAll<ProfileRow>(`
    SELECT p.id, p.username, p.full_name, p.bio, p.followers_count, p.following_count, p.media_count, p.website
    FROM profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM analysis_snapshots s
      WHERE s.profile_id = p.id
        AND s.snapshot_reason IN ('reverify', 'batch_reverify')
    )
    ORDER BY p.id ASC
  `);

  const totalProfiles = profiles.length;
  await execute('UPDATE reverify_jobs SET total_profiles = ? WHERE id = ?', [totalProfiles, jobId]);

  if (totalProfiles === 0) {
    await execute("UPDATE reverify_jobs SET status = 'complete', completed_at = datetime('now') WHERE id = ?", [jobId]);
    return;
  }

  // 2. Bulk-load ALL media for these profiles (single query instead of N queries)
  const profileIds = profiles.map(p => p.id);
  const mediaMap = new Map<number, MediaRow[]>();

  // Load media in chunks of 200 to avoid SQL param limits
  for (let i = 0; i < profileIds.length; i += 200) {
    const chunk = profileIds.slice(i, i + 200);
    const placeholders = chunk.map(() => '?').join(',');
    const mediaRows = await getAll<MediaRow>(
      `SELECT profile_id, like_count, comments_count, caption, timestamp
       FROM media WHERE profile_id IN (${placeholders})
       ORDER BY timestamp DESC`,
      chunk
    );

    for (const row of mediaRows) {
      const existing = mediaMap.get(row.profile_id) || [];
      if (existing.length < 25) { // Limit per profile (same as before)
        existing.push(row);
        mediaMap.set(row.profile_id, existing);
      }
    }
  }

  // 3. Bulk-load ALL current analysis results (single query)
  const analysisMap = new Map<number, AnalysisRow>();
  for (let i = 0; i < profileIds.length; i += 200) {
    const chunk = profileIds.slice(i, i + 200);
    const placeholders = chunk.map(() => '?').join(',');
    const analysisRows = await getAll<AnalysisRow>(
      `SELECT * FROM analysis_results WHERE profile_id IN (${placeholders})`,
      chunk
    );
    for (const row of analysisRows) {
      analysisMap.set(row.profile_id, row);
    }
  }

  // 4. Load editor examples once
  const editorExamples = await getAll<EditorExample>(`
    SELECT username, previous_tier, new_tier, editor_reason, editor_note
    FROM editor_decision_logs
    ORDER BY created_at DESC LIMIT 10
  `);

  // 5. Process profiles in concurrent batches of CONCURRENCY
  let processed = 0;
  let errors = 0;

  for (let i = 0; i < profiles.length; i += CONCURRENCY) {
    // Check if job was cancelled (once per batch, not per profile)
    const job = await getOne<{ status: string }>('SELECT status FROM reverify_jobs WHERE id = ?', [jobId]);
    if (job?.status === 'cancelled') break;

    const chunk = profiles.slice(i, i + CONCURRENCY);

    // Update current_username to show first profile of batch
    await execute('UPDATE reverify_jobs SET current_username = ? WHERE id = ?', [chunk[0].username, jobId]);

    // Process chunk concurrently
    const results = await Promise.allSettled(
      chunk.map(profile =>
        processSingleProfile(profile, mediaMap, analysisMap, editorExamples)
      )
    );

    // Count successes and failures
    for (const result of results) {
      processed++;
      if (result.status === 'rejected') {
        errors++;
        console.error(`[BatchReverify] Error:`, result.reason?.message || result.reason);
      }
    }

    // Update progress in a single call
    await execute('UPDATE reverify_jobs SET processed = ?, errors = ? WHERE id = ?', [processed, errors, jobId]);

    // Small delay between batches to avoid hammering AI API
    if (i + CONCURRENCY < profiles.length) {
      await new Promise(resolve => setTimeout(resolve, INTER_BATCH_DELAY));
    }
  }

  await execute("UPDATE reverify_jobs SET status = 'complete', completed_at = datetime('now'), current_username = NULL WHERE id = ? AND status = 'running'", [jobId]);
  console.log(`[BatchReverify] ✅ Complete: ${processed} processed, ${errors} errors`);
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
