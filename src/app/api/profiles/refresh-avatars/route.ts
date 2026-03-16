import { NextRequest, NextResponse } from 'next/server';
import { getAll, execute } from '@/lib/db';
import { fetchProfileFromRapidAPI } from '@/lib/services/rapidapi-client';

/**
 * POST /api/profiles/refresh-avatars
 * 
 * Batch-refreshes profile information (including hd_profile_pic_url, followers, 
 * bio, etc) for all profiles by querying RapidAPI Instagram Scraper Stable API.
 * 
 * Body (optional): { batchSize?: number }
 */
export async function POST(req: NextRequest) {
  if (!process.env.RAPIDAPI_KEY) {
    return NextResponse.json(
      { error: 'RapidAPI credentials not configured' },
      { status: 500 }
    );
  }

  let batchSize = 10; // Keeping batch size smaller due to RapidAPI rate limits
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.batchSize && typeof body.batchSize === 'number') {
      batchSize = Math.min(body.batchSize, 50);
    }
  } catch { /* use default */ }

  try {
    // We prioritize profiles that haven't been fetched recently or have missing pics
    // But for a global refresh we can just order by least recently updated
    const profiles = await getAll<{
      id: number;
      username: string;
      profile_pic_url: string;
    }>(`SELECT id, username, profile_pic_url FROM profiles ORDER BY fetched_at ASC NULLS FIRST LIMIT ?`, [batchSize]);

    if (profiles.length === 0) {
      return NextResponse.json({ message: 'No profiles to refresh', updated: 0 });
    }

    let updated = 0;
    let failed = 0;
    const errors: { username: string; error: string }[] = [];

    for (const profile of profiles) {
      try {
        const result = await fetchProfileFromRapidAPI(profile.username);

        if (!result || !result.profile) {
          failed++;
          errors.push({ username: profile.username, error: 'User not found or parsing failed' });
          continue;
        }

        const p = result.profile;
        const newPicUrl = p.profile_picture_url;
        
        if (newPicUrl) {
          await execute(
            `UPDATE profiles SET 
              profile_pic_url = ?,
              followers_count = ?,
              following_count = ?,
              media_count = ?,
              bio = ?,
              full_name = ?,
              is_verified = ?,
              fetched_at = datetime('now')
             WHERE id = ?`,
            [
              newPicUrl, 
              p.followers_count || 0, 
              p.follows_count || 0, 
              p.media_count || 0, 
              p.biography || '', 
              p.name || '', 
              p.is_verified ? 1 : 0,
              profile.id
            ]
          );
          
          // Optionally, also store latest media if we want to refresh those
          if (result.media && result.media.length > 0) {
            for (const m of result.media) {
              await execute(
                `INSERT OR IGNORE INTO media (profile_id, instagram_media_id, media_type, caption, like_count, comments_count, timestamp, permalink)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [profile.id, m.id, m.media_type || 'IMAGE', m.caption || '', m.like_count || 0, m.comments_count || 0, m.timestamp || '', m.permalink || '']
              );
            }
          }

          updated++;
        } else {
          failed++;
          errors.push({ username: profile.username, error: 'No profile_picture_url in RapidAPI response' });
        }

        // Small delay to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        const error = err as Error;
        errors.push({ username: profile.username, error: error.message });
        failed++;
      }
    }

    return NextResponse.json({
      message: `Profile data & Avatar refresh complete`,
      total: profiles.length,
      updated,
      failed,
      errors: errors.slice(0, 10), // return first 10 errors max
    });
  } catch (error) {
    console.error('Avatar refresh error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh avatars' },
      { status: 500 }
    );
  }
}
