import { NextRequest, NextResponse } from 'next/server';
import { getAll, execute } from '@/lib/db';

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

/**
 * POST /api/profiles/refresh-avatars
 * 
 * Batch-refreshes profile_pic_url for all profiles by querying
 * Instagram Graph API (business_discovery). Uses token rotation
 * across multiple access tokens for resilience.
 * 
 * Body (optional): { batchSize?: number }
 */
export async function POST(req: NextRequest) {
  const tokens = [
    process.env.INSTAGRAM_ACCESS_TOKEN,
    process.env.INSTAGRAM_ACCESS_TOKEN_2,
  ].filter(Boolean) as string[];

  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;

  if (tokens.length === 0 || !accountId) {
    return NextResponse.json(
      { error: 'Instagram API credentials not configured' },
      { status: 500 }
    );
  }

  let batchSize = 50;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.batchSize && typeof body.batchSize === 'number') {
      batchSize = Math.min(body.batchSize, 200);
    }
  } catch { /* use default */ }

  try {
    // Get all profiles that have a username
    const profiles = await getAll<{
      id: number;
      username: string;
      profile_pic_url: string;
    }>(`SELECT id, username, profile_pic_url FROM profiles ORDER BY id LIMIT ?`, [batchSize]);

    if (profiles.length === 0) {
      return NextResponse.json({ message: 'No profiles to refresh', updated: 0 });
    }

    let updated = 0;
    let failed = 0;
    let tokenIndex = 0;
    const errors: { username: string; error: string }[] = [];

    for (const profile of profiles) {
      const token = tokens[tokenIndex % tokens.length];

      try {
        // Use business_discovery to get profile_picture_url
        const url = `${GRAPH_API_BASE}/${accountId}?fields=business_discovery.username(${encodeURIComponent(profile.username)}){profile_picture_url}&access_token=${token}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data?.error) {
          // Rotate token on rate limit
          if (data.error.code === 4 || data.error.code === 17 || response.status === 429) {
            tokenIndex++;
            // Retry with next token
            if (tokens.length > 1) {
              const retryToken = tokens[tokenIndex % tokens.length];
              const retryUrl = `${GRAPH_API_BASE}/${accountId}?fields=business_discovery.username(${encodeURIComponent(profile.username)}){profile_picture_url}&access_token=${retryToken}`;
              const retryResponse = await fetch(retryUrl);
              const retryData = await retryResponse.json();

              if (retryData?.business_discovery?.profile_picture_url) {
                await execute(
                  `UPDATE profiles SET profile_pic_url = ? WHERE id = ?`,
                  [retryData.business_discovery.profile_picture_url, profile.id]
                );
                updated++;
                continue;
              }
            }
          }

          errors.push({ username: profile.username, error: data.error.message });
          failed++;
          continue;
        }

        const newPicUrl = data?.business_discovery?.profile_picture_url;
        if (newPicUrl) {
          await execute(
            `UPDATE profiles SET profile_pic_url = ? WHERE id = ?`,
            [newPicUrl, profile.id]
          );
          updated++;
        } else {
          failed++;
          errors.push({ username: profile.username, error: 'No profile_picture_url in response' });
        }

        // Small delay to respect rate limits (200ms between requests)
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        const error = err as Error;
        errors.push({ username: profile.username, error: error.message });
        failed++;
      }
    }

    return NextResponse.json({
      message: `Avatar refresh complete`,
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
