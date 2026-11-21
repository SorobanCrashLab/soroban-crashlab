# Audit Log Explorer (WIP)

Tracks issue #2284. This is an early scaffold, not a complete implementation.

Note: `apps/web/src/app/audit/AuditExplorer.tsx` already provides a basic audit log view. This
scaffold adds the pieces from issue #2284 that don't exist yet (correlation timeline, diff
viewer, saved queries) under `apps/web/src/features/security/audit-explorer/`; the two are not
yet merged into a single component.

## Status

- [x] Filter/table/event-drawer component stubs
- [x] Correlation timeline and diff viewer component stubs
- [x] Saved query list stub
- [x] `search` and `correlations` API route stubs (return `501`)
- [ ] Real search/query execution against persisted audit events
- [ ] Entity-centric correlated event chains across runs/triage/issues/webhooks
- [ ] Compliance export/evidence bundles with redaction controls
- [ ] RBAC/ABAC-gated field masking
- [ ] Live tail/stream mode
- [ ] Tamper-evidence/hash-chain indicators
- [ ] Server-side pagination for large volumes

## Code

- `apps/web/src/features/security/audit-explorer/`
- `apps/web/src/app/api/audit/{search,correlations}/route.ts`

See the full requirements in issue #2284.
