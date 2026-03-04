import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { fetchProfileByUsername } from '@/lib/services/instagram-client';
import { analyzeProfile } from '@/lib/services/ai-analyzer';

// Background batch processor
async function processBatch(batchId: number) {
  const db = getDb();

  db.prepare("UPDATE batch_jobs SET status = 'running', started_at = datetime('now') WHERE id = ?").run(batchId);

  const pendingLeads = db.prepare(
    "SELECT id, username FROM leads WHERE fetch_status = 'pending' OR fetch_status = 'error'"
  ).all() as Array<{ id: number; username: string }>;

  db.prepare('UPDATE batch_jobs SET total_leads = ? WHERE id = ?').run(pendingLeads.length, batchId);

  for (const lead of pendingLeads) {
    // Check if batch was cancelled
    const job = db.prepare('SELECT status FROM batch_jobs WHERE id = ?').get(batchId) as { status: string } | undefined;
    if (job?.status === 'cancelled') break;

    db.prepare("UPDATE leads SET fetch_status = 'fetching' WHERE id = ?").run(lead.id);

    try {
      const result = await fetchProfileByUsername(lead.username);

      if (!result) {
        // User not found = personal account or doesn't exist
        db.prepare("UPDATE leads SET fetch_status = 'unfetchable', error_message = 'Not a Business/Creator account or user not found', updated_at = datetime('now') WHERE id = ?")
          .run(lead.id);
        db.prepare('UPDATE batch_jobs SET processed = processed + 1, unfetchable = unfetchable + 1 WHERE id = ?').run(batchId);
        continue;
      }

      // Store profile
      const profileResult = db.prepare(
        `INSERT INTO profiles (instagram_id, username, full_name, bio, followers_count, following_count, media_count, profile_pic_url, website)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(instagram_id) DO UPDATE SET
           followers_count = excluded.followers_count,
           following_count = excluded.following_count,
           media_count = excluded.media_count,
           bio = excluded.bio,
           profile_pic_url = excluded.profile_pic_url,
           fetched_at = datetime('now')`
      ).run(
        result.profile.id, result.profile.username, result.profile.name || '',
        result.profile.biography || '', result.profile.followers_count || 0,
        result.profile.follows_count || 0, result.profile.media_count || 0,
        result.profile.profile_picture_url || '', result.profile.website || ''
      );

      const profileId = profileResult.lastInsertRowid as number ||
        (db.prepare('SELECT id FROM profiles WHERE instagram_id = ?').get(result.profile.id) as { id: number })?.id;

      // Store media
      if (result.media && result.media.length > 0) {
        const insertMedia = db.prepare(
          `INSERT OR IGNORE INTO media (profile_id, instagram_media_id, media_type, caption, like_count, comments_count, timestamp, permalink)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const m of result.media) {
          insertMedia.run(profileId, m.id, m.media_type || 'IMAGE', m.caption || '', m.like_count || 0, m.comments_count || 0, m.timestamp || '', m.permalink || '');
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
        });

        if (analysis) {
          db.prepare(
            `INSERT INTO analysis_results (profile_id, primary_cluster, secondary_cluster, relevance_score, authority_score, engagement_rate, monetization_signals, risk_flags, tier, content_summary)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(profile_id) DO UPDATE SET
               primary_cluster = excluded.primary_cluster, tier = excluded.tier,
               authority_score = excluded.authority_score, analyzed_at = datetime('now')`
          ).run(
            profileId, analysis.primary_cluster, analysis.secondary_cluster || null,
            analysis.relevance_score || 0, analysis.authority_score || 0,
            engRate, JSON.stringify(analysis.monetization_signals || []),
            JSON.stringify(analysis.risk_flags || []), analysis.tier || 'D',
            analysis.content_summary || ''
          );
        }
      } catch (aiErr) {
        console.error(`[Batch] AI analysis failed for @${lead.username}:`, (aiErr as Error).message);
      }

      // Link lead to profile
      db.prepare("UPDATE leads SET fetch_status = 'fetched', profile_id = ?, error_message = NULL, updated_at = datetime('now') WHERE id = ?")
        .run(profileId, lead.id);
      db.prepare('UPDATE batch_jobs SET processed = processed + 1, fetched = fetched + 1 WHERE id = ?').run(batchId);

    } catch (err) {
      const msg = (err as Error).message;
      db.prepare("UPDATE leads SET fetch_status = 'error', error_message = ?, updated_at = datetime('now') WHERE id = ?")
        .run(msg, lead.id);
      db.prepare('UPDATE batch_jobs SET processed = processed + 1, errors = errors + 1 WHERE id = ?').run(batchId);
      console.error(`[Batch] Error fetching @${lead.username}:`, msg);
    }
  }

  db.prepare("UPDATE batch_jobs SET status = 'complete', completed_at = datetime('now') WHERE id = ? AND status = 'running'").run(batchId);
}

export async function POST() {
  try {
    const db = getDb();

    // Check if there's already a running batch
    const running = db.prepare("SELECT id FROM batch_jobs WHERE status = 'running'").get();
    if (running) {
      return NextResponse.json({ error: 'A batch job is already running', batch_id: (running as { id: number }).id }, { status: 409 });
    }

    const pendingCount = (db.prepare("SELECT COUNT(*) as count FROM leads WHERE fetch_status IN ('pending', 'error')").get() as { count: number }).count;
    if (pendingCount === 0) {
      return NextResponse.json({ error: 'No pending leads to process' }, { status: 400 });
    }

    const result = db.prepare("INSERT INTO batch_jobs (total_leads, status) VALUES (?, 'pending')").run(pendingCount);
    const batchId = result.lastInsertRowid as number;

    // Fire and forget
    processBatch(batchId).catch(err => {
      console.error('Batch processing error:', err);
      db.prepare("UPDATE batch_jobs SET status = 'complete', completed_at = datetime('now') WHERE id = ?").run(batchId);
    });

    return NextResponse.json({ batch_id: batchId, pending_leads: pendingCount }, { status: 201 });
  } catch (error) {
    console.error('Batch start error:', error);
    return NextResponse.json({ error: 'Failed to start batch' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const db = getDb();
    const jobs = db.prepare('SELECT * FROM batch_jobs ORDER BY created_at DESC LIMIT 10').all();
    const current = db.prepare("SELECT * FROM batch_jobs WHERE status = 'running' LIMIT 1").get();

    return NextResponse.json({ current, history: jobs });
  } catch (error) {
    console.error('Batch status error:', error);
    return NextResponse.json({ error: 'Failed to get batch status' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const db = getDb();
    const { batch_id, action } = await req.json();
    
    if (action === 'reset_errors') {
      const result = db.prepare(
        "UPDATE leads SET fetch_status = 'pending', error_message = NULL, updated_at = datetime('now') WHERE fetch_status IN ('error', 'fetching')"
      ).run();
      return NextResponse.json({ reset: result.changes });
    }
    
    db.prepare("UPDATE batch_jobs SET status = 'cancelled' WHERE id = ? AND status = 'running'").run(batch_id);
    return NextResponse.json({ cancelled: true });
  } catch (error) {
    console.error('Batch action error:', error);
    return NextResponse.json({ error: 'Failed to perform action' }, { status: 500 });
  }
}
