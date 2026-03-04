import { generateWithFallback } from './gemini-client';
import type { NicheCluster, Tier } from '@/types';

interface ClassificationResult {
  primary_cluster: NicheCluster;
  secondary_cluster: NicheCluster | null;
  relevance_score: number;
  authority_score: number;
  monetization_signals: string[];
  audience_alignment: number;
  risk_flags: string[];
  tier: Tier;
  content_summary: string;
}

interface ProfileDataForAnalysis {
  username: string;
  full_name: string;
  bio: string;
  followers_count: number;
  following_count: number;
  media_count: number;
  website: string;
  recent_captions: string[];
  avg_likes: number;
  avg_comments: number;
  engagement_rate: number;
}

export async function analyzeProfile(data: ProfileDataForAnalysis): Promise<ClassificationResult> {
  const prompt = `You are an expert social media analyst specializing in male-focused Instagram niches. Analyze this Instagram profile and classify it.

## Profile Data
- Username: @${data.username}
- Name: ${data.full_name}
- Bio: ${data.bio}
- Followers: ${data.followers_count.toLocaleString()}
- Following: ${data.following_count.toLocaleString()}
- Posts: ${data.media_count}
- Website: ${data.website || 'None'}
- Avg Likes: ${data.avg_likes.toFixed(0)}
- Avg Comments: ${data.avg_comments.toFixed(0)}
- Engagement Rate: ${data.engagement_rate.toFixed(2)}%

## Recent Post Captions (last 25):
${data.recent_captions.map((c, i) => `${i + 1}. ${c.substring(0, 200)}`).join('\n')}

## Classification Taxonomy
Classify into ONE primary cluster and optionally ONE secondary cluster:
1. **dating** — Men's Dating: pickup, attraction, dating advice, approaching women, texting game, date planning
2. **mindset** — Men's Mindset: self-improvement, stoicism, motivation, discipline, goal-setting, mental health, productivity
3. **relationships** — Men's Relationships: marriage advice, maintaining relationships, communication, commitment, family dynamics
4. **masculinity** — Masculinity: traditional masculinity, fitness culture, male lifestyle, grooming, male identity, brotherhood

## Scoring Criteria
- **relevance_score** (0-100): How relevant is this profile to the male-focused niche clusters above?
- **authority_score** (1-10): How authoritative is this voice? Consider follower count, engagement, content quality, expertise signals
- **audience_alignment** (0-100): Estimated percentage of male-targeted content
- **monetization_signals**: List any detected monetization strategies (e.g., "coaching", "course sales", "affiliate marketing", "webinar funnel", "digital products", "merchandise", "sponsorships", "paid community")
- **risk_flags**: List any concerns (e.g., "low content originality", "engagement bait", "controversial content", "potential TOS violation", "bot-like engagement patterns")
- **tier**: A (authority score 8-10), B (6-7.9), C (4-5.9), D (below 4)

## Output Format
Return ONLY valid JSON, no markdown, no explanations:
{
  "primary_cluster": "dating|mindset|relationships|masculinity",
  "secondary_cluster": "dating|mindset|relationships|masculinity" or null,
  "relevance_score": 0-100,
  "authority_score": 1.0-10.0,
  "monetization_signals": ["signal1", "signal2"],
  "audience_alignment": 0-100,
  "risk_flags": ["flag1"] or [],
  "tier": "A|B|C|D",
  "content_summary": "2-3 sentence summary of this influencer's content strategy and positioning"
}`;

  try {
    const text = await generateWithFallback({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      temperature: 0.3,
      maxOutputTokens: 1024,
    });
    
    // Strip markdown code fences if present
    const jsonText = text.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    
    const result = JSON.parse(jsonText) as ClassificationResult;

    // Validate and normalize
    const validClusters: NicheCluster[] = ['dating', 'mindset', 'relationships', 'masculinity'];
    if (!validClusters.includes(result.primary_cluster)) {
      result.primary_cluster = 'mindset'; // default fallback
    }
    if (result.secondary_cluster && !validClusters.includes(result.secondary_cluster)) {
      result.secondary_cluster = null;
    }
    result.relevance_score = Math.max(0, Math.min(100, result.relevance_score));
    result.authority_score = Math.max(1, Math.min(10, result.authority_score));
    result.audience_alignment = Math.max(0, Math.min(100, result.audience_alignment));
    
    const validTiers: Tier[] = ['A', 'B', 'C', 'D'];
    if (!validTiers.includes(result.tier)) {
      result.tier = result.authority_score >= 8 ? 'A' : result.authority_score >= 6 ? 'B' : result.authority_score >= 4 ? 'C' : 'D';
    }

    if (!Array.isArray(result.monetization_signals)) result.monetization_signals = [];
    if (!Array.isArray(result.risk_flags)) result.risk_flags = [];
    if (!result.content_summary) result.content_summary = '';

    return result;
  } catch (error) {
    console.error(`AI analysis failed for @${data.username}:`, error);
    throw new Error(`Failed to analyze profile @${data.username}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export type { ProfileDataForAnalysis, ClassificationResult };
