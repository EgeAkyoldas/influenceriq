# Project Task List: Local Instagram Profile Fetcher, Analyzer & Reporter

This task list outlines the development process, broken down by phases, epics, and detailed tasks, ensuring comprehensive coverage from setup to post-launch.

## Phase 1: Project Setup & Core Foundation (MVP - Weeks 1-2)

* **Epic: Project Initialization**
* Create new Git repository (e.g., on GitHub).
* Configure ESLint and Prettier for code linting and formatting.
* Set up TypeScript configuration (`tsconfig.json`).
* Initialize project with Next.js (`create-next-app`).
* Install core dependencies: `react`, `react-dom`, `next`, `typescript`, `tailwindcss`, `lucide-react`, `@google/genai`, `idb`, `framer-motion`, `react-markdown`.
* Configure Tailwind CSS.
* Set up basic PWA configuration in Next.js.
* Configure GitHub Actions for basic CI (linting, type checking).
* **Epic: Database & Storage Setup**
* Set up SQLite for local structured data storage.
  *  Define initial schema for profiles, media, and analysis results.
  *  Implement basic data access layer for SQLite.
* Set up IndexedDB for client-side caching.
  *  Define IndexedDB schema for cached data.
  *  Implement data access layer using `idb` library.
* **Epic: Authentication Flow**
* Implement custom JWT-based authentication logic.
  *  Create API routes for token generation and validation.
  *  Implement token storage (e.g., in localStorage or IndexedDB).
  *  Protect key API routes and frontend views.

## Phase 2: Core Feature Development (MVP - Weeks 3-6)

* **Epic: Instagram Data Fetching (P0)**
* Implement Instagram API Client module.
  *  Securely manage API credentials (Meta Graph API).
  *  Implement rate limit handling and retry mechanisms.
  *  Develop function to fetch profile metadata (`/ig_user/{user_id}`).
  *  Develop function to fetch user media (`/ig_user/{user_id}/media`).
  *  Develop function to fetch media engagement data (`/media/{media_id}`).
  *  Implement error handling for API interactions.
* Integrate data fetching into the research pipeline.
  *  Trigger data fetching after discovery expansion.
  *  Store fetched raw data in IndexedDB.
* **Epic: AI-Powered Cluster Classification (P0)**
* Implement AI Analyzer module (Gemini Client).
  *  Securely manage Gemini API key.
  *  Develop prompt engineering for cluster classification.
  *  Implement logic to parse Gemini API JSON output for cluster data.
  *  Handle Gemini API errors and rate limits.
* Integrate AI classification into the research pipeline.
  *  Send relevant profile/content data to Gemini API.
  *  Store classification results (primary cluster, secondary cluster, relevance score).
* **Epic: Structured Reporting (P0)**
* Develop Report Generator module.
  *  Define report structures (individual profile summary, ranked lists, cluster distribution).
  *  Implement logic to query data from SQLite and IndexedDB.
  *  Format reports for display in the UI.
* Integrate report generation into the pipeline.
  *  Trigger report generation after analysis is complete.
  *  Display reports in the UI.
* **Epic: Frontend Development (MVP)**
* Implement UI Layer components using Tailwind CSS and Lucide React.
* Develop Discovery Panel UI.
  *  Input fields for seed data (influencers, hashtags, keywords).
  *  CSV upload functionality.
  *  "Start Research" button and loading/progress indicators.
* Develop Candidate Pool View UI.
  *  Implement sortable and filterable table for candidates.
  *  Display key profile data (username, cluster, followers, score, status).
  *  Implement pagination.
* Develop Profile Deep View UI.
  *  Display detailed profile overview, AI analysis, and engagement metrics.
  *  Implement navigation back to Candidate Pool.
* Implement basic state management for UI.

## Phase 3: Feature Expansion & Polish (Beta - Weeks 7-10)

* **Epic: Pre-Filter Engine (P1)**
* Implement Pre-Filter Engine module.
  *  Define and implement filtering logic (follower floor, engagement ratio, English content, posting frequency).
  *  Integrate filtering into the pipeline before AI analysis.
* **Epic: AI Authority & Monetization Analysis (P1)**
* Enhance AI Analyzer module.
  *  Develop prompt engineering for authority scoring, monetization signals, and audience alignment.
  *  Implement logic to parse Gemini API output for these new dimensions.
* Enhance Scoring Engine module.
  *  Implement logic for calculating authority scores and tiers.
  *  Integrate monetization signals and audience alignment into scoring.
* Update reporting and Profile Deep View to display new analysis.
* **Epic: Manual Review Interface (P1)**
* Design and implement UI for reviewing AI classifications and scores.
  *  Allow users to view AI outputs and potentially provide confirmations or feedback.
* Implement logic to store manual review results (if applicable).
* **Epic: UI/UX Polish**
* Implement Dark/Light mode switching.
* Add micro-animations and transitions for a smoother PWA experience.
* Refine responsive design for mobile and tablet views.
* Implement tooltips for complex data points.

## Phase 4: Production Hardening & Launch Prep (Launch - Weeks 11-13)

* **Epic: Risk Flagging (P2)**
* Enhance AI Analyzer module.
  *  Develop prompt engineering for risk detection.
  *  Implement logic to parse Gemini API output for risk flags.
* Update reporting and Profile Deep View to display risk flags.
* **Epic: Security Enhancements**
* Conduct security review of API key management.
* Implement input validation across all user-facing and API routes.
* Review and secure JWT implementation.
* Consider local SQLite database encryption.
* **Epic: Performance Optimization & Monitoring**
* Optimize data fetching and AI processing for efficiency.
* Conduct performance testing on local deployment.
* Implement logging for application errors and API interactions.
* Set up basic monitoring for local operation (e.g., log file analysis).
* **Epic: Deployment & Documentation**
* Finalize Dockerfile for containerized local deployment.
* Create clear installation and usage guides for local server setup.
* Refine GitHub Actions CI pipeline for automated testing and build.

## Phase 5: Post-Launch (Ongoing)

* **Epic: Maintenance & Iteration**
* Monitor Instagram Graph API and Gemini API for changes.
* Address user-reported bugs and feedback.
* Regularly update dependencies.
* Periodically review and potentially retrain AI models.
* **Epic: Future Enhancements**
* Explore advanced reporting features.
* Investigate trend analysis capabilities.
* Consider user-requested features based on feedback loops.

## Testing Strategy

* **Unit Tests:** For individual functions and components (e.g., API client logic, data access functions, UI components).
* **Integration Tests:** To verify interactions between modules (e.g., API client + AI analyzer, data fetching + storage).
* **End-to-End (E2E) Tests:** To simulate user flows (e.g., discovery to report generation) using tools like Playwright or Cypress.
* **Manual Testing:** Exploratory testing, usability testing, and verification of AI output accuracy.

Here's a summary of the key tasks and phases:

* **Phased Development:** Tasks are organized into logical phases (MVP, Beta, Launch, Post-Launch) with clear goals and milestones.
* **Core Functionality First:** MVP focuses on essential data fetching, AI classification, and reporting.
* **Technology Stack Integration:** Tasks cover setting up Next.js, Node.js, SQLite, IndexedDB, custom JWT auth, and GitHub Actions CI/CD.
* **Testing & Documentation:** Integrated throughout the process, from unit tests to E2E and user guides.
* **Continuous Improvement:** Post-launch phase emphasizes maintenance, feedback incorporation, and future enhancements.
