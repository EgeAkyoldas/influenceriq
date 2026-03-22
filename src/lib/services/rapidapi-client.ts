import { GraphApiProfile, GraphApiMedia } from './instagram-client';
import { execute } from '@/lib/db';

const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'instagram-scraper-stable-api.p.rapidapi.com';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadAndStoreAvatar(url: string, username: string): Promise<string> {
  if (!url) return '';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.statusText}`);
    
    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    
    await execute(
      `UPDATE profiles SET avatar_data = ? WHERE username = ?`,
      [base64, username]
    );
    
    return `/api/avatars/${username}`;
  } catch (error) {
    console.error(`[RapidAPI] ⚠️ Failed to download avatar for @${username}`, error);
    return url;
  }
}

// Fetch profile info from RapidAPI with retries
async function fetchRapidAPIProfile(username: string, token: string) {
  const profileUrl = `https://${RAPIDAPI_HOST}/ig_get_fb_profile_hover.php?username_or_url=${encodeURIComponent(username)}`;
  const retries = 2;
  
  for (let i = 0; i < retries; i++) {
    const response = await fetch(profileUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': token,
        'x-rapidapi-host': RAPIDAPI_HOST
      }
    });

    if (response.status === 429) {
      const waitTime = Math.pow(2, i) * 10000; // 10s, 20s
      console.log(`[RapidAPI] ⏳ HTTP 429 (Profile). Waiting ${waitTime / 1000}s before retry ${i + 1}/${retries}`);
      await sleep(waitTime);
      continue;
    }

    if (!response.ok) {
      if (response.status === 429) throw new Error('RapidAPI Rate Limit Exceeded after retries (Profile)');
      throw new Error(`RapidAPI Error (Profile): ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
  throw new Error('RapidAPI Rate Limit Exceeded after retries (Profile)');
}

// Fetch posts from RapidAPI with retries
async function fetchRapidAPIPosts(username: string, token: string): Promise<GraphApiMedia[]> {
  const postsUrl = `https://${RAPIDAPI_HOST}/get_ig_user_posts.php`;
  const retries = 2;
  const media: GraphApiMedia[] = [];

  for (let i = 0; i < retries; i++) {
    const response = await fetch(postsUrl, {
      method: 'POST',
      headers: {
        'x-rapidapi-key': token,
        'x-rapidapi-host': RAPIDAPI_HOST,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `username_or_url=${encodeURIComponent(username)}`
    });
    
    if (response.status === 429) {
      const waitTime = Math.pow(2, i) * 10000; // 10s, 20s
      console.log(`[RapidAPI] ⏳ HTTP 429 (Posts). Waiting ${waitTime / 1000}s before retry ${i + 1}/${retries}`);
      await sleep(waitTime);
      continue;
    }

    if (response.ok) {
      const postsData = await response.json();
      const items = postsData?.posts || [];
      
      for (const item of items) {
        const node = item.node || item;
        if (!node || !node.id) continue;
        
        media.push({
          id: node.id || node.pk,
          media_type: node.media_type === 2 ? 'VIDEO' : (node.media_type === 8 ? 'CAROUSEL_ALBUM' : 'IMAGE'),
          caption: node.accessibility_caption || node.caption?.text || node.caption || '',
          like_count: node.like_count || 0,
          comments_count: node.comment_count || node.comments_count || 0,
          timestamp: node.taken_at ? new Date(node.taken_at * 1000).toISOString() : new Date().toISOString(),
          permalink: node.code ? `https://instagram.com/p/${node.code}/` : undefined
        });
        if (media.length >= 25) break;
      }
    }
    break;
  }

  return media;
}

export async function fetchProfileFromRapidAPI(username: string): Promise<{
  profile: GraphApiProfile;
  media: GraphApiMedia[];
} | null> {
  const token = process.env.RAPIDAPI_KEY;
  if (!token) {
    console.warn('[RapidAPI] ⚠️ No RAPIDAPI_KEY found in environment');
    return null;
  }

  try {
    console.log(`[RapidAPI] Fetching profile @${username} (parallel profile+posts)...`);
    
    // Fetch profile and posts in PARALLEL (saves ~1-2s per profile)
    const [rawData, media] = await Promise.all([
      fetchRapidAPIProfile(username, token),
      fetchRapidAPIPosts(username, token),
    ]);

    const userData = rawData?.user_data;
    
    if (!userData || !userData.id) {
      console.warn(`[RapidAPI] ⚠️ Could not parse user data for @${username}.`);
      return null;
    }

    const originalPicUrl = userData.hd_profile_pic_url_info?.url || userData.profile_pic_url || '';
    const localPicUrl = await downloadAndStoreAvatar(originalPicUrl, username);

    const profile: GraphApiProfile = {
      id: userData.id?.toString() || '',
      username: userData.username || username,
      name: userData.full_name || '',
      biography: userData.biography || '',
      followers_count: userData.follower_count || 0,
      follows_count: userData.following_count || 0,
      media_count: userData.media_count || 0,
      profile_picture_url: localPicUrl,
      website: userData.external_url || '',
      is_verified: userData.is_verified || false,
    };

    console.log(`[RapidAPI] ✅ Fetched @${username} (${media.length} posts)`);
    return { profile, media };

  } catch (err: unknown) {
    const error = err as Error;
    console.error(`[RapidAPI] ❌ Fetch Error for @${username}:`, error.message);
    return null;
  }
}
