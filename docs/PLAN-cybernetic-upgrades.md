# Cybernetic Upgrades (Law of Requisite Variety)

## Overview
Addressing Requisite Variety gaps in the existing Lionalyze architecture. Equipping the system to handle unexpected external chaos (API limits, Unicode/Emoji usages, data decay over time, and strict categorical limitations).

## Phase 1: The Filtering Fragility (ASCII vs Human Expression)
- **Goal:** Prevent English-speaking creators from failing the pre-filter due to heavy emoji/unicode use.
- **Tasks:**
  - Implement a more robust language detection mechanism or regex in `pre-filter.ts`.
  - Expand regular expressions to correctly ignore Emojis, Zero-Width joiners, and complex Unicode characters before calculating the ASCII ratio.
- **Verification:** Test `estimateEnglishContent` with heavy-emoji strings to verify it returns a high English score.

## Phase 2: Queue & API Resilience (State Machine Variety)
- **Goal:** Prevent massive queue failures when the Instagram API rate-limits us. 
- **Tasks:**
  - Refactor `src/app/api/leads/batch/route.ts` and recursive background scripts to include Exponential Backoff.
  - Implement HTTP 429 interception.
  - Pause the batch queue dynamically (e.g., sleep for 5-10 minutes) and resume without marking the remaining leads as `error` permanently.
- **Verification:** Simulate rate-limits (force a 429 throw) and verify the queue pauses and resumes accurately.

## Phase 3: Temporal Decay (Autoregulation)
- **Goal:** Keep the influencer classification data fresh and "alive" over time.
- **Tasks:**
  - Implement a Cron Job mechanism (Vercel Cron or a custom Next.js background API endpoint depending on the deployment environment).
  - Create a query that finds "stale" profiles (e.g., analyzed > 45 days ago, Tier B or C).
  - Re-queue these profiles into the `pending` state for fresh analysis without losing the snapshot history.
- **Verification:** Run the cron endpoint manually, verify it catches 45+ day old profiles and sets fetch_status to pending.

## Phase 4: Taxonomy Constraints (Dynamic Tags)
- **Goal:** Capture highly valuable tangential niches (e.g., Men's grooming, fitness+wealth) that don't fit into the 4 rigid clusters.
- **Tasks:**
  - Expand the `analysis_results` data schema to support a `dynamic_tags` JSON column.
  - Update `classifier.ts` to output 2-3 relevant descriptive tags alongside the `primary_cluster`.
  - Display these tags in the Dashboard and Candidates UI as secondary sorting filters.
- **Verification:** Run a test analysis on a "Lifestyle / Wealth" creator and verify the UI displays the generated custom tags.
