import { getOne, getAll, execute } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { fetchProfileByUsername } from '@/lib/services/instagram-client';
import { analyzeProfile, type EditorExample } from '@/lib/services/ai-analyzer';

// Background batch processor
async function processBatch(batchId: number) {
  await execute("UPDATE batch_jobs SET status = 'running', started_at = datetime('now') WHERE id = ?", [batchId]);

  const pendingLeads = await getAll<{ id: number; username: string }>(
    "SELECT id, username FROM leads WHERE fetch_status = 'pending' OR fetch_status = 'error'"
  );

  await execute('UPDATE batch_jobs SET total_leads = ? WHERE id = ?', [pendingLeads.length, batchId]);

  // Fetch recent editor decisions for AI few-shot learning
  const editorExamples = await getAll<EditorExample>(`
    SELECT username, previous_tier, new_tier, editor_reason, editor_note
    FROM editor_decision_logs
    ORDER BY created_at DESC LIMIT 10
  `);

  for (const lead of pendingLeads) {
    // Check if batch was cancelled
    const job = await getOne<{ status: string }>('SELECT status FROM batch_jobs WHERE id = ?', [batchId]);
    if (job?.status === 'cancelled') break;

    await execute("UPDATE leads SET fetch_status = 'fetching' WHERE id = ?", [lead.id]);

    // Add a base delay to prevent API spamming
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const result = await fetchProfileByUsername(lead.username);

      if (!result) {
        await execute(
          "UPDATE leads SET fetch_status = 'unfetchable', error_message = 'Not a Business/Creator account or user not found', updated_at = datetime('now') WHERE id = ?",
          [lead.id]
        );
        await execute('UPDATE batch_jobs SET processed = processed + 1, unfetchable = unfetchable + 1 WHERE id = ?', [batchId]);
        continue;
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

    } catch (err) {
      const msg = (err as Error).message;
      
      // Cybernetic Upgrade: Exponential/Fatal Backoff Handling
      if (msg.includes('Rate Limit Exceeded') || msg.includes('429')) {
        console.error(`[Batch] 🛑 Fatal Rate Limit encountered on @${lead.username}. Aborting batch job to protect API key.`);
        // Revert current lead to pending and exit batch
        await execute("UPDATE leads SET fetch_status = 'pending' WHERE id = ?", [lead.id]);
        break;
      }

      await execute(
        "UPDATE leads SET fetch_status = 'error', error_message = ?, updated_at = datetime('now') WHERE id = ?",
        [msg, lead.id]
      );
      await execute('UPDATE batch_jobs SET processed = processed + 1, errors = errors + 1 WHERE id = ?', [batchId]);
      console.error(`[Batch] Error fetching @${lead.username}:`, msg);
    }
  }

  await execute("UPDATE batch_jobs SET status = 'complete', completed_at = datetime('now') WHERE id = ? AND status = 'running'", [batchId]);
}

export async function POST() {
  try {
    // Check if there's already a running batch
    const running = await getOne<{ id: number }>("SELECT id FROM batch_jobs WHERE status = 'running'");
    if (running) {
      return NextResponse.json({ error: 'A batch job is already running', batch_id: running.id }, { status: 409 });
    }

    const pendingCount = ((await getOne<{ count: number }>("SELECT COUNT(*) as count FROM leads WHERE fetch_status IN ('pending', 'error')")) ?? { count: 0 }).count;
    if (Number(pendingCount) === 0) {
      return NextResponse.json({ error: 'No pending leads to process' }, { status: 400 });
    }

    const result = await execute("INSERT INTO batch_jobs (total_leads, status) VALUES (?, 'pending')", [pendingCount]);
    const batchId = Number(result.lastInsertRowid);

    // Fire and forget
    processBatch(batchId).catch(async (err) => {
      console.error('Batch processing error:', err);
      await execute("UPDATE batch_jobs SET status = 'complete', completed_at = datetime('now') WHERE id = ?", [batchId]);
    });

    return NextResponse.json({ batch_id: batchId, pending_leads: pendingCount }, { status: 201 });
  } catch (error) {
    console.error('Batch start error:', error);
    return NextResponse.json({ error: 'Failed to start batch' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const jobs = await getAll('SELECT * FROM batch_jobs ORDER BY created_at DESC LIMIT 10');
    const current = await getOne("SELECT * FROM batch_jobs WHERE status = 'running' LIMIT 1");

    return NextResponse.json({ current, history: jobs });
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
