import type { FilterSettings } from '@/types';

interface ProfileForFilter {
  followers_count: number;
  media_count: number;
  recent_captions: string[];
  avg_likes: number;
  avg_comments: number;
  fetched_at: string;
  oldest_post_date?: string;
}

interface FilterResult {
  passed: boolean;
  reasons: string[];
}

export function applyPreFilters(profile: ProfileForFilter, settings: FilterSettings): FilterResult {
  const reasons: string[] = [];

  // Follower floor
  if (profile.followers_count < settings.min_followers) {
    reasons.push(`Followers (${profile.followers_count.toLocaleString()}) below minimum ${settings.min_followers.toLocaleString()}`);
  }

  // Engagement rate check
  const engagementRate = profile.followers_count > 0
    ? ((profile.avg_likes + profile.avg_comments) / profile.followers_count) * 100
    : 0;
  if (engagementRate < settings.min_engagement_rate) {
    reasons.push(`Engagement rate (${engagementRate.toFixed(2)}%) below minimum ${settings.min_engagement_rate}%`);
  }

  // English content detection (simple heuristic using ASCII ratio)
  const englishRatio = estimateEnglishContent(profile.recent_captions);
  if (englishRatio < settings.min_english_content) {
    reasons.push(`English content (${englishRatio.toFixed(0)}%) below minimum ${settings.min_english_content}%`);
  }

  // Posting frequency
  const postsPerMonth = estimatePostsPerMonth(profile.media_count, profile.oldest_post_date);
  if (postsPerMonth < settings.min_posts_per_month) {
    reasons.push(`Posts per month (${postsPerMonth.toFixed(1)}) below minimum ${settings.min_posts_per_month}`);
  }

  return {
    passed: reasons.length === 0,
    reasons,
  };
}

function estimateEnglishContent(captions: string[]): number {
  if (captions.length === 0) return 100; // No captions = assume English

  let englishCaptions = 0;
  for (const caption of captions) {
    const cleanText = caption.replace(/[#@\d\s.,!?'"()\-—…:;]/g, '');
    if (cleanText.length === 0) {
      englishCaptions++;
      continue;
    }
    const asciiChars = cleanText.split('').filter(c => c.charCodeAt(0) < 128).length;
    const ratio = asciiChars / cleanText.length;
    if (ratio > 0.7) englishCaptions++;
  }

  return (englishCaptions / captions.length) * 100;
}

function estimatePostsPerMonth(totalPosts: number, oldestPostDate?: string): number {
  if (!oldestPostDate || totalPosts === 0) {
    return totalPosts > 0 ? 2 : 0; // Assume active if has posts
  }

  const oldest = new Date(oldestPostDate);
  const now = new Date();
  const months = Math.max(1, (now.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24 * 30));
  return totalPosts / months;
}

export function getDefaultFilterSettings(): FilterSettings {
  return {
    min_followers: 5000,
    min_engagement_rate: 1.0,
    min_english_content: 60,
    min_posts_per_month: 2,
  };
}
