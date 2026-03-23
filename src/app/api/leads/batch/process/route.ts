import { getOne, getAll, execute } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { fetchProfileByUsername } from '@/lib/services/instagram-client';
import { analyzeProfile, type EditorExample } from '@/lib/services/ai-analyzer';

export const maxDuration = 60; // Vercel serverless max timeout

const PROFILE_TIMEOUT_MS = 45_000; // 45s max per profile

// Process a single lead — returns result status
async function processOneLead(
  lead: { id: number; username: string },
  batchId: number,
  editorExamples: EditorExample[]
): Promise<{ status: 'fetched' | 'unfetchable' | 'error' | 'abort'; username: string; error?: string }> {
  await execute("UPDATE leads SET fetch_status = 'fetching' WHERE id = ?", [lead.id]);

  try {
    const result = await Promise.race([
      fetchProfileByUsername(lead.username),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Profile fetch timeout (45s)')), PROFILE_TIMEOUT_MS)
      ),
    ]);

    if (!result) {
      await execute(
        "UPDATE leads SET fetch_status = 'unfetchable', error_message = 'Not a Business/Creator account or user not found', updated_at = datetime('now') WHERE id = ?",
        [lead.id]
      );
      await execute('UPDATE batch_jobs SET processed = processed + 1, unfetchable = unfetchable + 1 WHERE id = ?', [batchId]);
      return { status: 'unfetchable', username: lead.username };
    }

    // Store profile
    const profileResult = await execute(
      `INSERT INTO profiles (instagram_id, username, full_name, bio, followers_count, following_count, media_count, profile_pic_url, website)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(instagram_id) DO UPDATE SET
         followers_count = excluded.followers_count,
         following_count = excluded.following_count,
         media_count = excluded.media_count,
         bio = excluded.bio,
         profile_pic_url = excluded.profile_pic_url,
         fetched_at = datetime('now')`,
      [
        result.profile.id || '', result.profile.username || '', result.profile.name || '',
        result.profile.biography || '', result.profile.followers_count || 0,
        result.profile.follows_count || 0, result.profile.media_count || 0,
        result.profile.profile_picture_url ?? '', result.profile.website ?? ''
      ]
    );

    let profileId = Number(profileResult.lastInsertRowid);
    if (!profileId) {
      // Try by instagram_id first, then by username as fallback
      const existing = await getOne<{ id: number }>('SELECT id FROM profiles WHERE instagram_id = ?', [result.profile.id]);
      profileId = existing?.id ?? 0;
      if (!profileId) {
        const byUsername = await getOne<{ id: number }>('SELECT id FROM profiles WHERE username = ?', [result.profile.username || lead.username]);
        profileId = byUsername?.id ?? 0;
      }
    }

    if (!profileId) {
      console.error(`[Batch] ❌ Could not resolve profileId for @${lead.username} (ig_id: ${result.profile.id})`);
      await execute(
        "UPDATE leads SET fetch_status = 'error', error_message = 'Profile saved but ID could not be resolved', updated_at = datetime('now') WHERE id = ?",
        [lead.id]
      );
      await execute('UPDATE batch_jobs SET processed = processed + 1, errors = errors + 1 WHERE id = ?', [batchId]);
      return { status: 'error', username: lead.username, error: 'Profile ID resolution failed' };
    }

    // Store media
    if (result.media && result.media.length > 0) {
      for (const m of result.media) {
        await execute(
          `INSERT OR IGNORE INTO media (profile_id, instagram_media_id, media_type, caption, like_count, comments_count, timestamp, permalink)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [profileId, m.id, m.media_type || 'IMAGE', m.caption || '', m.like_count || 0, m.comments_count || 0, m.timestamp || '', m.permalink || '']
        );
      }
    }

    // Run AI analysis
    try {
      const media = result.media || [];
      const captions = media.map(m => m.caption || '').filter(Boolean);
      const totalLikes = media.reduce((s, m) => s + (m.like_count || 0), 0);
      const totalComments = media.reduce((s, m) => s + (m.comments_count || 0), 0);
      const avgLikes = media.length > 0 ? totalLikes / media.length : 0;
      const avgComments = media.length > 0 ? totalComments / media.length : 0;
      const engRate = result.profile.followers_count && result.profile.followers_count > 0
        ? ((avgLikes + avgComments) / result.profile.followers_count) * 100 : 0;
      const lastPostTs = media.length > 0 ? media[0].timestamp : null;
      const daysSinceLastPost = lastPostTs
        ? Math.floor((Date.now() - new Date(lastPostTs).getTime()) / 86_400_000)
        : undefined;

      const analysis = await analyzeProfile({
        username: result.profile.username || lead.username,
        full_name: result.profile.name || '',
        bio: result.profile.biography || '',
        followers_count: result.profile.followers_count || 0,
        following_count: result.profile.follows_count || 0,
        media_count: result.profile.media_count || 0,
        website: result.profile.website || '',
        recent_captions: captions,
        avg_likes: avgLikes,
        avg_comments: avgComments,
        engagement_rate: engRate,
        days_since_last_post: daysSinceLastPost,
        editorExamples: editorExamples.length > 0 ? editorExamples : undefined,
      });

      if (analysis) {
        await execute(
          `INSERT INTO analysis_results (profile_id, primary_cluster, secondary_cluster, relevance_score, authority_score, engagement_rate, monetization_signals, risk_flags, dynamic_tags, content_style, audience_alignment, tier, tier_reason, content_summary, is_approved, rejection_reason)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(profile_id) DO UPDATE SET
             primary_cluster = excluded.primary_cluster, tier = excluded.tier,
             secondary_cluster = excluded.secondary_cluster,
             relevance_score = excluded.relevance_score,
             authority_score = excluded.authority_score,
             monetization_signals = excluded.monetization_signals,
             risk_flags = excluded.risk_flags,
             dynamic_tags = excluded.dynamic_tags,
             content_style = excluded.content_style,
             audience_alignment = excluded.audience_alignment,
             tier_reason = excluded.tier_reason,
             content_summary = excluded.content_summary,
             is_approved = excluded.is_approved,
             rejection_reason = excluded.rejection_reason,
             analyzed_at = datetime('now')`,
          [
            profileId, analysis.primary_cluster, analysis.secondary_cluster || null,
            analysis.relevance_score || 0, analysis.authority_score || 0,
            engRate, JSON.stringify(analysis.monetization_signals || []),
            JSON.stringify(analysis.risk_flags || []),
            JSON.stringify(analysis.dynamic_tags || []),
            analysis.content_style || 'Mixed', analysis.audience_alignment || 0,
            analysis.tier || 'D', analysis.tier_reason || '', analysis.content_summary || '',
            analysis.is_approved ? 1 : 0, analysis.rejection_reason || null
          ]
        );

        await execute(
          `INSERT INTO verified_profiles (profile_id, tier, is_approved, rejection_reason, verified_at)
           VALUES (?, ?, ?, ?, datetime('now'))
           ON CONFLICT(profile_id) DO UPDATE SET
             tier = excluded.tier, is_approved = excluded.is_approved,
             rejection_reason = excluded.rejection_reason, verified_at = datetime('now')`,
          [profileId, analysis.tier || 'D', analysis.is_approved ? 1 : 0, analysis.rejection_reason || null]
        );
      }
    } catch (aiErr) {
      console.error(`[Batch] AI analysis failed for @${lead.username}:`, (aiErr as Error).message);
    }

    // Link lead to profile
    await execute(
      "UPDATE leads SET fetch_status = 'fetched', profile_id = ?, error_message = NULL, updated_at = datetime('now') WHERE id = ?",
      [profileId, lead.id]
    );
    await execute('UPDATE batch_jobs SET processed = processed + 1, fetched = fetched + 1 WHERE id = ?', [batchId]);
    return { status: 'fetched', username: lead.username };

  } catch (err) {
    const msg = (err as Error).message;

    // Fatal: Rate limit — abort
    if (msg.includes('Rate Limit Exceeded') || msg.includes('429')) {
      console.error(`[Batch] 🛑 Fatal Rate Limit on @${lead.username}. Aborting.`);
      await execute("UPDATE leads SET fetch_status = 'pending' WHERE id = ?", [lead.id]);
      return { status: 'abort', username: lead.username, error: msg };
    }

    // Fatal: Expired token — abort
    if (msg.includes('Session has expired') || msg.includes('Error validating access token') || msg.includes('Invalid OAuth')) {
      console.error(`[Batch] 🛑 ACCESS TOKEN EXPIRED. Aborting.`);
      await execute("UPDATE leads SET fetch_status = 'pending' WHERE id = ?", [lead.id]);
      return { status: 'abort', username: lead.username, error: msg };
    }

    // Unfetchable
    const isUnfetchable = msg.includes('not found') || msg.includes('not exist') ||
      msg.includes('private') || msg.includes('Invalid user') ||
      msg.includes('username not found') || msg.includes('No user') ||
      msg.includes('not a Business') || msg.includes('business_discovery');

    if (isUnfetchable) {
      await execute(
        "UPDATE leads SET fetch_status = 'unfetchable', error_message = ?, updated_at = datetime('now') WHERE id = ?",
        [msg, lead.id]
      );
      await execute('UPDATE batch_jobs SET processed = processed + 1, unfetchable = unfetchable + 1 WHERE id = ?', [batchId]);
      return { status: 'unfetchable', username: lead.username };
    } else {
      await execute(
        "UPDATE leads SET fetch_status = 'error', error_message = ?, updated_at = datetime('now') WHERE id = ?",
        [msg, lead.id]
      );
      await execute('UPDATE batch_jobs SET processed = processed + 1, errors = errors + 1 WHERE id = ?', [batchId]);
      return { status: 'error', username: lead.username, error: msg };
    }
  }
}

/**
 * POST /api/leads/batch/process
 * 
 * Serverless-compatible: processes a chunk of leads per request (up to `concurrency` count).
 * The frontend calls this repeatedly until all leads are processed.
 * Each call completes within Vercel's 60s timeout.
 * 
 * Body: { concurrency?: 1|3|5 }
 * Returns: { done: boolean, processed: results[], remaining: number, batchId: number }
 */
export async function POST(req: NextRequest) {
  try {
    // Read concurrency (default: 3)
    let concurrency = 3;
    try {
      const body = await req.json();
      if (body.concurrency && [1, 3, 5].includes(body.concurrency)) {
        concurrency = body.concurrency;
      }
    } catch { /* default */ }

    // Find or create a running batch job
    let batch = await getOne<{ id: number; status: string }>("SELECT id, status FROM batch_jobs WHERE status = 'running' LIMIT 1");
    
    if (!batch) {
      // No running batch — create one
      const pendingCount = ((await getOne<{ count: number }>("SELECT COUNT(*) as count FROM leads WHERE fetch_status IN ('pending', 'error')")) ?? { count: 0 }).count;
      if (Number(pendingCount) === 0) {
        return NextResponse.json({ done: true, processed: [], remaining: 0, message: 'No pending leads' });
      }

      // Recover orphaned "fetching" leads
      await execute("UPDATE leads SET fetch_status = 'pending', error_message = NULL WHERE fetch_status = 'fetching'");

      const result = await execute("INSERT INTO batch_jobs (total_leads, status, started_at) VALUES (?, 'running', datetime('now'))", [pendingCount]);
      batch = { id: Number(result.lastInsertRowid), status: 'running' };
      console.log(`[Batch] 🚀 Created batch #${batch.id} with ${pendingCount} leads (${concurrency}x concurrency)`);
    }

    // Check if cancelled
    if (batch.status === 'cancelled') {
      return NextResponse.json({ done: true, processed: [], remaining: 0, message: 'Batch was cancelled' });
    }

    // Get next chunk of pending leads
    const chunk = await getAll<{ id: number; username: string }>(
      `SELECT id, username FROM leads WHERE fetch_status IN ('pending', 'error') LIMIT ?`,
      [concurrency]
    );

    if (chunk.length === 0) {
      // All done
      await execute("UPDATE batch_jobs SET status = 'complete', completed_at = datetime('now') WHERE id = ? AND status = 'running'", [batch.id]);
      return NextResponse.json({ done: true, processed: [], remaining: 0, batchId: batch.id });
    }

    // Fetch editor examples for AI few-shot learning
    const editorExamples = await getAll<EditorExample>(`
      SELECT username, previous_tier, new_tier, editor_reason, editor_note
      FROM editor_decision_logs
      ORDER BY created_at DESC LIMIT 10
    `);

    // Process chunk concurrently
    const results = await Promise.allSettled(
      chunk.map(async (lead, idx) => {
        if (idx > 0) await new Promise(r => setTimeout(r, idx * 300));
        return processOneLead(lead, batch!.id, editorExamples);
      })
    );

    const processed = results.map(r => 
      r.status === 'fulfilled' ? r.value : { status: 'error' as const, username: '?', error: 'Promise rejected' }
    );

    // Check if any aborted
    const aborted = processed.some(p => p.status === 'abort');
    if (aborted) {
      await execute("UPDATE batch_jobs SET status = 'complete', completed_at = datetime('now') WHERE id = ?", [batch.id]);
      return NextResponse.json({ done: true, processed, remaining: 0, aborted: true, batchId: batch.id });
    }

    // Get remaining count
    const remaining = ((await getOne<{ count: number }>("SELECT COUNT(*) as count FROM leads WHERE fetch_status IN ('pending', 'error')")) ?? { count: 0 }).count;

    // Update total_leads to actual remaining
    await execute('UPDATE batch_jobs SET total_leads = processed + ? WHERE id = ?', [remaining, batch.id]);

    return NextResponse.json({ done: Number(remaining) === 0, processed, remaining: Number(remaining), batchId: batch.id });
  } catch (error) {
    console.error('[Batch/Process] Error:', error);
    return NextResponse.json({ error: 'Processing failed', message: (error as Error).message }, { status: 500 });
  }
}
