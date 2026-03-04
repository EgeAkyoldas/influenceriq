# UI/UX Design Specification: Local Instagram Profile Fetcher, Analyzer & Reporter

**Document Version:** 1.0
**Date:** 2024-07-25

## 1. Design Philosophy & Visual Language

The application will adhere to a **Minimalist & Functional** design philosophy. The core objective is to present complex data and AI-driven analysis in a clear, actionable, and efficient manner, avoiding visual clutter. The interface will prioritize usability and direct access to the tool's primary functions: research, analysis, and reporting. The visual language will be clean, professional, and trustworthy, reflecting the B2B nature of the application and its target audience.

## 2. Brand Identity (Colors, Typography, Logo Usage)

*   **Logo:** [To be determined - Placeholder for application logo]
*   **Typography:** A clean, highly readable sans-serif font family will be used for all text elements. Font weights and sizes will follow a consistent typographic scale to ensure hierarchy and legibility.
*   **Logo Usage:** The logo will be prominently displayed in the application header and potentially on login/loading screens. Its usage will be consistent across all views.

## 3. Color System

The application will support both Dark and Light modes, with a design focus on Dark Mode first.

### 3.1 Dark Mode

*   **Primary Background:** Deep charcoal or near-black (e.g., `#121212` or similar) for a comfortable viewing experience.
*   **Secondary Backgrounds (Cards, Modals):** Slightly lighter grays or dark blues (e.g., `#1E1E1E`, `#2A2A2A`).
*   **Primary Text:** Off-white or light gray (e.g., `#E0E0E0`) for high contrast.
*   **Secondary Text/Subtle Elements:** Lighter grays (e.g., `#A0A0A0`).
*   **Accent Color:** A professional, yet distinct color (e.g., a muted teal, a professional blue, or a sophisticated orange) used for interactive elements, highlights, and key calls-to-action. This color should provide sufficient contrast against dark backgrounds.
*   **Semantic Colors:**
    *   **Success:** A clear green (e.g., `#4CAF50`).
    *   **Warning:** A distinct yellow/orange (e.g., `#FFC107`).
    *   **Error:** A clear red (e.g., `#F44336`).

### 3.2 Light Mode

*   **Primary Background:** Clean white or very light off-white (e.g., `#FFFFFF`, `#F8F8F8`).
*   **Secondary Backgrounds (Cards, Modals):** Light gray or subtle off-white (e.g., `#F5F5F5`, `#FAFAFA`).
*   **Primary Text:** Dark gray or black (e.g., `#212121`).
*   **Secondary Text/Subtle Elements:** Medium gray (e.g., `#757575`).
*   **Accent Color:** The same accent color as Dark Mode, adjusted for legibility on light backgrounds.
*   **Semantic Colors:** Similar to Dark Mode, adjusted for contrast on light backgrounds.

## 4. Typography Scale

A single, highly legible sans-serif font family (e.g., Inter, Roboto, Open Sans) will be used.

*   **Headings (H1-H6):** Varied weights and sizes for clear hierarchy.
    *   H1: Largest, boldest (e.g., 2.5rem, bold)
    *   H2: (e.g., 2rem, bold)
    *   H3: (e.g., 1.75rem, semi-bold)
    *   H4: (e.g., 1.5rem, semi-bold)
    *   H5: (e.g., 1.25rem, medium)
    *   H6: (e.g., 1rem, medium)
*   **Body Text:** Standard readable size (e.g., 1rem, regular).
*   **Captions/Small Text:** Smaller size for supplementary information (e.g., 0.875rem, regular).
*   **Code/Technical:** Monospace font for any code snippets or technical identifiers (e.g., 0.875rem, monospace).

## 5. Spacing & Layout Grid

*   **Layout Grid:** A responsive grid system (e.g., 12-column grid) will be used to ensure consistent alignment and layout across different screen sizes.
*   **Spacing:** A consistent spacing scale based on multiples of a base unit (e.g., 4px or 8px) will be applied to margins, padding, and gaps between elements. This ensures visual rhythm and balance.

## 6. Component Library

Leveraging Tailwind CSS and Lucide React, a custom component library will be developed.

### 6.1 Buttons

*   **Variants:** Primary (filled, accent color), Secondary (outlined, accent color or subtle gray), Tertiary (text-only, subtle color).
*   **States:** Default, Hover, Focus, Active, Disabled.
*   **Sizes:** Small, Medium, Large.

### 6.2 Forms & Inputs

*   **Input Fields:** Text, Number, Email, Password, Textarea. Clear labels, placeholder text, focus states, error states.
*   **Selects/Dropdowns:** Standard dropdowns with clear visual indication.
*   **Checkboxes & Radio Buttons:** Accessible and clearly styled.
*   **Validation Feedback:** Clear visual indicators for valid, invalid, and error states.

### 6.3 Cards & Containers

*   **Card:** Used for displaying individual profile summaries, analysis results, or report sections. Subtle borders or shadows, consistent padding.
*   **Modal:** For detailed views, confirmations, or input forms requiring focus. Clear close button, overlay.

### 6.4 Navigation

*   **Header:** Application logo, primary navigation links (if any), user settings/profile access.
*   **Sidebar (Optional):** For navigating between major sections like Discovery, Candidate Pool, Reports.

### 6.5 Data Display Components

*   **Tables:** Sortable, filterable tables for candidate pools and report data. Clear headers, alternating row colors for readability.
*   **Badges/Tags:** For displaying cluster classifications, scores, or risk flags.

## 7. Screen Layouts & Key Views

### 7.1 Dashboard / Discovery Panel

