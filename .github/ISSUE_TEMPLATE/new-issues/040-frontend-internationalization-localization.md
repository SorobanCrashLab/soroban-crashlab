---
name: "Frontend: Internationalization & Localization Framework - i18n Infrastructure, Translation Workflow & Locale-Aware UX"
description: "Implement a robust i18n/l10n framework for the web app with message extraction, translation workflows, locale-aware formatting, RTL readiness, and CI checks"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

The app has limited/no scalable internationalization support (`apps/web/src/i18n/` exists but likely minimal):
- Hardcoded strings across UI/components
- No standardized translation pipeline or key management
- No locale-aware date/number/timezone formatting consistency
- No RTL layout readiness
- No tooling to prevent untranslated/missing strings

## Proposed Solution

Build an **i18n/l10n Platform**:
- Adopt scalable i18n library/pattern for Next.js App Router (server/client)
- Extract and organize translation keys by domain/feature
- Implement locale detection, switching, persistence, and fallback strategy
- Add formatting utilities (dates, numbers, durations, bytes) and pluralization
- Establish translation workflow and CI checks for missing keys

## Requirements

### Functional
- [ ] i18n provider/config for server and client components
- [ ] Locale routing/selection UI with persistence and fallback locales
- [ ] Message catalogs with namespaced keys (runs, campaigns, triage, integrations, settings)
- [ ] Replace hardcoded UI strings in core flows with translation keys
- [ ] Locale-aware formatting (dates/times/timezones, numbers, percentages, file sizes)
- [ ] Pluralization/gender-safe message patterns where needed
- [ ] RTL readiness: logical CSS properties, layout mirroring support for RTL locales
- [ ] Translation workflow docs (extraction, review, contribution)

### Non-Functional
- [ ] No runtime missing-key errors in default locale
- [ ] Bundle impact minimized (lazy-load locale catalogs)
- [ ] CI check for missing/unused keys
- [ ] SSR/streaming compatible

## Files to Modify / Create
```
apps/web/src/i18n/
├── config.ts
├── provider.tsx
├── server.ts
├── client.ts
├── formatting.ts
├── locales/
│   ├── en/*.json
│   └── (seed additional locale)
└── extraction/
apps/web/src/app/** (string migration in core flows)
apps/web/src/components/** (string migration)
scripts/i18n/
├── extract.mjs
├── check-missing.mjs
└── report-unused.mjs
docs/i18n/
├── contributor-guide.md
└── translation-workflow.md
```

## Acceptance Criteria
- Core flows fully localized in default locale with infrastructure for additional locales
- Locale switch updates UI and formatting correctly
- CI detects missing translation keys
- RTL readiness validated on representative screens

## PR Guide
- Branch: `issue/040-frontend-i18n-l10n`
- Phase 1: Framework setup + formatting + locale switching
- Phase 2: Core flow string migration
- Phase 3: RTL readiness + extraction/check tooling
- Phase 4: CI integration + docs

**Estimated effort:** 5-6 weeks (200 pts)