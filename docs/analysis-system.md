# Analysis System Documentation

## Pipeline Overview

```
CSV/Usernames Input
       ↓
  Lead Import (dedup, upsert to leads table)
       ↓
  Batch Fetch Engine (rate-limited, 5s interval)
       ↓
  Instagram API (Meta Graph API v21.0)
       ↓  [fallback if Meta fails]
  RapidAPI Scraper (instagram-scraper-stable-api)
       ↓
  Profile + Media stored to DB
       ↓
  Pre-Filter (fast heuristic checks, no AI cost)
       ↓  [fail → mark filtered, skip AI]
  AI Analysis (Gemini via gemini-client.ts)
       ↓
  Classification results stored to analysis_results
       ↓
  Editor Review (optional human override)
       ↓
  Candidates / Analytics
```

---

## Services

### `instagram-client.ts`
- Fetches profile + last 25 media posts via **Meta Graph API Business Discovery**
- Implements a **queue-based rate limiter** (5s minimum between requests)
- Retry logic for HTTP 429 and API error code 4 (exponential backoff: 60s, 120s, 240s, 480s)
- Falls back to RapidAPI on error codes: 17, 110, 4, 32, OAuthException

### `rapidapi-client.ts`
- Fallback scraper: `instagram-scraper-stable-api.p.rapidapi.com`
- Fetches profile info + posts in two requests if needed
- Own retry loop for 429 responses (20s, 40s, 80s)
- Returns same data shape as `instagram-client` (`GraphApiProfile`, `GraphApiMedia[]`)

### `pre-filter.ts`
- **Zero AI cost** — runs before Gemini to eliminate obvious rejections
- Configurable thresholds (stored in `settings` DB table):
  - `min_followers` (default: 5000)
  - `min_engagement_rate` (default: 1.0%)
  - `min_english_content` (default: 60%)
  - `min_posts_per_month` (default: 2)
- English detection: ASCII ratio heuristic on caption text
- Posting frequency: estimated from `oldest_post_date` + total post count

### `gemini-client.ts`
- Centralized Gemini API client with **multi-key fallback** (up to 10 keys)
- **Model fallback order:** `gemini-2.5-flash` → `gemini-2.0-flash` → `gemini-2.0-flash-lite` → `gemini-1.5-flash`
- Automatically remembers last working key/model combination
- Two modes: `generateWithFallback()` (blocking) and `streamWithFallback()` (SSE streaming)
- `getGeminiStatus()` returns current key/model state for debugging

### `ai-analyzer.ts`
- Calls `generateWithFallback()` with a structured prompt
- Returns `ClassificationResult`:
  - `primary_cluster` / `secondary_cluster`
  - `relevance_score` (0–100) — **primary tier driver**
  - `authority_score` (1–10) — informational only, not used for tier assignment
  - `audience_alignment` (0–100)
  - `monetization_signals` (string[])
  - `content_style` — one of 7 standardized values
  - `tier` (S/A/B/C/D)
  - `tier_reason` — 1–2 sentence explanation
  - `content_summary` — 2–3 sentence profile summary
  - `is_approved` (boolean)
  - `rejection_reason` (string | null)
- Post-processes AI output: validates clusters, clamps scores, normalizes tier

### `research-pipeline.ts`
- Orchestrates the full pipeline for a `research` record
- Runs async (fire-and-forget from API route), updates `status` field in DB
- Per-profile error handling: one failure doesn't kill the whole pipeline
- Pipeline status progression: `pending → fetching → analyzing → complete / failed`

---

## Niche Cluster Taxonomy

| Cluster | Description |
|---------|-------------|
| `dating` | Men's dating (pickup, attraction, rizz, cold approach) |
| `mindset` | Self-improvement, discipline, stoicism, motivation |
| `relationships` | Relationship dynamics, marriage, communication |
| `masculinity` | Traditional masculinity, fraternity, male lifestyle |

Every profile gets a **primary** cluster and optionally a **secondary** cluster. The combination generates an **Archetype** label (e.g., `dating + mindset` = "Alpha Strategist").

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `research` | Pipeline run records (seed_type: username/csv) |
| `profiles` | Fetched Instagram profiles |
| `media` | Last 25 posts per profile |
| `analysis_results` | AI classification output (1 per profile) |
| `analysis_snapshots` | Historical versions before each re-verify |
| `verified_profiles` | Editor override tier + approval status |
| `editor_decision_logs` | Audit trail for all human editor decisions |
| `leads` | Raw CSV import data before API fetch |
| `batch_jobs` | Batch fetch/reverify job progress tracking |
| `settings` | Configurable thresholds (key-value store) |
| `reports` | Saved reports (planned feature) |

---

## Settings (Configurable Thresholds)

Stored in `settings` table, configurable via `/settings` UI:

| Key | Default | Description |
|-----|---------|-------------|
| `min_followers` | 5000 | Pre-filter minimum follower count |
| `min_engagement_rate` | 1.0 | Pre-filter min engagement % |
| `min_english_content` | 60 | Pre-filter min English caption % |
| `min_posts_per_month` | 2 | Pre-filter min posting frequency |

> **Note:** AI prompt has its own follower thresholds (up to 150K) which are separate from pre-filter. Pre-filter is a coarser, cheaper gate.

---

## AI Prompt Architecture (v2)

Prompts are modularized in `src/lib/prompts/`:

```
src/lib/prompts/
  ├── classifier.ts   — analyzeProfile() prompt template + buildPrompt()
  └── chat-system.ts  — buildChatSystemPrompt() for the AI chat assistant
```

Key design principles:
- Prompt text is never inline in service files — always imported from `prompts/`
- Editor reference examples are dynamically injected into the classifier prompt
- System prompts are built at runtime (context-aware, live DB data for chat)

---

## Re-Verify System

Allows re-running AI classification on existing profiles without new Instagram API calls.

**Per-Profile:** `POST /api/profiles/:id/reverify`
- Reads existing media from DB
- Snapshots current analysis to `analysis_snapshots`
- Runs `analyzeProfile()` with latest prompt version
- Returns `{ old_analysis, new_analysis, changed }`
- User accepts or rejects in UI

**Batch:** `POST /api/profiles/batch-reverify`  
- Accepts optional filter (tier, cluster)
- Runs as background job tracked in `batch_jobs`
- Progress visible in `/flow` dashboard