```
+-----------------------------------------------------------------+
| Header (Logo, Nav, Settings)                                    |
+-----------------------------------------------------------------+
| [Search Bar / Input Area]                                       |
| Seed Input (Influencer Name, Hashtag, Keyword)                  |
| [CSV Upload Button] [Add Manually Button] [Start Research Button]|
+-----------------------------------------------------------------+
| [Optional: Recent Searches / Saved Queries]                     |
+-----------------------------------------------------------------+
```

*   **Description:** The primary entry point for initiating research. Clean input fields and clear action buttons.

### 7.2 Candidate Pool View

```
+-----------------------------------------------------------------+
| Header                                                          |
+-----------------------------------------------------------------+
| Filters: [Cluster ▼] [Followers ▼] [Score ▼] [Monetization ▼]    |
| [Search Candidates...]                                          |
+-----------------------------------------------------------------+
| Candidate Table:                                                |
| | Username | Cluster | Followers | Score | Tier | Status | ... | |
| |----------|---------|-----------|-------|------|--------|-----| |
| | @user1   | Dating  | 15k       | 85    | A    | Analyzed| ... | |
| | @user2   | Mindset | 10k       | 78    | B    | Analyzed| ... | |
| | ...      | ...     | ...       | ...   | ...  | ...    | ... | |
+-----------------------------------------------------------------+
| [Pagination Controls]                                           |
+-----------------------------------------------------------------+
```

*   **Description:** A sortable and filterable table displaying discovered influencer profiles. Emphasis on scannability. Each row is clickable to access the Profile Deep View.

### 7.3 Profile Deep View

```
+-----------------------------------------------------------------+
| Header                                                          |
+-----------------------------------------------------------------+
| [Back to Pool Button]                                           |
| @username                                                       |
| [Followers: 15k] [Following: 500] [Posts: 120]                  |
+-----------------------------------------------------------------+
| Profile Overview Section                                        |
|   Bio: ...                                                      |
|   Primary Cluster: Men's Dating                                 |
|   Secondary Cluster: Masculinity                                |
|   Relevance Score: 84%                                          |
+-----------------------------------------------------------------+
| AI Analysis Section                                             |
|   Authority Score: 8.5/10                                       |
|   Monetization Signals: Coaching, Webinar Funnel                |
|   Audience Alignment: ~80% Male                                 |
|   Content Originality: High                                     |
|   Risk Flags: None                                              |
+-----------------------------------------------------------------+
| Engagement Metrics Section                                      |
|   [Chart/Data for Likes, Comments, Shares...]                   |
+-----------------------------------------------------------------+
| Cluster Map Visualization (Optional)                            |
| Risk Flags Details (If any)                                     |
| Link-in-Bio Analysis                                            |
+-----------------------------------------------------------------+
```

*   **Description:** A detailed view of a single influencer's profile, consolidating all fetched and analyzed data. Uses clear sectioning and data visualization.

### 7.4 Report Generation / View

*   **Description:** This section will likely involve a modal or a dedicated page for selecting report parameters (e.g., specific influencers, date range, data points) and then displaying the generated report. Reports will be downloadable and may include charts, tables, and AI summaries. The output format will be structured and clean, suitable for professional use.

## 8. User Flow Diagrams

*   **Research Flow:**
    1.  User lands on Dashboard/Discovery Panel.
    2.  User inputs seed data (influencer name, hashtag, or uploads CSV).
    3.  User clicks "Start Research."
    4.  System initiates data fetching and processing (indicated by loading states/progress indicators).
    5.  User is directed to the Candidate Pool View once data is ready.
    6.  User filters and sorts the candidate pool.
    7.  User clicks on a candidate row to view the Profile Deep View.
    8.  User reviews detailed analysis and metrics.
    9.  User may choose to generate or download reports from the Profile View or Candidate Pool.

## 9. Interaction Patterns & Micro-animations

*   **Hover Effects:** Subtle visual feedback on interactive elements like buttons, links, and table rows.
*   **Loading States:** Clear visual indicators (spinners, skeleton screens) for data fetching and processing.
*   **Transitions:** Smooth transitions between pages and views (e.g., slide-in for profile details, fade-in for modal content) to enhance the PWA feel.
*   **Tooltips:** Used for explaining complex metrics or AI scoring criteria on hover.

## 10. Responsive Breakpoints & Mobile Strategy

The application will be designed mobile-first, ensuring core functionality is accessible and usable on smaller screens.

*   **Breakpoints:** Standard breakpoints will be defined (e.g., mobile, tablet, desktop) to adjust layout, spacing, and component sizes accordingly.
*   **Mobile Experience:** Navigation might collapse into a hamburger menu. Tables in the Candidate Pool view may need horizontal scrolling or a condensed display. Profile details will stack vertically.

## 11. Accessibility Standards (WCAG 2.1 AA)

*   **Semantic HTML:** Use appropriate HTML5 elements for structure and accessibility.
*   **Keyboard Navigation:** All interactive elements must be navigable and operable using a keyboard.
*   **Focus Indicators:** Clear and visible focus states for all interactive elements.
*   **Color Contrast:** Ensure sufficient contrast ratios between text and background colors in both light and dark modes, meeting WCAG AA requirements.
*   **ARIA Attributes:** Use ARIA roles and properties where necessary to enhance screen reader compatibility.
*   **Resizable Text:** Content should reflow and remain readable when text size is increased.

## 12. Design Tokens

Design tokens will be defined (likely as CSS variables) to manage colors, typography, spacing, and other design system elements, ensuring consistency and facilitating easier updates across the application.

## 13. Icon System

Lucide React icons will be used. Icons will be chosen for clarity and relevance to the action or data they represent. Consistent sizing and color application will be maintained.