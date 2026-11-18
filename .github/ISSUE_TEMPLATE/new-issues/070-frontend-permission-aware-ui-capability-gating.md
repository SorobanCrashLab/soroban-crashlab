---
name: "Frontend: Permission-Aware UI & Capability Gating Framework - Consistent RBAC/ABAC UX, Safe Actions, and Access Explanations"
description: "Implement a unified capability-gating framework for the frontend so every route, action, and data surface reflects RBAC/ABAC policies with clear explanations, safe fallbacks, and no privileged UI leakage"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p0"]
---

## Problem Statement

As access control evolves (RBAC now, ABAC #022), the frontend inconsistently exposes actions/routes that users cannot perform, leading to confusing 403s, partial renders, and potential information leakage.

Issues:
- Action buttons/menus/routes shown without capability checks; failures discovered late
- Inconsistent handling of read-only vs hidden vs disabled states
- No user-facing explanation of why access is denied and how to request it
- Table/bulk actions, deep links, and realtime-updated UI can bypass intended gating
- Hard to audit UI-to-policy mapping and keep it aligned with backend enforcement

## Proposed Solution

Build a **Capability Gating Framework**:
- Central capability registry mapping UI actions/routes/components to policy checks
- Hooks/components (`<Can>`, `useCapability`, guarded routes/menus/actions) with typed capabilities
- Consistent UX patterns: hide, disable-with-reason, request-access CTA, and denied-state pages
- Server-hydrated capability snapshot + client refresh on role/policy/session changes
- Policy explanation layer ("missing role/scope/resource attribute") with safe, non-sensitive messaging

## Requirements

### Functional
- [ ] Typed capability catalog covering navigation, pages, entity actions, bulk operations, settings, integrations, and admin tools
- [ ] Route guards and component/action guards with SSR/CSR parity
- [ ] UI patterns: hidden vs disabled vs read-only vs redacted, with standardized tooltips/banners
- [ ] "Why can't I?" explanations and request-access workflow hooks (link/contact/admin request)
- [ ] Capability-aware menus, table row actions, command palette results, and deep-link fallbacks (#004/#058/#056)
- [ ] Real-time capability refresh on session/role/policy changes; optimistic UI rollback on denied mutation
- [ ] Developer lint/check tooling to detect ungated privileged actions in critical surfaces
- [ ] Telemetry for denied-action encounters (privacy-safe) to improve UX and policy clarity

### Non-Functional
- [ ] No reliance on client checks for security; backend remains source of enforcement
- [ ] Capability evaluation fast and cacheable; no render thrash
- [ ] Zero leakage of restricted resource existence/details in unauthorized contexts
- [ ] Accessible denied/disabled states with proper semantics (`aria-disabled`, focus behavior)
- [ ] Comprehensive test matrix for roles/scopes/resource constraints

## Files to Modify / Create
```
apps/web/src/lib/auth/capabilities/
├── capabilityRegistry.ts
├── types.ts
├── evaluate.ts
└── explanations.ts

apps/web/src/components/authz/
├── Can.tsx
├── CapabilityGate.tsx
├── AccessDeniedState.tsx
└── RequestAccessCta.tsx

apps/web/src/hooks/useCapability.ts
apps/web/src/app/(guards)/protected-route.tsx
apps/web/src/lib/route-guard.ts (enhance)
docs/security/permission-aware-ui.md
```

## Acceptance Criteria
- Privileged routes/actions consistently gated with clear, safe UX across the app
- Capability checks align with backend policy definitions and update on session changes
- Unauthorized deep links and realtime UI changes degrade gracefully without data leakage
- Lint/tests catch common ungated-action regressions in critical modules

## PR Guide
- Branch: `issue/070-frontend-permission-aware-ui-capability-gating`
- Phase 1: capability registry + core guards/hooks/components
- Phase 2: route/navigation/action integration in high-risk surfaces
- Phase 3: explanations/request-access UX + telemetry + dev checks
- Phase 4: audit hardening, a11y, full test matrix
- Coordinate with #022/#042/#054/#063; frontend gating complements, never replaces, server enforcement

**Estimated effort:** 5-6 weeks (200 pts)
