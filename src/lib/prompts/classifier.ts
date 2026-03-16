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

  let editorRefStr = '';
  if (data.editorExamples && data.editorExamples.length > 0) {
    editorRefStr = `## 📋 Editor Reference (calibration context)
These are tier decisions made by a human editor recently. Use them to calibrate edge cases:
${data.editorExamples.map((e, i) => `${i + 1}. @${e.username}: ${e.previous_tier ?? '?'} → ${e.new_tier} | Reason: "${e.editor_reason}"${e.editor_note ? ` | Note: "${e.editor_note}"` : ''}`).join('\n')}
`;
  }

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

## 🛑 HARD DISQUALIFICATION RULES — TIER D (INSTANT REJECT)
If ANY of the following is true, assign "Tier D" and set "is_approved" to false immediately. No exceptions.

1. **Not men / Not helping men.** Female creators or creators targeting women are disqualified.
2. **Purely fitness coach.** If the account is purely fitness/gym (not dating/mindset), reject it. Also reject any other niche outside of dating, mindset, relationships, or masculinity.
3. **Faceless pages.** Must be a recognizable personal brand.
4. **Follower count > 150,000.** Too large for our use case.
5. **Content is ONLY POV or meme or random content.** Must have personal coaching presence.

## 🏆 TIER DEFINITIONS AND REQUIREMENTS
Assign the matching tier by evaluating Followers, Niche, Face-to-camera %, Monetization, and Post cadence.

- **S Tier (Perfect Fit)**
  - Niche: STRICTLY Men's dating niche.
  - Followers: 500 - 100,000
  - Content Format: At least 30% of recent content is face-to-camera while talking reels.
  - Monetization: Has obviously monetized (clear coaching offer, funnel, or link).
  - Posting Frequency: Posting at least 3x a week recently.
  - Examples: @ryan_unhinged, @peteonealdating, @alexleon.life, @kingracso, @rorygoodlife, @sbdating._, @madisonsocialcoach, @sheshn94, @datingcoachemi, @seduzionealpha, @datingjutsu, @cristianomungioli, @_nextlevelsocial, @apex.andyy, @datingcoachformen, @mikepickupalpha, @confidencebymike, @silver.wolf.strategies, @mirkmode, @dean_raymond_dating, @mrdanferrari, @everlasting.confidence, @defundsimping, @thedeeceejay, @dylanhunterdating, @realdominicsamuel, @coach_seb_dating, @shaymaxx.x, @czarofdating, @therealbencampbell, @nickoptics, @ovomaksim, @mjgetright_, @crosshimself

- **A Tier (Good Fit)**
  - Niche: Men's dating and/or mindset and/or relationships and/or masculinity.
  - Followers: 100 - 60,000
  - Content Format: At least 10% of recent content is face-to-camera while talking reels.
  - Monetization: Has obviously monetized.
  - Posting Frequency: Posting at least 1x a week recently.
  - Examples: @consultantchris, @claytonolsoncoaching, @realcoachlee, @recoverwithnate, @garrettjwhite, @brayden.steckler, @cj.jelinek, @darrenpreilly, @mindsetmastermike, @gamewithframe, @jonny.wtk, @the.recovering.narcissist, @drmathisk, @ptk_mindset, @newcitymastery, @harrisonj.orr, @officialchrisgoldy, @apex.maximilian, @projectlovern, @seb.bates, @aleksfidurski, @lifeofjayhatcher, @bradleyamartin, @michael_hedgecock, @adam___jackson

- **B Tier (Has Potential)**
  - Niche: Men's dating and/or mindset and/or relationships and/or masculinity.
  - Followers: 100 - 100,000
  - Monetization: Unclear / nonexisting monetization.
  - Content Format: Style might be good but it has too much meme or random stuff, it is not as intentional and coaching oriented.
  - Posting Frequency: Posting at least 1x a week recently.
  - Examples: @fathers.on.fire, @maxxingwithmack, @asherrwhiteee, @alepuigg, @risewithdhamare, @scorpius._____, @thestevemayhew, @fortify__

- **C Tier (Not very good but still worth talking to)**
  - Niche: Men's dating and/or mindset and/or relationships and/or masculinity.
  - Followers: 10 - 150,000
  - Acceptable Red Flags: Has a photo with his partner in his profile picture, too much stuff about spirituality / alchemy tantra or weird stuff, indian, bio might include jokes or unclear signals, too much profanity, "hood" language.
  - Monetization: Retreats or nonexistant.
  - Posting Frequency: Has posted at least one in the last 30 days.
  - Examples: @brandon.groux, @evolverelating, @nemanja_sonero, @realbartk, @newfoundawakening, @the.essential.man, @danlunn_, @arestheleader, @theultimategentleman5, @its.tylerjames, @themikeromano, @builtfromwithin.co, @gen6ceo, @the_dating_method_, @mariomindset247, @unhingedsanity_

