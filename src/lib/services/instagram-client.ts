import { fetchProfileFromRapidAPI } from './rapidapi-client';

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
  // Token rotation: try primary, then secondary
  const tokens = [
    process.env.INSTAGRAM_ACCESS_TOKEN,
    process.env.INSTAGRAM_ACCESS_TOKEN_2,
  ].filter(Boolean) as string[];
  const accountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  
  if (tokens.length === 0 || !accountId) {
    throw new Error('Instagram API credentials not configured. Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_BUSINESS_ACCOUNT_ID in .env.local');
  }

  // Try each token
  for (const token of tokens) {

    // Debug: show which token is loaded
    const tokenPreview = `${token.substring(0, 10)}...${token.substring(token.length - 10)}`;
    console.log(`[Instagram] 🔑 Trying token: ${tokenPreview} (len=${token.length})`);

    const result = await rateLimiter.add(async () => {
    const profileFields = 'username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website';
    const mediaFields = 'id,media_type,caption,like_count,comments_count,timestamp,permalink';

    // Correct format per Meta docs: business_discovery.username(TARGET){field1,field2,...}
    const url = `${GRAPH_API_BASE}/${accountId}?fields=business_discovery.username(${encodeURIComponent(username)}){${profileFields},media.limit(25){${mediaFields}}}&access_token=${token}`;
    
    console.log(`[Instagram] Fetching @${username}...`);
    try {
      const response = await fetchWithRetry(url);
      const data = await response.json();

      if ((data as GraphApiError).error) {
        const error = data as GraphApiError;
        console.error(`[Instagram] API error for @${username}: [${error.error.code}] ${error.error.message}`);
        
        // Token expired/invalid — signal to try next token
        if (error.error.code === 190 || error.error.message.includes('Session has expired') || error.error.message.includes('Error validating access token')) {
          console.log(`[Instagram] ⚠️ Token expired/invalid, will try next token...`);
          return 'TOKEN_EXPIRED' as unknown as null; // sentinel value
        }
        
        if (error.error.code === 17 || error.error.code === 110 || error.error.code === 4 || error.error.code === 32 || error.error.type === 'OAuthException') {
          // Meta API failed for valid reason, fallback to RapidAPI
          console.log(`[Instagram] Fallback triggered for @${username} due to API error.`);
          const fallbackData = await fetchProfileFromRapidAPI(username);
          if (fallbackData) return fallbackData;
        }
        if (error.error.code === 17 || error.error.code === 110) {
          return null;
        }
        throw new Error(error.error.message);
      }

      const result = data as GraphApiSearchResult;
      const discovery = result.business_discovery;
      
      if (!discovery) {
        console.log(`[Instagram] No business_discovery for @${username}, fallback to RapidAPI.`);
        const fallbackData = await fetchProfileFromRapidAPI(username);
        return fallbackData || null;
      }

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
    } catch (err: unknown) {
      const error = err as Error;
      console.error(`[Instagram] ⚠️ fetchWithRetry failed for @${username}: ${error.message}. Will try next token...`);
      return 'TOKEN_EXPIRED' as unknown as null; // signal to try next token
    }
    });

    // If this token worked (didn't return sentinel), use the result
    if (result !== ('TOKEN_EXPIRED' as unknown)) {
      return result;
    }
    console.log(`[Instagram] Token failed, trying next...`);
  }

  // All tokens exhausted, try RapidAPI as final fallback
  console.log(`[Instagram] All tokens exhausted for @${username}. Final fallback to RapidAPI...`);
  const fallbackData = await fetchProfileFromRapidAPI(username);
  if (fallbackData) return fallbackData;
  
  // RapidAPI also failed — return null (unfetchable) instead of throwing expired token error
  return null;
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
