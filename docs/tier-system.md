# Tier Classification System v2

## Overview

Profiles are classified into **S / A / B / C / D** tiers based on their fit as a men's dating coaching brand partner. Tier is driven primarily by **relevance score** (0–100), not by authority score. Authority score is a supplementary, informational metric only.

---

## Tier Definitions

| Tier | Label | Relevance Score | Description |
|------|-------|-----------------|-------------|
| **S** | Elite Match | 90–100 | Unambiguous men's dating coach. Face-to-camera, clear coaching offer in bio, active monetization. 1K–50K followers ideal. |
| **A** | Strong Match | 75–89 | Clear men's coaching niche. Mostly face-to-camera. May miss one minor criterion. |
| **B** | Moderate Match | 55–74 | Related men's niche (mindset/masculinity). Some monetization intent. Mixed content format. |
| **C** | Weak Match | 35–54 | Tangential niche, vague coaching offer, or borderline format. Requires human review. |
| **D** | Not Relevant | 0–34 | Barely relevant. `is_approved` is almost always `false`. |

> **Note:** Authority score (1–10) is a secondary signal — used for sorting/ranking within the same tier but **never used to assign a tier**.

---

## Benchmark Accounts (S Tier References)

These accounts represent the ideal profile for our use case. AI classification is calibrated against these:

| Account | Why S Tier |
|---------|-----------|
| `@sbdating._` | Face-to-camera, clear "DM for coaching" bio, men's dating niche, 1K–50K range |
| `@newcitymastery` | Face-to-camera, landing page in bio, consistent posting, men's dating coach |

---

## Scoring Signals

### 1. Follower Count Signal

| Range | Signal | Impact |
|-------|--------|--------|
| 1K – 50K | ✅ Ideal | Full score |
| 50K – 100K | ⚠️ Acceptable | Slight penaltı |
| 100K – 150K | ⚠️ Borderline | Tier drops by one |
| > 150K | ❌ Hard Reject | `is_approved = false` |
| < 1K | ⚠️ Soft flag | Passes if everything else is perfect |

### 2. Content Style Signal

| Style | Signal | Impact |
|-------|--------|--------|
| Face to camera | ✅ Ideal | Required for S/A tier |
| Mixed | ⚠️ Neutral | A/B range |
| POV approach | ⚠️ Conditional | OK if also face-to-camera |
| Text overlay | ❌ Penaltı | B/C ceiling |
| Meme / aggregator | ❌ Hard penaltı | C/D ceiling; may reject |
| Lifestyle / vlog | ❌ Penaltı | Not a coaching account |

### 3. Bio / Monetization Signal

| Bio Contains | Signal |
|---|---|
| "DM me for coaching", "work with me", "free call" | ✅ Strong monetization signal |
| Link to landing page / coaching website | ✅ Strong |
| Vague bio, no offer | ⚠️ Neutral–negative |
| No bio | ❌ Penaltı |

### 4. Posting Frequency
- Minimum: **≥ 1 post/week** for S/A tier
- Below this: tier is capped at B or lower

---

## Hard Disqualification Rules

The following result in `is_approved = false`, regardless of other signals:

1. **Female creator** — not our target audience
2. **Fitness coach as primary niche** — physique/workout is the main content
3. **Faceless page** — no creator identity, aggregator or meme page
4. **Team/brand account** — not a personal brand (one identifiable man)
5. **>150K followers** — outside our use case
6. **>100K followers AND no coaching offer in bio**
7. **Content is only text-overlay or meme reposts** — no face-to-camera content
8. **Bio has nothing about helping men, coaching, or dating**

---

## Approval Status

Every profile gets an `is_approved` boolean:

- `true` — profile passes all disqualification checks, has a tier of S/A/B/C
- `false` — profile failed at least one hard disqualification rule
- `null` — not yet analyzed by AI (pre-filter fail or pending)

`rejection_reason` stores the specific reason when `is_approved = false`.

---

## Editor Override System

Human editors can override AI tier decisions via the **Editor Review** panel on each profile detail page.

- Override is stored in `verified_profiles.editor_tier`
- All changes logged in `editor_decision_logs`
- Analytics and leaderboards use `COALESCE(editor_tier, ai_tier)` — editor always wins
- Overrides can be reverted at any time ("Revert to AI" button)
- Editor can also trigger **AI Re-Verify** to get a fresh classification with the latest prompt version

---

## AI Re-Verify

Per-profile or batch re-verification uses the current prompt version against existing media data (no new Instagram API call needed).

- Results are diffed vs the current classification
- Previous analysis is automatically snapshotted to `analysis_snapshots` before overwriting
- User can accept or reject the new classification
