# Saved Views & Shareable Workspace Links (WIP)

Tracks issue #2273. This is an early scaffold, not a complete implementation.

`apps/web/src/app/saved-views/` already implements a versioned URL codec and local-only
named views, but only for the runs page. This scaffold generalizes the *schema* across pages
with team/workspace scope, but is not yet migrated onto the real runs implementation and has
no server-side persistence.

## Status

- [x] `viewSchema.ts` (cross-page record with scope/query/layout/columns)
- [x] `urlCodec.ts` (basic encode/decode, no size-safe compression)
- [x] `versioning.ts` (in-memory version history/restore)
- [x] `SaveViewDialog`, `ViewsMenu`, `ManageViewsPage` component stubs
- [x] `saved-views`, `saved-views/[id]`, `saved-views/[id]/versions` API route stubs
      (return `501`)
- [ ] Server-side persistence and team/workspace scoping with RBAC/ABAC
- [ ] Migration from the existing runs-only local view store without data loss
- [ ] Size-safe URL compression for complex state
- [ ] Default-view-per-page behavior and fallback rules
- [ ] Pin/favorite, search/filter, archive in the manage-views UI
- [ ] Flicker-free two-way URL sync

## Code

- `apps/web/src/features/saved-views/`
- `apps/web/src/app/api/saved-views/`

See the full requirements in issue #2273.
