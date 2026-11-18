---
name: "Frontend: Workspace Branding, Theming & White-Label Controls - Enterprise Customization with Safe Design Tokens"
description: "Enable workspace-level branding and theming (logos, colors, typography, email/share surfaces) with governed design-token overrides, accessibility safeguards, and preview/rollback workflows"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement
Organizations using CrashLab need brand alignment and environment distinction, but theming is global/static:
- No workspace-scoped branding (logo, name, accent colors, environment labels)
- Custom themes risk breaking contrast, readability, and component consistency
- Shared/exported artifacts (reports, public dashboards) lack branded presentation controls
- Theme changes are not previewable, versioned, or auditable

## Proposed Solution
Implement **Workspace Branding & Theming Controls**:
- Token-based theme customization constrained by design-system primitives (#046)
- Branding assets and environment identity settings per workspace (#071)
- Live preview, contrast/accessibility validation, and rollback/version history
- Application to in-app surfaces and export/share templates where appropriate

## Requirements
### Functional
- [ ] Workspace settings UI for logo/assets, display name, color tokens, typography scale options, and environment badges
- [ ] Design-token override model mapped to component library with safe bounds and fallbacks
- [ ] Real-time preview across key screens/components and light/dark/high-contrast modes
- [ ] Accessibility guardrails: contrast checks, minimum sizes, focus visibility preservation (#038/#096)
- [ ] Versioning, draft/publish, rollback, and audit trail for branding changes (#063/#070)
- [ ] Apply branding to reports/share links/embedded dashboards where enabled (#043/#053/#100)
- [ ] Import/export theme presets and workspace-to-workspace copy (permission-gated)

### Non-Functional
- [ ] No CSS injection/XSS via assets or token values; strict sanitization/validation
- [ ] Deterministic theme resolution and fast runtime switching without flashes
- [ ] Backward-compatible defaults when overrides missing/invalid
- [ ] Comprehensive visual regression coverage across themes (#077)

## Files to Modify / Create
```
apps/web/src/features/branding/
├── BrandingSettings.tsx
├── ThemePreview.tsx
├── TokenEditor.tsx
├── AccessibilityChecks.tsx
└── hooks/useBranding.ts

apps/web/src/styles/tokens/
├── workspace-theme.ts
└── resolver.ts

apps/web/src/app/settings/branding/page.tsx
apps/web/src/app/api/workspaces/[id]/branding/route.ts
docs/frontend/workspace-branding-theming.md
```

## Acceptance Criteria
- Workspaces can safely customize branding/themes with preview and governance
- Accessibility and security constraints prevent unsafe or unreadable themes
- Branded presentation applies consistently to supported surfaces and exports

## PR Guide
- Branch: `issue/113-frontend-workspace-branding-theming`
- Phase 1: token model/resolver + settings UI + preview
- Phase 2: a11y validation + persistence/versioning
- Phase 3: export/share/embed integration
- Phase 4: security hardening, visual tests/docs

**Estimated effort:** 5-6 weeks (200 pts)
