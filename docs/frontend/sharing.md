# Public Share Links & Embeddable Dashboards (WIP)

Tracks issue #2274. This is an early scaffold, not a complete implementation.

## Status

- [x] Token generation stub (`crypto.randomBytes`, not yet hashed-at-rest or persisted)
- [x] Redaction profile (flat deny-list only) and in-memory access-log stubs
- [x] Share dialog, links manager, redaction editor, embed-code generator component stubs
- [x] Public `/share/[token]` and `/share/embed/[token]` placeholder pages (no token validation)
- [x] `share-links`, `share-links/[id]`, `revoke`, `rotate` API route stubs (return `501`)
- [ ] Real persistence and hashed-at-rest tokens with constant-time validation
- [ ] Scope policies beyond entity/expiry (allowed filters/interactions, time range enforcement)
- [ ] Password/SSO-gated access, domain allowlists
- [ ] CSP/sandboxing hardening for embeds; no privileged API access from public views
- [ ] Access analytics aggregation and audit event integration
- [ ] Admin governance controls (enable/disable sharing per workspace)
- [ ] Cache invalidation on revoke/update

## Code

- `apps/web/src/features/sharing/`
- `apps/web/src/lib/sharing/`
- `apps/web/src/app/share/`
- `apps/web/src/app/api/share-links/`

See the full requirements in issue #2274.
