import { resolve } from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: resolve('.env.local') });

import { getOne, getAll, execute } from '../src/lib/db';
import { analyzeProfile } from '../src/lib/services/ai-analyzer';

/**
 * Mass Re-Analyze Script
 * 
 * Target: Re-runs the AI analysis on already fetched profiles using the existing
 * local database data (profiles + media) without calling the Instagram API.
 * This is used to retroactively apply new Gemini logic (like dynamic_tags or
 * updated tier constraints) to the existing dataset.
 */
async function massReanalyze() {
  console.log('🔄 Starting Mass Re-Analysis of all profiles using new AI logic...');

  // Get all profiles that have already been fetched and exist in our system
  const profiles = await getAll<{
    id: number;
    username: string;
    biography: string;
    followers_count: number;
    follows_count: number;
    media_count: number;
    is_verified: number;
  }>(`
    SELECT id, username, biography, followers_count, follows_count, media_count, is_verified
    FROM profiles
  `);

  if (profiles.length === 0) {
    console.log('✅ No profiles found in the database. Exiting.');
    return;
  }

  console.log(`📊 Found ${profiles.length} profiles to re-analyze.`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    console.log(`\n[${i + 1}/${profiles.length}] Analyzing @${p.username}...`);

    try {
      // Fetch the 25 most recent media items for this profile
      const media = await getAll<{ caption: string; like_count: number; comments_count: number; media_type: string }>(`
        SELECT caption, like_count, comments_count, media_type
        FROM media
        WHERE profile_id = ?
        ORDER BY timestamp DESC
        LIMIT 25
      `, [p.id]);

      let totalLikes = 0;
      let totalComments = 0;
      const postCount = media.length;

      for (const m of media) {
        totalLikes += m.like_count || 0;
        totalComments += m.comments_count || 0;
      }

      // Build the correct ClassifierInput shape
      const captions = media.map(m => m.caption || '').filter(Boolean);
      const avgLikes = postCount > 0 ? Math.round(totalLikes / postCount) : 0;
      const avgComments = postCount > 0 ? Math.round(totalComments / postCount) : 0;

      let engagementRate = 0;
      if (p.followers_count > 0 && postCount > 0) {
        const avgEng = (totalLikes + totalComments) / Math.min(postCount, 25);
        engagementRate = (avgEng / p.followers_count) * 100;
      }

      // Re-fetch full_name and website from profiles table
      const prof = await getOne<{ full_name: string; website: string }>(
        'SELECT full_name, website FROM profiles WHERE id = ?', [p.id]
      );

      const classifierInput = {
        username: p.username,
        full_name: prof?.full_name || '',
        bio: p.biography || '',
        followers_count: p.followers_count || 0,
        following_count: p.follows_count || 0,
        media_count: p.media_count || 0,
        website: prof?.website || '',
        recent_captions: captions,
        avg_likes: avgLikes,
        avg_comments: avgComments,
        engagement_rate: engagementRate,
      };

      // Run AI Analyzer with correct ClassifierInput
      const analysis = await analyzeProfile(classifierInput);

      if (analysis) {
        // First snapshot the old analysis before overwriting
        const currentAnalysis = await getOne<{
          tier: string; relevance_score: number; authority_score: number; audience_alignment: number;
          primary_cluster: string; secondary_cluster: string; monetization_signals: string;
          risk_flags: string; is_approved: number; rejection_reason: string;
          content_style: string; content_summary: string; tier_reason: string; dynamic_tags: string;
        }>('SELECT * FROM analysis_results WHERE profile_id = ?', [p.id]);

        if (currentAnalysis) {
          await execute(`
            INSERT INTO analysis_snapshots (
              profile_id, version,
              tier, relevance_score, authority_score, audience_alignment,
              primary_cluster, secondary_cluster, monetization_signals,
              risk_flags, dynamic_tags, is_approved, rejection_reason,
              content_style, content_summary, tier_reason, snapshot_reason
            ) VALUES (?, (SELECT COALESCE(MAX(version), 0) + 1 FROM analysis_snapshots WHERE profile_id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            p.id, p.id,
            currentAnalysis.tier, currentAnalysis.relevance_score, currentAnalysis.authority_score, currentAnalysis.audience_alignment,
            currentAnalysis.primary_cluster, currentAnalysis.secondary_cluster, currentAnalysis.monetization_signals,
            currentAnalysis.risk_flags, currentAnalysis.dynamic_tags || '[]', currentAnalysis.is_approved, currentAnalysis.rejection_reason,
            currentAnalysis.content_style, currentAnalysis.content_summary, currentAnalysis.tier_reason,
            'Mass script re-analysis snapshot'
          ]);
        }

        // Upsert new analysis
        await execute(
          `INSERT INTO analysis_results (
            profile_id, primary_cluster, secondary_cluster, relevance_score, 
            authority_score, engagement_rate, monetization_signals, risk_flags, dynamic_tags,
            audience_alignment, content_style, tier, tier_reason, content_summary,
            avg_likes, avg_comments, analyzed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
             content_style = excluded.content_style,
             tier = excluded.tier,
             tier_reason = excluded.tier_reason,
             content_summary = excluded.content_summary,
             avg_likes = excluded.avg_likes,
             avg_comments = excluded.avg_comments,
             analyzed_at = excluded.analyzed_at`,
          [
            p.id, analysis.primary_cluster, analysis.secondary_cluster || null,
            analysis.relevance_score || 0, analysis.authority_score || 0,
            engagementRate, JSON.stringify(analysis.monetization_signals || []),
            JSON.stringify(analysis.risk_flags || []), JSON.stringify(analysis.dynamic_tags || []),
            analysis.audience_alignment || 0, analysis.content_style || 'Mixed',
            analysis.tier || 'D', analysis.tier_reason || '', analysis.content_summary || '',
            avgLikes, avgComments
          ]
        );

        // Update unified leads table status if this profile corresponds to a lead
        await execute("UPDATE leads SET fetch_status = 'fetched', updated_at = datetime('now') WHERE profile_id = ?", [p.id]);

        successCount++;
        console.log(`  ✅ Success: @${p.username} -> Tier ${analysis.tier}`);
      } else {
        failCount++;
        console.log(`  ⚠️ AI returned null representation for @${p.username}`);
      }

    } catch (error: unknown) {
      const e = error as Error;
      failCount++;
      console.error(`  ❌ Error processing @${p.username}:`, e.message);
    }
  }

  console.log('\n🏁 Mass Re-Analysis Complete!');
  console.log(`Total  : ${profiles.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Failed : ${failCount}`);
}

massReanalyze().catch(console.error);
