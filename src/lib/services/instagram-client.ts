const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

interface GraphApiError {
  error: {
    message: string;
    type: string;
    code: number;
  };
}

interface GraphApiProfile {
  id: string;
  username?: string;
  name?: string;
  biography?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  profile_picture_url?: string;
  website?: string;
  is_verified?: boolean;
}

interface GraphApiMedia {
  id: string;
  media_type?: string;
  caption?: string;
  like_count?: number;
  comments_count?: number;
  timestamp?: string;
  permalink?: string;
}

interface GraphApiMediaResponse {
  data: GraphApiMedia[];
  paging?: {
    cursors: { before: string; after: string };
    next?: string;
  };
}

interface GraphApiSearchResult {
  business_discovery?: GraphApiProfile & {
    media?: GraphApiMediaResponse;
  };
}

class RateLimiter {
  private queue: Array<() => Promise<unknown>> = [];
  private processing = false;
  private lastRequestTime = 0;
  private minInterval = 5000; // 5s between requests (~12/min, safe for Meta limits)

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      if (elapsed < this.minInterval) {
        await new Promise(resolve => setTimeout(resolve, this.minInterval - elapsed));
      }
      const fn = this.queue.shift();
      if (fn) {
        this.lastRequestTime = Date.now();
        await fn();
      }
    }

    this.processing = false;
  }
}

const rateLimiter = new RateLimiter();

async function fetchWithRetry(url: string, retries = 4): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const response = await fetch(url);
    
    // Handle HTTP 429
    if (response.status === 429) {
      const waitTime = Math.pow(2, i + 1) * 30000; // 60s, 120s, 240s, 480s
      console.log(`[Instagram] ⏳ HTTP 429 rate limited. Waiting ${waitTime / 1000}s before retry ${i + 1}/${retries}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }
    
    // Check for Graph API error code 4 (application rate limit)
    const cloned = response.clone();
    try {
      const data = await cloned.json();
      if (data?.error?.code === 4) {
        const waitTime = Math.pow(2, i + 1) * 30000; // 60s, 120s, 240s, 480s
        console.log(`[Instagram] ⏳ API rate limit (#4). Waiting ${waitTime / 1000}s before retry ${i + 1}/${retries}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
    } catch { /* not JSON, continue */ }
    
    return response;
  }
  throw new Error('Rate limit: Max retries exceeded. Try again later.');
}

export async function fetchProfileByUsername(username: string): Promise<{
  profile: GraphApiProfile;
  media: GraphApiMedia[];
} | null> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  
  if (!token || !accountId) {
    throw new Error('Instagram API credentials not configured. Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID in .env.local');
  }

  // Debug: show which token is loaded
  const tokenPreview = `${token.substring(0, 10)}...${token.substring(token.length - 10)}`;
  console.log(`[Instagram] 🔑 Token: ${tokenPreview} (len=${token.length})`);

  return rateLimiter.add(async () => {
    const profileFields = 'username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website';
    const mediaFields = 'id,media_type,caption,like_count,comments_count,timestamp,permalink';

    // Correct format per Meta docs: business_discovery.username(TARGET){field1,field2,...}
    const url = `${GRAPH_API_BASE}/${accountId}?fields=business_discovery.username(${encodeURIComponent(username)}){${profileFields},media.limit(25){${mediaFields}}}&access_token=${token}`;
    
    console.log(`[Instagram] Fetching @${username}...`);
    const response = await fetchWithRetry(url);
    const data = await response.json();

    if ((data as GraphApiError).error) {
      const error = data as GraphApiError;
      console.error(`[Instagram] API error for @${username}: [${error.error.code}] ${error.error.message}`);
      if (error.error.code === 17 || error.error.code === 110) {
        // User not found or invalid user
        return null;
      }
      throw new Error(error.error.message);
    }

    const result = data as GraphApiSearchResult;
    const discovery = result.business_discovery;
    if (!discovery) return null;

    const profile: GraphApiProfile = {
      id: discovery.id,
      username: discovery.username,
      name: discovery.name,
      biography: discovery.biography,
      followers_count: discovery.followers_count,
      follows_count: discovery.follows_count,
      media_count: discovery.media_count,
      profile_picture_url: discovery.profile_picture_url,
      website: discovery.website,
      is_verified: discovery.is_verified,
    };

    const media: GraphApiMedia[] = discovery.media?.data || [];

    return { profile, media };
  });
}

export async function fetchProfileById(userId: string): Promise<GraphApiProfile | null> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) throw new Error('Instagram API credentials not configured');

  return rateLimiter.add(async () => {
    const fields = 'id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website';
    const url = `${GRAPH_API_BASE}/${userId}?fields=${fields}&access_token=${token}`;
    
    const response = await fetchWithRetry(url);
    const data = await response.json();

    if ((data as GraphApiError).error) {
      return null;
    }

    return data as GraphApiProfile;
  });
}

export type { GraphApiProfile, GraphApiMedia, GraphApiMediaResponse };
