# Tech Stack Specification: Local Instagram Profile Fetcher, Analyzer & Reporter

**Document Version:** 1.0
**Date:** 2024-07-25

## 1. Executive Summary

This document details the technology stack for the "Local Instagram Profile Fetcher, Analyzer & Reporter" application. The stack is designed to support a monolithic, PWA-first application deployed locally, leveraging a hybrid rendering approach for optimal user experience and data handling. Key technologies include Next.js for the frontend, Node.js for the backend, SQLite for local structured data, IndexedDB for client-side caching, custom JWT authentication, and GitHub Actions for CI/CD.

## 2. Frontend Stack

*   **Framework:** Next.js (v15.1.7 or latest stable)
    *   **Rationale:** Chosen for its robust support of Hybrid rendering (SSR/SSG/ISR), API Routes, PWA capabilities, and excellent developer experience with React. It aligns with the PRD's requirement for a PWA and the Design Document's hybrid rendering strategy.
*   **UI Library/Components:** Lucide React (v0.475.0)
    *   **Rationale:** Provides a comprehensive set of scalable SVG icons that are easy to integrate and style.
*   **State Management:** React Context API / Zustand (TBD based on complexity)
    *   **Rationale:** For managing global application state within the Next.js application. Context API is built-in, while Zustand offers a simpler alternative for more complex state needs.
*   **Styling:** Tailwind CSS (v3.4.1)
    *   **Rationale:** A utility-first CSS framework that allows for rapid UI development and consistent styling across the application, aligning with modern web development practices.
*   **Animation/Interactivity:** Framer Motion (v12.4.7)
    *   **Rationale:** For adding smooth animations and interactive UI elements, enhancing the user experience.
*   **Markdown Rendering:** React Markdown (v9.0.3)
    *   **Rationale:** To render any markdown content within the application, potentially for displaying AI-generated summaries or explanations.

## 3. Backend Stack

*   **Runtime:** Node.js (v20.x or latest LTS)
    *   **Rationale:** Chosen to align with the Next.js frontend, enabling full-stack JavaScript development and utilizing Next.js API Routes for a monolithic backend architecture.
*   **Framework:** Next.js API Routes
    *   **Rationale:** Integrates seamlessly with the Next.js frontend, allowing for a unified codebase and deployment. Suitable for the monolithic architecture and local deployment.
*   **API Layer:** RESTful principles via Next.js API Routes.
    *   **Rationale:** Standard and well-understood for internal and external (to the user's local server) communication.

## 4. Database & Storage

*   **Local Structured Data:** SQLite
    *   **Rationale:** A lightweight, file-based relational database suitable for local deployment and structured data storage (e.g., profile metadata, analysis results) as indicated in the Design Document. Easy to manage and requires no separate server process.
*   **Client-Side Caching:** IndexedDB (via `idb` library, v8.0.3)
    *   **Rationale:** Essential for PWA capabilities, enabling offline access, fast retrieval of fetched profiles and reports, and reducing redundant API calls, as specified in the Design Document. The `idb` library provides a convenient Promise-based API.

## 5. Infrastructure & Deployment

*   **Deployment Target:** On-Premise / Local Server
    *   **Rationale:** As per the Design Document, the application is intended to run on the user's own hardware or local server, emphasizing data privacy and control.
*   **Containerization (Optional but Recommended):** Docker
    *   **Rationale:** To ensure consistent environment setup and simplify deployment on various local server configurations.

## 6. Third-Party Services & APIs

*   **Instagram Data Access:** Meta Graph API
    *   **Rationale:** The official and recommended method for accessing Instagram data, as detailed in the PRD and Design Document.
*   **AI Analysis:** Google GenAI (`@google/genai`, v1.x)
    *   **Rationale:** Provides access to Gemini models for advanced classification, scoring, and content analysis, as specified in the PRD.

## 7. Development Tooling

*   **Language:** TypeScript (v5+)
    *   **Rationale:** For enhanced code quality, maintainability, and developer productivity through static typing.
*   **Package Manager:** npm or Yarn
    *   **Rationale:** Standard package managers for Node.js projects.
*   **Code Formatting:** ESLint, Prettier
    *   **Rationale:** To maintain consistent code style and catch potential errors early.
*   **Version Control:** Git
    *   **Rationale:** Standard for source code management.
*   **CI/CD:** GitHub Actions
    *   **Rationale:** For automating build, test, and deployment workflows, as chosen in the guided discussion.

## 8. Decision Log

| Decision                     | Rationale                                                                                                                                                                                             | Alternatives Considered                                                     |
| :--------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------ |
| **Frontend: Next.js**        | Hybrid rendering, PWA support, API Routes, React ecosystem.                                                                                                                                           | React (SPA), Vue.js, Svelte.                                              |
| **Backend: Node.js (API Routes)** | Seamless integration with Next.js, JavaScript consistency, suitable for monolithic architecture.                                                                                                      | Python (Django/Flask), Go.                                                |
| **Databases: SQLite + IndexedDB** | SQLite for structured local persistence; IndexedDB for client-side PWA caching and offline capabilities.                                                                                            | PostgreSQL (local), MongoDB (local), solely IndexedDB.                    |
| **Authentication: Custom JWT** | Fits local deployment, minimal user management, avoids external dependencies.                                                                                                                         | NextAuth.js, Clerk, Auth0.                                                |
| **Deployment: Local Server** | Aligns with PRD requirements for local operation and user data control.                                                                                                                               | Cloud Provider (AWS, GCP), PaaS (Vercel, Railway).                        |
| **CI/CD: GitHub Actions**    | Integrated with GitHub, robust automation capabilities.                                                                                                                                               | GitLab CI, Jenkins, manual scripts.                                       |
| **Styling: Tailwind CSS**    | Utility-first approach for rapid UI development and consistency.                                                                                                                                      | CSS Modules, Styled Components, Material UI.                              |
| **AI Integration: @google/genai** | Official SDK for Gemini models, required for core AI functionality.                                                                                                                                   | Other AI providers (if Gemini is unavailable/unsuitable).                 |
| **Data Access: Meta Graph API**| Official, compliant method for accessing Instagram data.                                                                                                                                              | Unofficial scrapers (explicitly avoided due to TOS and risk).             |