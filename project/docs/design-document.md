# Design Document: Local Instagram Profile Fetcher, Analyzer & Reporter

**Document Version:** 1.0
**Date:** 2024-07-25

## 1. Overview & Purpose

This document outlines the design decisions and architectural considerations for the "Local Instagram Profile Fetcher, Analyzer & Reporter" application. The application is designed to identify, classify, and score Instagram influencers within specific male-focused niche clusters (Men's Dating, Men's Mindset, Men's Relationships, Masculinity) using the Meta Graph API and Gemini API. The core purpose is to provide structured intelligence that replaces time-consuming manual research, operating as a Progressive Web App (PWA) deployed locally.

## 2. System Context Diagram

```
+-------------------+      +---------------------+      +-------------------+
|                   |      |                     |      |                   |
|       User        |----->|   Web Application   |<---->| Local Storage/DB  |
| (Marketing Prof., |      | (PWA)               |      | (IndexedDB/SQLite)|
|  Creator, Coach,  |      |                     |      |                   |
|  Researcher)      |      | - UI Layer          |      +-------------------+
|                   |      | - Data Fetch Client |
+-------------------+      | - AI Analysis Client|
                           | - Report Generator  |      +-------------------+
                           +----------+----------+      |                   |
                                      |                 |   Gemini API      |
                                      |                 | (AI Analysis)     |
                                      v                 +-------------------+
                           +-------------------+
                           |                   |
                           | Meta Graph API    |
                           | (Instagram Data)  |
                           +-------------------+
```

**Diagram Description:**
The user interacts with the Web Application (PWA) via their browser. The application fetches data from the Meta Graph API (Instagram) and sends data to the Gemini API for AI analysis. Results, fetched data, and generated reports are stored locally using client-side storage (IndexedDB) and potentially a local database (SQLite, as inferred from module breakdown in PRD). The application's design prioritizes local operation and data control.

## 3. UI/UX Design Principles

*   **Clarity & Actionability:** Present complex data and AI analysis in an easily digestible and actionable format.
*   **Efficiency:** Streamline the research and analysis workflow to minimize user effort.
*   **Transparency:** Provide insights into how AI classifications and scores are derived (where feasible).
*   **Local First:** Emphasize local data storage and processing for privacy and offline capabilities.
*   **Progressive Enhancement:** Leverage PWA capabilities for a robust, app-like experience.

## 4. Component Architecture

The application will follow a Monolithic architecture, with distinct modules handling specific responsibilities:

*   **UI Layer:** The frontend interface, built as a PWA, responsible for user interaction, data visualization, and input management. This layer will leverage client-side caching extensively.
*   **Input Manager:** Handles user inputs for seed data (influencers, hashtags, keywords) and initiates the research pipeline.
*   **Instagram API Client:** Manages all interactions with the Meta Graph API, including request formatting, rate limit handling, and error management.
*   **Pre-Filter Engine:** Applies deterministic filters to candidate profiles fetched from Instagram before AI analysis.
*   **AI Analyzer (Gemini Client):** Interfaces with the Gemini API to perform cluster classification, authority scoring, and other AI-driven analyses. It will be responsible for structuring prompts and parsing Gemini's JSON output.
*   **Scoring Engine:** Aggregates results from the Pre-Filter Engine and AI Analyzer, applying dynamic weighting logic (as per PRD section 9) to generate final scores and tiers.
*   **Report Generator:** Compiles analyzed data into structured reports (individual profiles, leaderboards, cluster maps, etc.) as specified in the PRD.
*   **Local Data Manager:** Manages data persistence using client-side mechanisms like IndexedDB for fetched profiles, media metadata, and generated reports.
*   **Rate Limit Manager & Retry Queue:** Integrated within the API clients to gracefully handle Instagram API rate limits and transient network errors.

## 5. Data Flow Diagrams

**5.1 Research Pipeline Data Flow:**

```
User Input (Seed Data)
      ↓
Input Manager
      ↓
Instagram API Client (Fetch Candidate Profiles)
      ↓
Raw Data Store (IndexedDB)
      ↓
Pre-Filter Engine (Apply Rules)
      ↓
AI Analyzer (Gemini Client - Classify, Score, Analyze)
      ↓
Scoring Engine (Dynamic Weighting)
      ↓
Report Generator (Compile Reports)
      ↓
Local Data Manager (Persist Reports in IndexedDB)
      ↓
UI Layer (Display Results, Reports)
```

**5.2 Data Fetching & Analysis Flow:**

```
[User Action: Initiate Research]
      ↓
Input Manager -> Instagram API Client
      ↓
[Fetch Profile Data] -> Store in IndexedDB (Raw Candidate Pool)
      ↓
Pre-Filter Engine -> [Apply Filters] -> Filtered Candidates
      ↓
AI Analyzer (Gemini Client) -> [Send Data to Gemini API]
      ↓
[Receive Gemini Analysis (JSON)] -> Store Analysis in IndexedDB
      ↓
Scoring Engine -> [Apply Weighting] -> Final Scores/Tiers
      ↓
Report Generator -> [Compile Report Data] -> Store Report in IndexedDB
      ↓
UI Layer -> [Fetch & Display Report from IndexedDB]
```

## 6. State Management Design

State management will primarily be handled client-side within the PWA. Given the PWA nature and potential for complex data interactions, a state management library (e.g., Zustand, Jotai, or React Context API) will be employed to manage application-wide state, including:

*   User authentication status (if applicable in future iterations).
*   Current research query parameters.
*   Fetched candidate pool data.
*   Status of ongoing analysis tasks.
*   Generated reports and their data.

Local data persistence (IndexedDB) will serve as the primary store for fetched and analyzed data, acting as a cache and source of truth for user-generated content.

## 7. Error Handling & Edge Cases

*   **Instagram API Errors:** Implement robust error handling for API rate limits (exponential backoff, retry queues), invalid credentials, and unexpected API responses. Graceful degradation will occur, potentially informing the user about incomplete data.
*   **Gemini API Errors:** Handle API unavailability, quota exceeded errors, and malformed responses. The system should log these errors and potentially queue analysis for retry.
*   **Data Processing Errors:** Implement try-catch blocks around data parsing and analysis logic. Failed processing of individual profiles should not halt the entire batch; affected profiles should be flagged.
*   **Local Storage Issues:** Handle potential errors during IndexedDB operations (e.g., storage full, database corruption). Inform the user and suggest clearing cache if necessary.
*   **No Results Found:** Provide clear messaging when no influencers are found matching the criteria.
*   **Incomplete Data:** Clearly indicate to the user when certain data points could not be fetched or analyzed.

## 8. Accessibility Considerations

*   **WCAG 2.1 AA Compliance:** Adhere to accessibility standards, ensuring keyboard navigation, sufficient color contrast, semantic HTML, ARIA attributes where necessary, and screen reader compatibility.
*   **Focus Management:** Ensure logical focus order and visible focus indicators for interactive elements.
*   **Resizable Text:** Allow users to resize text without loss of content or functionality.
*   **Alternative Text:** Provide descriptive alt text for any images used within the application interface.

## 9. Design Decisions & Rationale

*   **Monolithic Architecture:** Chosen for its simplicity in development and deployment for a focused B2B application, aligning with a smaller team or individual developer scenario.
*   **Hybrid Rendering (SSR/PWA):** Leverages Next.js capabilities to provide good initial load performance and SEO benefits (even if not a primary goal, it's good practice) while offering a fluid, app-like experience via PWA features and client-side navigation.
*   **Client-Side Caching (IndexedDB):** Essential for a PWA to enable offline access, reduce redundant API calls to Instagram, and store significant amounts of fetched and analyzed data efficiently.
*   **CDN for Static Assets & API Caching:** While deployed locally, a CDN can still be beneficial if the application is hosted on a platform that supports it, or for caching results of frequently requested *external* API calls if the architecture evolves. If strictly local, this might be less critical but is included for future-proofing or platform integration. *Self-correction: Given the "On-Premise / Local Server" deployment, the CDN for dynamic content/API caching might be less relevant unless the "local server" is a robust server accessible within a local network. For a pure single-user local install, this might be reduced to serving static assets.*
*   **On-Premise / Local Server Deployment:** Aligns directly with the PRD's emphasis on local operation, user control, and data privacy, avoiding reliance on external hosting for core functionality.