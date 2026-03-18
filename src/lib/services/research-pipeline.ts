import { execute, getOne, getAll } from '@/lib/db';
import { fetchProfileByUsername } from './instagram-client';
import { analyzeProfile, type EditorExample } from './ai-analyzer';
import { applyPreFilters } from './pre-filter';
import type { FilterSettings, Research } from '@/types';

// Helper: compute average stats from media
export function computeMediaStats(media: Array<{ like_count?: number; comments_count?: number; timestamp?: string }>) {
  const avgLikes = media.length > 0 ? media.reduce((sum, m) => sum + (m.like_count || 0), 0) / media.length : 0;
  const avgComments = media.length > 0 ? media.reduce((sum, m) => sum + (m.comments_count || 0), 0) / media.length : 0;
  const oldestPostDate = media.length > 0 ? media[media.length - 1]?.timestamp : undefined;
  return { avgLikes, avgComments, oldestPostDate };
}

export async function runResearchPipeline(researchId: number): Promise<void> {
  const research = await getOne<Research>('SELECT * FROM research WHERE id = ?', [researchId]);
  if (!research) throw new Error(`Research ${researchId} not found`);

  const filterRow = await getAll<{ key: string; value: string }>(
    'SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?)',
    ['min_followers', 'min_engagement_rate', 'min_english_content', 'min_posts_per_month']
  );

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
    await execute('UPDATE research SET status = ?, error_message = ? WHERE id = ?', ['failed', 'No valid usernames found in seed data', researchId]);
    return;
  }

  // Load recent editor decisions for AI few-shot learning (same as reverify)
  const editorExamples = await getAll<EditorExample>(`
    SELECT username, previous_tier, new_tier, editor_reason, editor_note
    FROM editor_decision_logs
    ORDER BY created_at DESC LIMIT 10
  `);

  // Update status to fetching
  await execute('UPDATE research SET status = ? WHERE id = ?', ['fetching', researchId]);

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

      // 2. Store profile — use ON CONFLICT DO UPDATE to preserve profile id (not INSERT OR REPLACE)
      const { profile, media } = result;
      const profileResult = await execute(`
        INSERT INTO profiles (instagram_id, username, full_name, bio, followers_count, following_count, media_count, profile_pic_url, website, is_verified, research_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(instagram_id) DO UPDATE SET
          username = excluded.username,
          full_name = excluded.full_name,
          bio = excluded.bio,
          followers_count = excluded.followers_count,
          following_count = excluded.following_count,
          media_count = excluded.media_count,
          profile_pic_url = excluded.profile_pic_url,
          website = excluded.website,
          is_verified = excluded.is_verified,
          fetched_at = datetime('now')
      `, [
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
      ]);

      // Resolve profile id — ON CONFLICT UPDATE doesn't return a rowid, so fall back to SELECT
      let profileId = Number(profileResult.lastInsertRowid);
      if (!profileId) {
        const existing = await getOne<{ id: number }>('SELECT id FROM profiles WHERE instagram_id = ?', [profile.id]);
        profileId = existing?.id ?? 0;
      }
      if (!profileId) {
        console.error(`Could not resolve profile id for @${username}, skipping`);
        continue;
      }

      profilesFetched++;

      // 3. Store media
      for (const m of media) {
        await execute(`
          INSERT OR IGNORE INTO media (profile_id, instagram_media_id, media_type, caption, like_count, comments_count, timestamp, permalink)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          profileId,
          m.id,
          m.media_type || 'IMAGE',
          m.caption || '',
          m.like_count || 0,
          m.comments_count || 0,
          m.timestamp || '',
          m.permalink || ''
        ]);
      }

      // Update count
      await execute('UPDATE research SET profiles_found = ? WHERE id = ?', [profilesFetched, researchId]);

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
        const filterReason = `Filtered: ${filterResult.reasons.join('; ')}`;
        await execute(`
          INSERT INTO analysis_results
            (profile_id, primary_cluster, secondary_cluster, relevance_score, authority_score,
             engagement_rate, monetization_signals, risk_flags, dynamic_tags, audience_alignment,
             tier, tier_reason, content_summary, content_style, is_approved, rejection_reason)
          VALUES (?, 'mindset', NULL, 0, 0, ?, '[]', '[]', '[]', 0, 'D', ?, ?, 'Mixed', 0, ?)
          ON CONFLICT(profile_id) DO UPDATE SET
            tier = 'D',
            tier_reason = excluded.tier_reason,
            content_summary = excluded.content_summary,
            rejection_reason = excluded.rejection_reason,
            is_approved = 0,
            analyzed_at = datetime('now')
        `, [profileId, engagementRate, filterReason, filterReason, filterReason]);

        await execute(`
          INSERT INTO verified_profiles (profile_id, tier, is_approved, rejection_reason, verified_at)
          VALUES (?, 'D', 0, ?, datetime('now'))
          ON CONFLICT(profile_id) DO UPDATE SET
            tier = 'D', is_approved = 0,
            rejection_reason = excluded.rejection_reason,
            verified_at = datetime('now')
        `, [profileId, filterReason]);

        profilesAnalyzed++;
        await execute('UPDATE research SET profiles_analyzed = ? WHERE id = ?', [profilesAnalyzed, researchId]);
        continue;
      }

      // 5. AI Analysis — include editorExamples for calibration (same as reverify)
      await execute('UPDATE research SET status = ? WHERE id = ?', ['analyzing', researchId]);

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
        editorExamples: editorExamples.length > 0 ? editorExamples.slice(0, 5) : undefined,
      });

      // 6. Store analysis — full field set including risk_flags and dynamic_tags
      await execute(`
        INSERT INTO analysis_results
          (profile_id, primary_cluster, secondary_cluster, relevance_score, authority_score,
           engagement_rate, monetization_signals, risk_flags, dynamic_tags, audience_alignment,
           tier, tier_reason, content_summary, content_style, is_approved, rejection_reason)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(profile_id) DO UPDATE SET
          primary_cluster = excluded.primary_cluster,
          secondary_cluster = excluded.secondary_cluster,
          relevance_score = excluded.relevance_score,
          authority_score = excluded.authority_score,
          engagement_rate = excluded.engagement_rate,
          monetization_signals = excluded.monetization_signals,
          risk_flags = excluded.risk_flags,
          dynamic_tags = excluded.dynamic_tags,
          audience_alignment = excluded.audience_alignment,
          tier = excluded.tier,
          tier_reason = excluded.tier_reason,
          content_summary = excluded.content_summary,
          content_style = excluded.content_style,
          is_approved = excluded.is_approved,
          rejection_reason = excluded.rejection_reason,
          analyzed_at = datetime('now')
      `, [
        profileId,
        analysis.primary_cluster,
        analysis.secondary_cluster ?? null,
        analysis.relevance_score,
        analysis.authority_score,
        engagementRate,
        JSON.stringify(analysis.monetization_signals || []),
        JSON.stringify(analysis.risk_flags || []),
        JSON.stringify(analysis.dynamic_tags || []),
        analysis.audience_alignment,
        analysis.tier,
        analysis.tier_reason,
        analysis.content_summary,
        analysis.content_style,
        analysis.is_approved ? 1 : 0,
        analysis.rejection_reason ?? null
      ]);

      // 7. Update verified_profiles (same as batch)
      await execute(`
        INSERT INTO verified_profiles (profile_id, tier, is_approved, rejection_reason, verified_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(profile_id) DO UPDATE SET
          tier = excluded.tier,
          is_approved = excluded.is_approved,
          rejection_reason = excluded.rejection_reason,
          verified_at = datetime('now')
      `, [profileId, analysis.tier, analysis.is_approved ? 1 : 0, analysis.rejection_reason ?? null]);

      profilesAnalyzed++;
      await execute('UPDATE research SET profiles_analyzed = ? WHERE id = ?', [profilesAnalyzed, researchId]);

    } catch (error) {
      console.error(`Error processing @${username}:`, error);
    }
  }

  // Mark complete
  await execute("UPDATE research SET status = ?, completed_at = datetime('now') WHERE id = ?", ['complete', researchId]);
}
