import { getDb } from '@/lib/db';
import { fetchProfileByUsername } from './instagram-client';
import { analyzeProfile } from './ai-analyzer';
import { applyPreFilters } from './pre-filter';
import type { FilterSettings, Research } from '@/types';

export async function runResearchPipeline(researchId: number): Promise<void> {
  const db = getDb();

  const research = db.prepare('SELECT * FROM research WHERE id = ?').get(researchId) as Research | undefined;
  if (!research) throw new Error(`Research ${researchId} not found`);

  const filterRow = db.prepare('SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?)').all(
    'min_followers', 'min_engagement_rate', 'min_english_content', 'min_posts_per_month'
  ) as Array<{ key: string; value: string }>;

  const settings: FilterSettings = {
    min_followers: 5000,
    min_engagement_rate: 1.0,
    min_english_content: 60,
    min_posts_per_month: 2,
  };
  for (const row of filterRow) {
    if (row.key === 'min_followers') settings.min_followers = Number(row.value);
    if (row.key === 'min_engagement_rate') settings.min_engagement_rate = Number(row.value);
    if (row.key === 'min_english_content') settings.min_english_content = Number(row.value);
    if (row.key === 'min_posts_per_month') settings.min_posts_per_month = Number(row.value);
  }

  // Parse usernames from seed
  let usernames: string[] = [];
  if (research.seed_type === 'username') {
    usernames = research.seed_value.split(',').map(u => u.trim().replace('@', '')).filter(Boolean);
  } else if (research.seed_type === 'csv') {
    usernames = research.seed_value.split(/[\n,]/).map(u => u.trim().replace('@', '')).filter(Boolean);
  }

  if (usernames.length === 0) {
    db.prepare('UPDATE research SET status = ?, error_message = ? WHERE id = ?')
      .run('failed', 'No valid usernames found in seed data', researchId);
    return;
  }

  // Update status to fetching
  db.prepare('UPDATE research SET status = ? WHERE id = ?').run('fetching', researchId);

  let profilesFetched = 0;
  let profilesAnalyzed = 0;

  for (const username of usernames) {
    try {
      // 1. Fetch from Instagram
      const result = await fetchProfileByUsername(username);
      if (!result) {
        console.log(`Profile @${username} not found, skipping`);
        continue;
      }

      // 2. Store profile
      const { profile, media } = result;
      const insertProfile = db.prepare(`
        INSERT OR REPLACE INTO profiles (instagram_id, username, full_name, bio, followers_count, following_count, media_count, profile_pic_url, website, is_verified, research_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const profileResult = insertProfile.run(
        profile.id,
        profile.username || username,
        profile.name || '',
        profile.biography || '',
        profile.followers_count || 0,
        profile.follows_count || 0,
        profile.media_count || 0,
        profile.profile_picture_url || '',
        profile.website || '',
        profile.is_verified ? 1 : 0,
        researchId
      );
      const profileId = profileResult.lastInsertRowid as number;
      profilesFetched++;

      // 3. Store media
      const insertMedia = db.prepare(`
        INSERT OR IGNORE INTO media (profile_id, instagram_media_id, media_type, caption, like_count, comments_count, timestamp, permalink)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const m of media) {
        insertMedia.run(
          profileId,
          m.id,
          m.media_type || 'IMAGE',
          m.caption || '',
          m.like_count || 0,
          m.comments_count || 0,
          m.timestamp || '',
          m.permalink || ''
        );
      }

      // Update count
      db.prepare('UPDATE research SET profiles_found = ? WHERE id = ?').run(profilesFetched, researchId);

      // 4. Pre-filter
      const captions = media.map(m => m.caption || '').filter(Boolean);
      const avgLikes = media.length > 0 ? media.reduce((sum, m) => sum + (m.like_count || 0), 0) / media.length : 0;
      const avgComments = media.length > 0 ? media.reduce((sum, m) => sum + (m.comments_count || 0), 0) / media.length : 0;
      const engagementRate = (profile.followers_count || 0) > 0
        ? ((avgLikes + avgComments) / (profile.followers_count || 1)) * 100
        : 0;

      const filterResult = applyPreFilters({
        followers_count: profile.followers_count || 0,
        media_count: profile.media_count || 0,
        recent_captions: captions,
        avg_likes: avgLikes,
        avg_comments: avgComments,
        fetched_at: new Date().toISOString(),
        oldest_post_date: media.length > 0 ? media[media.length - 1]?.timestamp : undefined,
      }, settings);

      if (!filterResult.passed) {
        console.log(`Profile @${username} filtered out: ${filterResult.reasons.join(', ')}`);
        // Store a minimal analysis with low scores
        db.prepare(`
          INSERT OR REPLACE INTO analysis_results (profile_id, primary_cluster, relevance_score, authority_score, engagement_rate, tier, content_summary)
          VALUES (?, 'mindset', 0, 0, ?, 'D', ?)
        `).run(profileId, engagementRate, `Filtered: ${filterResult.reasons.join('; ')}`);
        profilesAnalyzed++;
        db.prepare('UPDATE research SET profiles_analyzed = ? WHERE id = ?').run(profilesAnalyzed, researchId);
        continue;
      }

      // 5. AI Analysis
      db.prepare('UPDATE research SET status = ? WHERE id = ?').run('analyzing', researchId);

      const analysis = await analyzeProfile({
        username: profile.username || username,
        full_name: profile.name || '',
        bio: profile.biography || '',
        followers_count: profile.followers_count || 0,
        following_count: profile.follows_count || 0,
        media_count: profile.media_count || 0,
        website: profile.website || '',
        recent_captions: captions,
        avg_likes: avgLikes,
        avg_comments: avgComments,
        engagement_rate: engagementRate,
      });

      // 6. Store analysis
      db.prepare(`
        INSERT OR REPLACE INTO analysis_results (profile_id, primary_cluster, secondary_cluster, relevance_score, authority_score, engagement_rate, monetization_signals, audience_alignment, risk_flags, tier, content_summary)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        profileId,
        analysis.primary_cluster,
        analysis.secondary_cluster,
        analysis.relevance_score,
        analysis.authority_score,
        engagementRate,
        JSON.stringify(analysis.monetization_signals),
        analysis.audience_alignment,
        JSON.stringify(analysis.risk_flags),
        analysis.tier,
        analysis.content_summary
      );

      profilesAnalyzed++;
      db.prepare('UPDATE research SET profiles_analyzed = ? WHERE id = ?').run(profilesAnalyzed, researchId);

    } catch (error) {
      console.error(`Error processing @${username}:`, error);
    }
  }

  // Mark complete
  db.prepare('UPDATE research SET status = ?, completed_at = datetime(\'now\') WHERE id = ?')
    .run('complete', researchId);
}
