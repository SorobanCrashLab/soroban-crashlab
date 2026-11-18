---
name: "Frontend: API Keys & Access Tokens Management - Scoped Tokens, Rotation, Usage Analytics & Developer UX"
description: "Build a secure, developer-friendly API key and access token management UI with scoped permissions, expiration/rotation, usage analytics, and incident response controls"
labels: ["wave4", "complexity:high", "area:web", "type:feature", "priority:p1"]
---

## Problem Statement

Programmatic access is essential for CI/integrations/automation, but key/token management UX is weak or absent. Current auth utilities (`api-key-auth.ts`, scopes, permissions) need a full management surface.

Issues:
- No UI for creating scoped API keys/tokens with least privilege
- No rotation/expiry workflows or last-used visibility
- No usage analytics/rate-limit insights per key
- No quick revoke/disable on suspected compromise
- Poor developer ergonomics (copy-once secrets, examples, integration guides)

## Proposed Solution

Implement **API Keys & Tokens Console**:
- Create/list/revoke/rotate keys with scopes, resource constraints, expiry
- One-time secret display with secure regeneration flows
- Usage analytics (requests, errors, rate limits, last used, source IP hints where safe)
- Incident actions: disable, revoke all, rotate, audit trail
- Developer UX: code snippets, curl examples, scope explanations

## Requirements

### Functional
- [ ] Token management UI: create, name/description, scopes, resource filters, expiry, status
- [ ] One-time reveal of secret at creation/rotation; never show plaintext again
- [ ] Rotation with overlap period and grace window; immediate revoke option
- [ ] Usage dashboard per token: request volume, error rate, rate-limit hits, last used timestamp
- [ ] Key states: active, expiring soon, expired, revoked, disabled
- [ ] Incident controls: disable/revoke, "revoke all for user/workspace" (permission-gated)
- [ ] Audit log integration for all token lifecycle actions
- [ ] Developer docs/snippets per scope/use case (CI, webhooks, read-only analytics)

### Non-Functional
- [ ] Secrets hashed/encrypted at rest; no plaintext storage/logging
- [ ] Strong entropy generation and secure comparison
- [ ] Accessible and clear UX to prevent accidental over-permissioning
- [ ] Scales to thousands of tokens per workspace

## Files to Modify / Create
```
apps/web/src/features/developer/access-tokens/
├── TokenList.tsx
├── CreateTokenDialog.tsx
├── TokenDetails.tsx
├── TokenUsagePanel.tsx
├── RotateTokenDialog.tsx
└── hooks/useAccessTokens.ts

apps/web/src/app/settings/api-keys/ (new or enhance)
apps/web/src/app/api/tokens/
├── route.ts
├── [id]/route.ts
├── [id]/rotate/route.ts
└── [id]/usage/route.ts

apps/web/src/lib/auth/
├── api-key-auth.ts (enhance)
├── tokenScopes.ts
└── tokenUsage.ts

docs/developer/
├── api-keys.md
└── token-security.md
```

## Acceptance Criteria
- Users can safely create, scope, rotate, and revoke tokens with full auditability
- Token usage and health visible for troubleshooting integrations
- No plaintext secrets exposed after creation; security controls verified
- Developer onboarding for programmatic access significantly improved

## PR Guide
- Branch: `issue/054-frontend-api-keys-token-management`
- Phase 1: Token model + secure create/list/revoke
- Phase 2: Rotation/expiry + scopes/resource constraints
- Phase 3: Usage analytics + incident controls
- Phase 4: UX polish, docs, tests

**Estimated effort:** 4-5 weeks (200 pts)