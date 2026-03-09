import { generateWithFallback } from './gemini-client';
import { buildClassifierPrompt, type ClassifierInput } from '@/lib/prompts/classifier';
import { jsonrepair } from 'jsonrepair';
import type { NicheCluster, Tier } from '@/types';

interface ClassificationResult {
  primary_cluster: NicheCluster;
  secondary_cluster: NicheCluster | null;
  relevance_score: number;
  authority_score: number;
  monetization_signals: string[];
  audience_alignment: number;
  risk_flags: string[];
  content_style: string;
  tier: Tier;
  tier_reason: string;
  content_summary: string;
  is_approved: boolean;
  rejection_reason: string | null;
}

export interface EditorExample {
  username: string;
  previous_tier: string | null;
  new_tier: string;
  editor_reason: string;
  editor_note?: string;
}

export type { ClassifierInput };

export async function analyzeProfile(data: ClassifierInput): Promise<ClassificationResult> {
  const prompt = buildClassifierPrompt(data);

  try {
    const text = await generateWithFallback({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      temperature: 0.3,
      maxOutputTokens: 4096,
      jsonMode: true,  // Force valid JSON output from Gemini
    });

    // Strip any markdown fences if model ignored JSON mode
    const stripped = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // DEBUG: log raw output to terminal
    console.log(`[AI-ANALYZER] Raw Gemini (300 chars): ${stripped.substring(0, 300)}`);
    console.log(`[AI-ANALYZER] Char at pos 85: "${stripped[85]}" (code: ${stripped.charCodeAt(85)})`);

    // Stage 1: direct parse
    let result: ClassificationResult;
    try {
      result = JSON.parse(stripped) as ClassificationResult;
    } catch (e1) {
      console.log(`[AI-ANALYZER] Stage 1 failed: ${e1}`);
      const blockMatch = stripped.match(/\{[\s\S]*\}/);
      const block = blockMatch ? blockMatch[0] : stripped;
      try {
        result = JSON.parse(block) as ClassificationResult;
      } catch (e2) {
        console.log(`[AI-ANALYZER] Stage 2 failed: ${e2}`);
        try {
          result = JSON.parse(jsonrepair(block)) as ClassificationResult;
        } catch (e3) {
          console.log(`[AI-ANALYZER] All stages failed. Full text:\n${stripped}`);
          throw e3;
        }
      }
    }

    // Validate and normalize clusters
    const validClusters: NicheCluster[] = ['dating', 'mindset', 'relationships', 'masculinity'];
    if (!validClusters.includes(result.primary_cluster)) {
      result.primary_cluster = 'mindset';
    }
    if (result.secondary_cluster && !validClusters.includes(result.secondary_cluster)) {
      result.secondary_cluster = null;
    }

    // Clamp scores — coerce null/undefined/NaN safely first
    result.relevance_score    = Math.max(0, Math.min(100, Number(result.relevance_score)  || 0));
    result.authority_score    = Math.max(1, Math.min(10,  Number(result.authority_score)  || 1));
    result.audience_alignment = Math.max(0, Math.min(100, Number(result.audience_alignment) || 0));

    // Tier validation — fallback based on relevance_score (primary driver)
    const validTiers: Tier[] = ['S', 'A', 'B', 'C', 'D'];
    if (!validTiers.includes(result.tier)) {
      result.tier = result.relevance_score >= 90 ? 'S'
        : result.relevance_score >= 75 ? 'A'
        : result.relevance_score >= 55 ? 'B'
        : result.relevance_score >= 35 ? 'C' : 'D';
    }

    if (!Array.isArray(result.monetization_signals)) result.monetization_signals = [];

    // Normalize risk_flags — whitelist-only, filter out hallucinated strings
    const validRiskFlags = [
      'Suspected fake engagement',
      'Very low posting frequency',
      'High follow-to-follower ratio',
      'No coaching offer in bio',
      'Meme / faceless content',
      'Audience mismatch',
      'Micro account risk',
      'Large account risk',
      'Low authority signal',
    ];
    if (!Array.isArray(result.risk_flags)) result.risk_flags = [];
    result.risk_flags = result.risk_flags.filter((f: string) => validRiskFlags.includes(f));

    // If AI returned Unknown or empty → derive best guess from tier/cluster
    const validStyles = ['Face to camera', 'POV approach', 'Text overlay', 'Mixed', 'Meme / aggregator', 'Lifestyle / vlog'];
    if (!result.content_style || !validStyles.includes(result.content_style)) {
      // Best-guess fallback: high-relevance accounts are likely face-to-camera, low-relevance Mixed
      result.content_style = result.relevance_score >= 60 ? 'Face to camera' : 'Mixed';
    }

    if (!result.content_summary) result.content_summary = '';
    if (!result.tier_reason) result.tier_reason = '';

    result.is_approved = Boolean(result.is_approved);
    if (result.is_approved) {
      result.rejection_reason = null;
    } else if (!result.rejection_reason || result.rejection_reason.trim() === '') {
      // AI forgot to provide a reason — derive fallback from available signals
      const tier = result.tier;
      const style = result.content_style;
      if (tier === 'D') {
        result.rejection_reason = `Tier D: Profile does not meet baseline criteria for a men's dating coaching partnership.`;
      } else if (style === 'Meme / aggregator' || style === 'Text overlay') {
        result.rejection_reason = `Content format (${style}) is not suitable — face-to-camera coaching content required.`;
      } else {
        result.rejection_reason = `Tier ${tier}: Insufficient relevance or coaching signals to qualify.`;
      }
    }

    return result;
  } catch (error) {
    console.error(`AI analysis failed for @${data.username}:`, error);
    throw new Error(`Failed to analyze profile @${data.username}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
