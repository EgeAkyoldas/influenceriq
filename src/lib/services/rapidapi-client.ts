import { GraphApiProfile, GraphApiMedia } from './instagram-client';

const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'instagram-scraper-stable-api.p.rapidapi.com';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    console.log(`[RapidAPI] Fetching @${username} via Fallback (instagram-scraper-stable-api)...`);
    
    // Using the user info endpoint from the scraper
    const url = `https://${RAPIDAPI_HOST}/v1/users/info?username=${encodeURIComponent(username)}`;
    
    let response;
    const retries = 3;
    
    for (let i = 0; i < retries; i++) {
        response = await fetch(url, {
        method: 'GET',
        headers: {
            'x-rapidapi-key': token,
            'x-rapidapi-host': RAPIDAPI_HOST
        }
        });

        if (response.status === 429) {
            const waitTime = Math.pow(2, i + 1) * 10000; // 20s, 40s, 80s
            console.log(`[RapidAPI] ⏳ HTTP 429 rate limited. Waiting ${waitTime / 1000}s before retry ${i + 1}/${retries}`);
            await sleep(waitTime);
            continue;
        }
        break;
    }

    if (!response || !response.ok) {
      if (response?.status === 429) {
        throw new Error('RapidAPI Rate Limit Exceeded after retries');
      }
      throw new Error(`RapidAPI Error: ${response?.status} ${response?.statusText}`);
    }

    const data = await response.json();
    
    // The structure often returned by this specific API is under 'data'
    const userData = data?.data || data;
    
    if (!userData || !userData.id) {
      console.warn(`[RapidAPI] ⚠️ Could not parse user data for @${username}. Keys found:`, Object.keys(data));
      return null;
    }

    // Adapt to different possible scraper formats for standard profile info
    const profile: GraphApiProfile = {
      id: userData.id?.toString() || '',
      username: userData.username || username,
      name: userData.full_name || userData.name || '',
      biography: userData.biography || '',
      followers_count: userData.follower_count || userData.edge_followed_by?.count || 0,
      follows_count: userData.following_count || userData.edge_follow?.count || 0,
      media_count: userData.media_count || userData.edge_owner_to_timeline_media?.count || 0,
      profile_picture_url: userData.profile_pic_url_hd || userData.profile_pic_url || '',
      website: userData.external_url || '',
      is_verified: userData.is_verified || false,
    };

    // Attempt to grab media if it's included in the info response (some scrapers do this)
    const media: GraphApiMedia[] = [];
    const mediaNodes = userData.edge_owner_to_timeline_media?.edges || [];
    
    for (const edge of mediaNodes) {
      const node = edge.node;
      if (!node) continue;
      
      media.push({
        id: node.id,
        media_type: node.is_video ? 'VIDEO' : 'IMAGE',
        caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
        like_count: node.edge_media_preview_like?.count || 0,
        comments_count: node.edge_media_to_comment?.count || 0,
        timestamp: new Date((node.taken_at_timestamp || 0) * 1000).toISOString(),
        permalink: node.shortcode ? `https://instagram.com/p/${node.shortcode}/` : undefined
      });
    }

    // If media wasn't in the info response, we might need to make a second request to /v1/users/posts
    // But for the fallback, just the profile might be acceptable enough to continue the flow.
    // Let's also fetch posts if media is empty, since we are falling back and the caller expects media.
    if (media.length === 0) {
      try {
        const postsUrl = `https://${RAPIDAPI_HOST}/v1/users/posts?username=${encodeURIComponent(username)}`;
        let postsResponse;
        const postRetries = 2;
        
        for (let i = 0; i < postRetries; i++) {
            postsResponse = await fetch(postsUrl, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': token,
                'x-rapidapi-host': RAPIDAPI_HOST
            }
            });
            
            if (postsResponse.status === 429) {
                const waitTime = Math.pow(2, i + 1) * 10000;
                console.log(`[RapidAPI] ⏳ HTTP 429 on posts. Waiting ${waitTime / 1000}s before retry ${i + 1}/${postRetries}`);
                await sleep(waitTime);
                continue;
            }
            break;
        }
        
        if (postsResponse && postsResponse.ok) {
          const postsData = await postsResponse.json();
          const items = postsData?.data?.items || postsData?.items || [];
          
          for (const item of items) {
            media.push({
              id: item.id || item.pk,
              media_type: item.media_type === 2 ? 'VIDEO' : (item.media_type === 8 ? 'CAROUSEL_ALBUM' : 'IMAGE'),
              caption: item.caption?.text || '',
              like_count: item.like_count || 0,
              comments_count: item.comment_count || 0,
              timestamp: item.taken_at ? new Date(item.taken_at * 1000).toISOString() : new Date().toISOString(),
              permalink: item.code ? `https://instagram.com/p/${item.code}/` : undefined
            });
            if (media.length >= 25) break; // match graph API limit
          }
        }
      } catch (err) {
        console.warn(`[RapidAPI] ⚠️ Failed to fetch posts for @${username}`, err);
      }
    }

    console.log(`[RapidAPI] ✅ Successfully fetched fallback data for @${username}`);
    return { profile, media };

  } catch (err: unknown) {
    const error = err as Error;
    console.error(`[RapidAPI] ❌ Fetch Error for @${username}:`, error.message);
    return null;
  }
}