- **D Tier (Unqualified)**
  - Niche: Purely fitness coach, or in any other niche. ONLY POV/meme/random. Faceless. Not helping men. >150K followers.
  - Examples: @zenofmasculinity, @thesuperhuman.diet, @_mickmoves, @_bazunes0, @terinchapman

> **IMPORTANT:** Tier is assigned by evaluating the EXACT criteria rules listed above (Followers, Niche, Formatting, Cadence, Monetization). If they miss S, check if they fit A, B, or C. If none apply, they are D.
> authority_score (1–10) is a supplementary informational metric only (how authoritative do they speak/look). Do not confuse the two.

## Content Style Detection
Inspect the captions carefully and determine the DOMINANT content format. Pick ONE of these labels:
- **"Face to camera"** — creator visibly speaks directly to the audience, highly coaching-focused
- **"POV approach"** — cold approach / street interaction content from first-person PoV
- **"Text overlay"** — mostly motivational quotes, image macro-style captions, one-liners
- **"Mixed"** — combination of face-to-camera and other formats evident from caption variety
- **"Meme / aggregator"** — mostly jokes, reposts, relatable memes — no original coaching
- **"Lifestyle / vlog"** — day-in-the-life, travel, gym logs — creator's life rather than coaching

## Scoring Fields
- **relevance_score** (0–100): How relevant to a men's dating/coaching campaign? A score matching how close they are to S-tier benchmarks.
- **authority_score** (1–10): Rough voice/expertise indicator. Informational only.
- **monetization_signals**: List detected monetization (e.g., "coaching calls", "paid community", "retreats").
- **audience_alignment** (0–100): How well does the audience overlap with men seeking dating/self-improvement advice?
- **risk_flags**: List any red flags detected from the data. Use ONLY these exact strings (or empty array if none):
  - "Suspected fake engagement" — engagement rate unusually high (>25%) for follower size
  - "Very low posting frequency" — fewer than 1 post a month
  - "No coaching offer in bio" — unclear/nonexistent monetization
  - "Meme / faceless content" — content is mostly aggregated memes or faceless posts
  - "Audience mismatch" — content targets women or completely irrelevant niche
  - "Large account risk" — over 100K followers (close to the 150k hard reject limit)
  - "Spiritual / Tantra content" — too much weird/spirituality content
  - "Hood language / Profanity" — excessive swearing or slang

## Classification Taxonomy & Dynamic Tags
Classify into ONE primary cluster and optionally ONE secondary cluster:
1. **dating** — Men's Dating (pickup, attraction, dating advice, rizz)
2. **mindset** — Men's Mindset (self-improvement, stoicism, discipline)
3. **relationships** — Men's Relationships (marriage, long-term, communication)
4. **masculinity** — Masculinity (traditional masculinity, fraternity, male lifestyle)

**Dynamic Tags**: The 4 clusters above are rigid. If this creator focuses on a unique teagential angle (e.g., "Men's Grooming", "Wealth Generation", "Fitness & Biohacking", "Spiritual Alchemy"), add up to 3 short descriptive tags to the \`dynamic_tags\` array.

${editorRefStr}
## Output Format
Return ONLY valid JSON, no markdown, no explanations:
{
  "primary_cluster": "dating|mindset|relationships|masculinity",
  "secondary_cluster": "dating|mindset|relationships|masculinity|null",
  "dynamic_tags": ["Tag1", "Tag2"],
  "relevance_score": 0-100,
  "authority_score": 1-10,
  "monetization_signals": ["signal1", "signal2"],
  "audience_alignment": 0-100,
  "risk_flags": ["flag1", "flag2"],
  "content_style": "Face to camera|POV approach|Text overlay|Mixed|Meme / aggregator|Lifestyle / vlog",
  "tier": "S|A|B|C|D",
  "tier_reason": "1-2 sentence English explanation of WHY this tier. Cite the exact rules matching the tier (Followers, Face %, Posting Cadence, Monetization). Mention their similarity to specific benchmark examples provided if applicable.",
  "content_summary": "2-3 sentence summary of the creator's strategy, positioning, and content style.",
  "is_approved": true|false,
  "rejection_reason": "Exact reason for rejection if is_approved is false (Tier D), else null"
}`;
}
