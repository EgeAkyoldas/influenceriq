import { getOne, getAll, execute } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { fetchProfileByUsername } from '@/lib/services/instagram-client';
import { analyzeProfile, type EditorExample } from '@/lib/services/ai-analyzer';

const PROFILE_TIMEOUT_MS = 60_000; // 60s max per profile
const STALE_JOB_MINUTES = 5;

// Process a single lead — returns 'continue' | 'abort'
async function processOneLead(
  lead: { id: number; username: string },
  batchId: number,
  editorExamples: EditorExample[]
): Promise<'continue' | 'abort'> {
  await execute("UPDATE leads SET fetch_status = 'fetching' WHERE id = ?", [lead.id]);

  try {
    // Wrap fetch in a timeout
    const result = await Promise.race([
      fetchProfileByUsername(lead.username),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Profile fetch timeout (60s)')), PROFILE_TIMEOUT_MS)
      ),
    ]);

    if (!result) {
      await execute(
        "UPDATE leads SET fetch_status = 'unfetchable', error_message = 'Not a Business/Creator account or user not found', updated_at = datetime('now') WHERE id = ?",
        [lead.id]
      );
      await execute('UPDATE batch_jobs SET processed = processed + 1, unfetchable = unfetchable + 1 WHERE id = ?', [batchId]);
      return 'continue';
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
      const existing = await getOne<{ id: number }>('SELECT id FROM profiles WHERE instagram_id = ?', [result.profile.id]);
      profileId = existing?.id ?? 0;
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
    return 'continue';

  } catch (err) {
    const msg = (err as Error).message;

    // Fatal: Rate limit — abort entire batch
    if (msg.includes('Rate Limit Exceeded') || msg.includes('429')) {
      console.error(`[Batch] 🛑 Fatal Rate Limit on @${lead.username}. Aborting batch.`);
      await execute("UPDATE leads SET fetch_status = 'pending' WHERE id = ?", [lead.id]);
      return 'abort';
    }

    // Fatal: Expired token — abort entire batch
    if (msg.includes('Session has expired') || msg.includes('Error validating access token') || msg.includes('Invalid OAuth')) {
      console.error(`[Batch] 🛑 ACCESS TOKEN EXPIRED. Aborting batch.`);
      await execute("UPDATE leads SET fetch_status = 'pending' WHERE id = ?", [lead.id]);
      return 'abort';
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
      console.log(`[Batch] ⚠️ Unfetchable @${lead.username}: ${msg}`);
    } else {
      await execute(
        "UPDATE leads SET fetch_status = 'error', error_message = ?, updated_at = datetime('now') WHERE id = ?",
        [msg, lead.id]
      );
      await execute('UPDATE batch_jobs SET processed = processed + 1, errors = errors + 1 WHERE id = ?', [batchId]);
      console.error(`[Batch] ❌ Error @${lead.username}: ${msg}`);
    }
    return 'continue';
  }
}

// Concurrent batch processor with configurable concurrency (1x, 3x, 5x)
async function processBatch(batchId: number, concurrency: number) {
  console.log(`[Batch] 🚀 Starting batch #${batchId} with ${concurrency}x concurrency`);

  // Recover orphaned "fetching" leads from previous crashes
  const recovered = await execute(
    "UPDATE leads SET fetch_status = 'pending', error_message = NULL WHERE fetch_status = 'fetching'"
  );
  if (recovered.rowsAffected > 0) {
    console.log(`[Batch] ♻️ Recovered ${recovered.rowsAffected} orphaned 'fetching' leads`);
  }

  await execute("UPDATE batch_jobs SET status = 'running', started_at = datetime('now') WHERE id = ?", [batchId]);

  const pendingLeads = await getAll<{ id: number; username: string }>(
    "SELECT id, username FROM leads WHERE fetch_status = 'pending' OR fetch_status = 'error'"
  );

  await execute('UPDATE batch_jobs SET total_leads = ? WHERE id = ?', [pendingLeads.length, batchId]);

  const editorExamples = await getAll<EditorExample>(`
    SELECT username, previous_tier, new_tier, editor_reason, editor_note
    FROM editor_decision_logs
    ORDER BY created_at DESC LIMIT 10
  `);

  let aborted = false;
  let i = 0;

  while (i < pendingLeads.length && !aborted) {
    // Check if batch was cancelled
    const job = await getOne<{ status: string }>('SELECT status FROM batch_jobs WHERE id = ?', [batchId]);
    if (job?.status === 'cancelled') {
      console.log(`[Batch] 🔴 Batch #${batchId} cancelled by user`);
      break;
    }

    // Take the next `concurrency` leads as a chunk
    const chunk = pendingLeads.slice(i, i + concurrency);
    i += chunk.length;

    // Process chunk concurrently
    const results = await Promise.allSettled(
      chunk.map(async (lead) => {
        // Stagger start slightly to avoid thundering herd (300ms between each in a chunk)
        const idx = chunk.indexOf(lead);
        if (idx > 0) await new Promise(r => setTimeout(r, idx * 300));
        return processOneLead(lead, batchId, editorExamples);
      })
    );

    // Check if any returned 'abort'
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value === 'abort') {
        aborted = true;
        break;
      }
    }

    // Base delay between chunks to avoid API spam (scale down with concurrency)
    if (!aborted) {
      const chunkDelay = concurrency === 1 ? 2000 : concurrency === 3 ? 1500 : 1000;
      await new Promise(r => setTimeout(r, chunkDelay));
    }
  }

  await execute("UPDATE batch_jobs SET status = 'complete', completed_at = datetime('now') WHERE id = ? AND status = 'running'", [batchId]);
  console.log(`[Batch] ✅ Batch #${batchId} complete. Processed ${i} leads.`);
}

