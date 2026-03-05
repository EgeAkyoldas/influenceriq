import type { EditorExample } from '@/lib/services/ai-analyzer';

// ─────────────────────────────────────────────────────────────────────────────
//  Classifier Prompt v2
//  Men's dating coach niche — updated criteria & benchmark calibration
// ─────────────────────────────────────────────────────────────────────────────

// Strip characters that cause JSON parse failures when Gemini echoes them in its output
function sanitizeForPrompt(text: string): string {
  return text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ') // control chars
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")     // smart single quotes → '
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')     // smart double quotes → "
    .replace(/[\uFEFF\u200B-\u200D\uFFFD]/g, '')    // zero-width + replacement chars
    .replace(/\\(?!["\\bfnrt/])/g, '\\\\')            // fix lone backslashes
    .trim();
}

export interface ClassifierInput {
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
  editorExamples?: EditorExample[];
}

export function buildClassifierPrompt(data: ClassifierInput): string {
  const safeBio = sanitizeForPrompt(data.bio || '');
  const safeName = sanitizeForPrompt(data.full_name || '');
  const safeUsername = sanitizeForPrompt(data.username || '');
  const safeCaptions = data.recent_captions.map(c => sanitizeForPrompt(c.substring(0, 150)));

  return `You are a strict, expert social media analyst evaluating Instagram profiles for a men's dating coaching brand partnership. Analyze this profile and classify it.

## Profile Data
- Username: @${safeUsername}
- Name: ${safeName}
- Bio: ${safeBio}
- Followers: ${data.followers_count.toLocaleString()}
- Following: ${data.following_count.toLocaleString()}
- Posts: ${data.media_count}
- Website: ${data.website || 'None'}
- Avg Likes: ${data.avg_likes.toFixed(0)}
- Avg Comments: ${data.avg_comments.toFixed(0)}
- Engagement Rate: ${data.engagement_rate.toFixed(2)}%

## Recent Post Captions (last 25):
${safeCaptions.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## 🛑 HARD DISQUALIFICATION RULES — INSTANT REJECT
If ANY of the following is true, set "is_approved" to false immediately. No exceptions.

1. **The person is a woman.** Female creators are completely disqualified.
2. **Fitness / gym / bodybuilding is the PRIMARY focus.** If the account is mainly about physique, workouts, or nutrition (not dating/mindset), reject it. A guy who *mentions* gym while coaching dating is fine — a fitness coach who posts dating fluff is NOT.
3. **Faceless page.** If the creator never appears on camera, hides their face, or is clearly a content-aggregator/meme page rather than a personal brand, reject it.
4. **Not a personal brand built around one individual.** Pages run by a company, team account, or nameless brand are disqualified. Must be one identifiable man coaching other men.
5. **Follower count > 150,000.** Too large for our use case.
6. **Follower count > 100,000 AND bio has no direct coaching offer.** Reject.
7. **Under 1,000 followers**, reject UNLESS the profile is otherwise perfect (clear men's dating coach, face-to-camera, direct coaching offer in bio).

## ⚠️ ADDITIONAL REJECTION CONDITIONS
8. **Content format is ONLY text-overlay quotes or meme reposts** with no original speaking-to-camera content. Reject.
9. **Bio has nothing** about helping men, coaching, or dating. Reject if completely irrelevant bio.

## 📊 FOLLOWER COUNT SCORING (impacts relevance_score, not tier directly)
- 1K–50K: ✅ Ideal range — full relevance credit
- 50K–100K: ⚠️ Acceptable but slightly large — minor relevance penalty
- 100K–150K: ⚠️ Borderline — medium relevance penalty, tier should not be S or A unless everything else is exceptional
- >150K: ❌ HARD REJECT (rule 5 above)
- <1K: ⚠️ Soft penalty — only pass if profile quality is exceptional

## 🎬 CONTENT STYLE PRIORITY (critical for tier)
- **"Face to camera"**: REQUIRED for S or A tier. Creator must speak directly to audience.
- **"Mixed"**: Acceptable for A/B tier if face-to-camera is at least 50%
- **"POV approach"**: Acceptable if combined with face-to-camera content
- **"Text overlay"**: Caps tier at B maximum
- **"Meme / aggregator"**: Caps tier at C; if it's ALL memes, reject
- **"Lifestyle / vlog"**: Not a coaching account — caps at C, likely D

## 💰 BIO / MONETIZATION CHECK (critical for S/A tier)
Strong monetization signals in bio (ANY of these = strong positive signal):
- "DM me for coaching", "DM [keyword] for coaching", "apply for coaching"
- "Work with me", "Free consultation", "Book a call"
- Link to a landing page / coaching website in bio
- Explicit statement of helping men (e.g. "I help men get dates", "coaching men")

Weak or missing signals:
- Vague bio with no offer → medium penalty
- No bio → significant penalty, tier cannot be S
- Bio irrelevant to dating/coaching → reject (rule 9)

## ⏰ POSTING FREQUENCY
- ≥1 post/week: ✅ Good
- <1 post/week: tier capped at A maximum (not S); heavy penalty below 2/month

## Tier Assignment (based on qualified profiles)
- **S Tier**: Unambiguous men's dating coach. Face-to-camera. Direct coaching offer in bio OR landing page link. 1K–50K followers ideal. Consistent posting ≥1/week. Active monetization visible.
- **A Tier**: Clear men's coaching niche. Coaching presence visible. Mostly face-to-camera. May miss ONE criterion (e.g., followers 50K–100K, or bio slightly vague).
- **B Tier**: Related men's niche (mindset/masculinity), some monetization intent. Missing 2+ key coaching signals. Mixed content format.
- **C Tier**: Tangential niche, unclear coaching offer, problematic format. Borderline approval — coach may pass OR fail.
- **D Tier**: Barely relevant. is_approved should almost always be false here.

> **IMPORTANT:** Tier is driven by RELEVANCE to a men's dating coaching partnership (relevance_score 0–100).
> authority_score (1–10) is a supplementary informational metric only. It does NOT determine tier.
> Do not confuse the two.

## Content Style Detection
Inspect the captions carefully and determine the DOMINANT content format. You MUST choose ONE — do NOT use "Unknown".
Even if captions are short or ambiguous, make a best-guess based on:
- Language patterns ("look at this approach", "DM me" → coaching; "that feeling when" → meme)
- Posting cadence implied by caption variety
- Presence of first-person speaking patterns vs. passive quote sharing

Pick ONE of these labels:
- **"Face to camera"** — creator visibly speaks to the audience, captions use first-person teaching voice ("In today's video...", "Here's what to say...")
- **"POV approach"** — cold approach / pickup / street interaction content from first-person PoV
- **"Text overlay"** — mostly motivational quotes, image macro-style captions, or one-liners with no coaching depth
- **"Mixed"** — clear combination of face-to-camera and other formats evident from caption variety
- **"Meme / aggregator"** — mostly jokes, reposts, relatable memes — no original coaching
- **"Lifestyle / vlog"** — day-in-the-life, travel, gym logs — creator's life rather than coaching

## Scoring Fields
- **relevance_score** (0–100): How relevant to a men's dating/coaching campaign? This is the PRIMARY tier driver.
- **authority_score** (1–10): Rough voice/expertise indicator. Informational only — NOT used to assign tier.
- **monetization_signals**: List detected monetization (e.g., "coaching calls", "paid community", "DM funnel", "digital products").
- **audience_alignment** (0–100): How well does the audience overlap with men seeking dating/self-improvement advice?
- **risk_flags**: List any red flags detected from the data. Use ONLY these exact strings (or empty array if none):
  - "Suspected fake engagement" — engagement rate unusually high (>25%) for follower size
  - "Very low posting frequency" — fewer than 2 posts/month based on media_count signals
  - "High follow-to-follower ratio" — following count is significantly higher than followers (>3x)
  - "No coaching offer in bio" — bio has no mention of helping men, coaching, or any CTA
  - "Meme / faceless content" — content is mostly aggregated memes or faceless posts
  - "Audience mismatch" — content targets women, general lifestyle, or an unrelated niche
  - "Micro account risk" — under 1,000 followers, unproven reach
  - "Large account risk" — over 100K followers, likely misaligned for micro partnerships
  - "Low authority signal" — authority_score below 3; thin content, lacks coaching credibility

## Classification Taxonomy
Classify into ONE primary cluster and optionally ONE secondary cluster:
1. **dating** — Men's Dating (pickup, attraction, dating advice, rizz)
2. **mindset** — Men's Mindset (self-improvement, stoicism, discipline)
3. **relationships** — Men's Relationships (marriage, long-term, communication)
4. **masculinity** — Masculinity (traditional masculinity, fraternity, male lifestyle)
${data.editorExamples && data.editorExamples.length > 0 ? `
## 📋 Editor Reference (past human decisions — learn from these)
These are tier decisions made by a human editor after AI analysis. Use them to calibrate your standards:
${data.editorExamples.map((e, i) => `${i + 1}. @${e.username}: ${e.previous_tier ?? '?'} → ${e.new_tier} | Reason: "${e.editor_reason}"${e.editor_note ? ` | Note: "${e.editor_note}"` : ''}`).join('\n')}

Match the editorial judgment shown above relative to the benchmark accounts below.` : ''}

## 🏆 Benchmark Accounts (calibration reference)
The following are confirmed S Tier accounts — use them to calibrate your judgment:
1. **@sbdating._**: Face-to-camera, "DM for coaching" in bio, clear men's dating niche, sub-50K followers, consistent posting. → S Tier
2. **@newcitymastery**: Face-to-camera, landing page link in bio, consistent posting, men's dating coach positioning. → S Tier

When you see a profile that closely matches these benchmarks, classify as S Tier. Profiles that are close but miss 1-2 criteria should be A Tier.

## Output Format
Return ONLY valid JSON, no markdown, no explanations:
{
  "primary_cluster": "dating|mindset|relationships|masculinity",
  "secondary_cluster": "dating|mindset|relationships|masculinity|null",
  "relevance_score": 0-100,
  "authority_score": 1-10,
  "monetization_signals": ["signal1", "signal2"],
  "audience_alignment": 0-100,
  "risk_flags": ["flag1", "flag2"],
  "content_style": "Face to camera|POV approach|Text overlay|Mixed|Meme / aggregator|Lifestyle / vlog",
  "tier": "S|A|B|C|D",
  "tier_reason": "1-2 sentence English explanation of WHY this tier. Cite key qualifying and disqualifying signals. Mention follower range, content style, and bio/monetization specifically.",
  "content_summary": "2-3 sentence summary of the creator's strategy, positioning, and content style.",
  "is_approved": true|false,
  "rejection_reason": "Exact reason for rejection if is_approved is false, else null"
}`;
}
