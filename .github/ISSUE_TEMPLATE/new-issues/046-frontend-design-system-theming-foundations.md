---
name: "Frontend: Design System & Theming Foundations - Token Architecture, Component Standards, Dark/Light/HC Themes & Motion System"
description: "Establish a robust design system foundation with design tokens, theme architecture (light/dark/high-contrast), typography/spacing scales, motion guidelines, and standardized component primitives"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

UI styling is inconsistent across the app (`globals.css`, component-local styles, Tailwind usage patterns, theme utilities). This slows development and creates UX/accessibility inconsistencies.

Issues:
- No centralized design token system (colors, spacing, typography, radii, shadows, z-index)
- Theme support exists partially but lacks systematic token mapping and high-contrast mode
- Component variants/states implemented inconsistently
- Motion/animation behavior ad hoc (no reduced-motion standards)
- Hard to ensure visual consistency as feature surface grows

## Proposed Solution

Create a **Design System Foundation**:
- Token architecture (semantic + primitive tokens) for color, type, spacing, elevation, motion
- Theme engine supporting light, dark, and high-contrast themes with runtime switching
- Standardized component primitives/patterns (buttons, inputs, surfaces, badges, tables states)
- Motion system with reduced-motion compliance and reusable transitions
- Documentation and linting guidelines for consistent adoption

## Requirements

### Functional
- [ ] Define token schema: primitive + semantic tokens (CSS variables / Tailwind theme mapping)
- [ ] Implement theme provider enhancements for light/dark/high-contrast with persistence
- [ ] Standardize typography scale, spacing scale, border radii, elevation/shadows, z-index layers
- [ ] Create/normalize core primitives: Button, Input, Select, Badge, Card, Modal/Dialog, Tooltip, Table states
- [ ] Motion tokens and utilities (durations, easings) with `prefers-reduced-motion` support
- [ ] Status/semantic color system (success/warn/error/info/neutral) with accessible contrast
- [ ] Migration guide and codemods/checklist for adopting tokens in existing components
- [ ] Storybook/design docs integration (#028) for token and component documentation

### Non-Functional
- [ ] WCAG contrast compliance for text/UI states in all themes
- [ ] No visual regressions in core flows (validated by visual tests)
- [ ] Theme switch < 100ms perceived, no flash of incorrect theme
- [ ] Tree-shakeable/token-efficient implementation (minimal CSS bloat)

## Files to Modify / Create
```
apps/web/src/styles/
├── tokens/
│   ├── primitives.css
│   ├── semantic.css
│   ├── themes/
│   │   ├── light.css
│   │   ├── dark.css
│   │   └── high-contrast.css
│   └── motion.css
├── typography.css
└── globals.css (refactor)

apps/web/src/components/ui/
├── primitives/
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Select.tsx
│   ├── Badge.tsx
│   ├── Card.tsx
│   └── Dialog.tsx
├── theme/
│   ├── ThemeProvider.tsx (enhance)
│   └── useTheme.ts
└── index.ts

apps/web/tailwind.config.* (align with tokens)
docs/design-system/
├── tokens.md
├── theming.md
├── motion.md
└── migration-guide.md
```

## Acceptance Criteria
- Token-based theming works across light/dark/high-contrast without hardcoded overrides
- Core primitives standardized and adopted in key surfaces
- Contrast and reduced-motion requirements verified
- Migration path documented; new UI work uses tokens/primitives by default

## PR Guide
- Branch: `issue/046-frontend-design-system-theming`
- Phase 1: Token architecture + theme engine
- Phase 2: Core primitives + component normalization
- Phase 3: Migration of key screens + visual regression updates
- Phase 4: Docs, lint guidance, Storybook alignment
- Coordinate with #028 (Storybook) and #038 (Accessibility)

**Estimated effort:** 5-6 weeks (200 pts)