export async function POST(req: NextRequest) {
  try {
    // Auto-cancel stale running jobs
    await execute(
      `UPDATE batch_jobs SET status = 'cancelled' 
       WHERE status = 'running' 
       AND started_at < datetime('now', '-${STALE_JOB_MINUTES} minutes')`
    );

    // Check if there's already a running batch
    const running = await getOne<{ id: number }>("SELECT id FROM batch_jobs WHERE status = 'running'");
    if (running) {
      return NextResponse.json({ error: 'A batch job is already running', batch_id: running.id }, { status: 409 });
    }

    const pendingCount = ((await getOne<{ count: number }>("SELECT COUNT(*) as count FROM leads WHERE fetch_status IN ('pending', 'error')")) ?? { count: 0 }).count;
    if (Number(pendingCount) === 0) {
      return NextResponse.json({ error: 'No pending leads to process' }, { status: 400 });
    }

    // Read concurrency from request body (default: 1)
    let concurrency = 1;
    try {
      const body = await req.json();
      if (body.concurrency && [1, 3, 5].includes(body.concurrency)) {
        concurrency = body.concurrency;
      }
    } catch { /* No body = default concurrency 1 */ }

    const result = await execute("INSERT INTO batch_jobs (total_leads, status) VALUES (?, 'pending')", [pendingCount]);
    const batchId = Number(result.lastInsertRowid);

    // Fire and forget
    processBatch(batchId, concurrency).catch(async (err) => {
      console.error('Batch processing error:', err);
      await execute("UPDATE batch_jobs SET status = 'complete', completed_at = datetime('now') WHERE id = ?", [batchId]);
    });

    return NextResponse.json({ batch_id: batchId, pending_leads: pendingCount, concurrency }, { status: 201 });
  } catch (error) {
    console.error('Batch start error:', error);
    return NextResponse.json({ error: 'Failed to start batch' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const jobs = await getAll('SELECT * FROM batch_jobs ORDER BY created_at DESC LIMIT 10');
    const current = await getOne("SELECT * FROM batch_jobs WHERE status = 'running' LIMIT 1");

    // Recent activity: last 15 processed leads with profile info
    const recentActivity = await getAll<{
      username: string;
      fetch_status: string;
      error_message: string | null;
      profile_pic_url: string | null;
      followers_count: number | null;
      full_name: string | null;
      updated_at: string;
    }>(`
      SELECT l.username, l.fetch_status, l.error_message,
             p.profile_pic_url, p.followers_count, p.full_name,
             l.updated_at
      FROM leads l
      LEFT JOIN profiles p ON p.id = l.profile_id
      WHERE l.fetch_status IN ('fetched', 'unfetchable', 'error', 'fetching')
      ORDER BY l.updated_at DESC
      LIMIT 15
    `);

    return NextResponse.json({ current, history: jobs, recentActivity });
  } catch (error) {
    console.error('Batch status error:', error);
    return NextResponse.json({ error: 'Failed to get batch status' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { batch_id, action } = await req.json();
    
    if (action === 'reset_errors') {
      const result = await execute(
        "UPDATE leads SET fetch_status = 'pending', error_message = NULL, updated_at = datetime('now') WHERE fetch_status IN ('error', 'fetching')"
      );
      return NextResponse.json({ reset: result.rowsAffected });
    }
    
    await execute("UPDATE batch_jobs SET status = 'cancelled' WHERE id = ? AND status = 'running'", [batch_id]);
    return NextResponse.json({ cancelled: true });
  } catch (error) {
    console.error('Batch action error:', error);
    return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 });
  }
}
