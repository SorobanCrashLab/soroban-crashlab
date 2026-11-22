# Bulk Operations Framework (WIP)

Tracks issue #2272. This is an early scaffold, not a complete implementation.

`apps/web/src/app/runs-bulk-actions-utils.ts` and
`apps/web/src/features/runs/add-bulk-actions-for-runs.tsx` already implement bulk actions for
runs specifically. This scaffold is the generalized, entity-agnostic layer the issue asks for;
migrating the existing runs implementation onto it is not done here.

## Status

- [x] `SelectionManager` (page/all-filtered/manual selection modes)
- [x] `ActionRegistry` (entity-scoped action definitions, none registered yet)
- [x] Preflight stubs: permission check (always allows) and eligibility split
- [x] `resultReport.ts` (success/failure summary, `failedOnly` helper)
- [x] `BulkJobClient` (submits to `/api/bulk-jobs`, no polling/SSE yet)
- [x] `BulkActionBar`, `BulkConfirmDialog`, `BulkJobDrawer` component stubs
- [x] `bulk-jobs`, `bulk-jobs/[id]`, `bulk-jobs/[id]/retry` API route stubs (return `501`)
- [ ] Real background job execution with progress/cancellation
- [ ] Undo/rollback for reversible actions
- [ ] Real permission checks (wire to `apps/web/src/lib/permissions.ts`)
- [ ] Audit event emission per operation and per affected entity
- [ ] Migration of the existing runs-only bulk actions onto this framework
- [ ] Registration of entity-specific actions (runs, campaigns, crashes, artifacts)

## Code

- `apps/web/src/features/bulk-actions/`
- `apps/web/src/app/api/bulk-jobs/`

See the full requirements in issue #2272.
