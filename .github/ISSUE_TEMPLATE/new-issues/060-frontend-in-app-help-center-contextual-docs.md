---
name: "Frontend: In-App Help Center & Contextual Documentation - Guides, Troubleshooting, Release Notes & Support Entry Points"
description: "Build an in-app help center with searchable docs, contextual guidance, troubleshooting playbooks, release notes, and support/contact flows integrated into key workflows"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Users must leave the app to find documentation, troubleshooting steps, and release information. This increases time-to-resolution and onboarding friction.

Issues:
- No in-app searchable help/docs experience
- Contextual guidance missing in complex flows (campaign setup, integrations, triage)
- Troubleshooting and runbooks not surfaced where failures occur
- Release notes/changelog not discoverable in product
- No structured support/feedback entry point with diagnostic context

## Proposed Solution

Create an **In-App Help Center**:
- Searchable docs/help hub sourced from repo docs and curated guides
- Contextual help panels ("?" drawers) embedded in key pages with relevant articles
- Troubleshooting playbooks linked from errors/integration failures/ops views
- In-app release notes and "what's new" announcements
- Support/feedback flow that can attach safe diagnostic context

## Requirements

### Functional
- [ ] Help center UI: search, categories, article view, related links, bookmarks
- [ ] Content pipeline to index/render Markdown docs (user guides, FAQs, runbooks) with version awareness
- [ ] Contextual help mapping: route/feature -> suggested articles and quick actions
- [ ] Inline troubleshooting widgets on error states and integration health panels (#030/#048/#050)
- [ ] In-app changelog/release notes feed with filters (web, core, integrations)
- [ ] "What's new" announcements with dismiss/read tracking
- [ ] Support/feedback form with optional diagnostic bundle (app version, route, recent errors metadata) and privacy controls
- [ ] Deep links between help content and product actions (open settings, start wizard, retry integration)

### Non-Functional
- [ ] Fast client-side search for indexed docs (<100ms typical)
- [ ] Docs rendering sanitized and safe (no script execution)
- [ ] Accessible navigation, dialogs, and readable typography
- [ ] Works offline for cached core help articles (PWA synergy #039)

## Files to Modify / Create
```
apps/web/src/features/help/
├── HelpCenter.tsx
├── HelpSearch.tsx
├── ArticleViewer.tsx
├── ContextualHelpPanel.tsx
├── WhatsNew.tsx
├── SupportFeedbackForm.tsx
├── contentIndex.ts
└── hooks/useHelpContext.ts

apps/web/src/app/help/
├── page.tsx
├── [slug]/page.tsx
└── changelog/page.tsx

apps/web/src/app/api/help/
├── search/route.ts
├── feedback/route.ts
└── announcements/route.ts

scripts/docs/build-help-index.mjs
docs/help/
├── taxonomy.md
└── authoring-guide.md
```

## Acceptance Criteria
- Users can find relevant help without leaving the app
- Contextual help appears in key workflows with actionable troubleshooting
- Release notes/"what's new" discoverable and trackable
- Support/feedback submissions include useful, privacy-safe context

## PR Guide
- Branch: `issue/060-frontend-in-app-help-center`
- Phase 1: Help center UI + docs indexing/rendering
- Phase 2: Contextual help mapping + troubleshooting integrations
- Phase 3: Release notes/what's new + feedback flow
- Phase 4: Search tuning, a11y/offline, tests/docs

**Estimated effort:** 4-5 weeks (200 pts)