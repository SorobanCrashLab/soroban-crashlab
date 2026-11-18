---
name: "Frontend: Public Share Links & Embeddable Dashboards - Secure External Sharing with Redaction and Expiry"
description: "Enable secure public/shareable links and embeddable dashboard widgets with scoped access, redaction controls, expiry/rotation, and view-only interactivity"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Teams cannot easily share run/campaign/analytics insights with external stakeholders without granting full platform access. There is no secure sharing/embedding mechanism.

Issues:
- No scoped share links for runs, crash reports, dashboards, or charts
- No redaction controls for sensitive fields/artifacts/tokens
- No expiration, revocation, rotation, or access analytics for shared links
- No embeddable widgets for status pages/docs/wiki
- Risk of accidental data exposure without governance

## Proposed Solution

Implement **Secure Sharing & Embeds**:
- Tokenized share links with scope (entity/view), permissions (view-only), and policy controls
- Redaction profiles and field-level masking for external viewers
- Expiry, password/SSO-gated options (configurable), revoke/rotate, access logs
- Embeddable iframes/components for dashboards and charts with theme/responsive options
- Admin governance and audit integration

## Requirements

### Functional
- [ ] Create/manage share links for runs, campaigns, dashboards, charts, reports
- [ ] Scope policies: included entities, time range, allowed filters/interactions
- [ ] Redaction/masking profiles for secrets, internal IDs, PII-like fields, artifact content
- [ ] Expiry, revoke, rotate token, optional access controls (password/domain allowlist)
- [ ] Public/embedded view pages with branding options and responsive layout
- [ ] Embed code generator (iframe/script) with theme/auto-resize params
- [ ] Access analytics (views, last accessed, referrer) and audit events
- [ ] Admin policy controls to enable/disable sharing per workspace

### Non-Functional
- [ ] Strong token entropy, hashed-at-rest tokens, constant-time validation
- [ ] Strict CSP/sandboxing for embeds; no privileged API access from public views
- [ ] Cache-safe public responses with correct invalidation on revoke/update
- [ ] Performance: shared views load < 2s with CDN-friendly assets

## Files to Modify / Create
```
apps/web/src/features/sharing/
├── ShareDialog.tsx
├── ShareLinksManager.tsx
├── RedactionProfileEditor.tsx
├── EmbedCodeGenerator.tsx
├── policy.ts
└── hooks/useShareLinks.ts

apps/web/src/app/share/
├── [token]/page.tsx
└── embed/[token]/page.tsx

apps/web/src/app/api/share-links/
├── route.ts
├── [id]/route.ts
├── [id]/revoke/route.ts
└── [id]/rotate/route.ts

apps/web/src/lib/sharing/
├── tokenService.ts
├── redaction.ts
└── accessLog.ts
```

## Acceptance Criteria
- Secure share links and embeds can be created, governed, revoked, and audited
- Redaction policies prevent sensitive data exposure in shared views
- Embedded dashboards render responsively with restricted capabilities
- Security review requirements satisfied (token handling, CSP, access control)

## PR Guide
- Branch: `issue/053-frontend-public-share-embeds`
- Phase 1: Tokenized share links + public view routes
- Phase 2: Redaction policies + governance controls
- Phase 3: Embeds + analytics + admin management
- Phase 4: Security hardening, CSP, tests/docs

**Estimated effort:** 5-6 weeks (200 pts)