export type NicheCluster = 'dating' | 'mindset' | 'relationships' | 'masculinity';
export type Tier = 'S' | 'A' | 'B' | 'C' | 'D';
export type AnalysisStatus = 'pending' | 'fetching' | 'analyzing' | 'complete' | 'failed';
export type SeedType = 'username' | 'hashtag' | 'csv';

export interface Profile {
  id: number;
  instagram_id: string;
  username: string;
  full_name: string;
  bio: string;
  followers_count: number;
  following_count: number;
  media_count: number;
  profile_pic_url: string;
  website: string;
  is_verified: boolean;
  fetched_at: string;
  research_id: number;
}

export interface AnalysisResult {
  id: number;
  profile_id: number;
  primary_cluster: NicheCluster;
  secondary_cluster: NicheCluster | null;
  relevance_score: number;
  authority_score: number;
  engagement_rate: number;
  monetization_signals: string[];
  audience_alignment: number;
  content_style: string;
  tier: Tier;
  content_summary: string;
  analyzed_at: string;
}

export interface MediaItem {
  id: number;
  profile_id: number;
  instagram_media_id: string;
  media_type: string;
  caption: string;
  like_count: number;
  comments_count: number;
  timestamp: string;
  permalink: string;
}

export interface Research {
  id: number;
  seed_type: SeedType;
  seed_value: string;
  status: AnalysisStatus;
  profiles_found: number;
  profiles_analyzed: number;
  created_at: string;
  completed_at: string | null;
}

export interface Report {
  id: number;
  title: string;
  research_id: number;
  report_type: 'leaderboard' | 'cluster_distribution' | 'full_analysis';
  data: Record<string, unknown>;
  created_at: string;
}

export interface FilterSettings {
  min_followers: number;
  min_engagement_rate: number;
  min_english_content: number;
  min_posts_per_month: number;
}

export interface ProfileWithAnalysis extends Profile {
  analysis: AnalysisResult | null;
}

export interface CandidateRow {
  id: number;
  username: string;
  full_name: string;
  profile_pic_url: string;
  followers_count: number;
  primary_cluster: NicheCluster | null;
  authority_score: number | null;
  engagement_rate: number | null;
  tier: Tier | null;
  status: AnalysisStatus;
  monetization_signals: string[];
}

export interface ClusterDistribution {
  cluster: NicheCluster;
  count: number;
  percentage: number;
  avg_authority: number;
}

export interface AuthPayload {
  username: string;
  iat: number;
  exp: number;
}
