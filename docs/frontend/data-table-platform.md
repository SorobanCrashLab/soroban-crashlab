# Unified Data Table Platform (WIP)

Tracks issue #2279. This is an early scaffold, not a complete implementation.

TanStack Table is not yet a project dependency, so `DataTable` is a plain `<table>`
implementation rather than being built on it as the issue's proposed solution specifies.

## Status

- [x] `types.ts` (column def, sort state, server query state shapes)
- [x] `DataTable` (plain table, no virtualization)
- [x] `DataTableToolbar`, `DataTablePagination` (cursor next/prev only)
- [x] `ColumnManager` (visibility toggle only — no reorder/resize/pin)
- [x] `useServerTableState` (sort/filter state, no URL sync yet)
- [x] `useColumnPersistence` (localStorage visibility/order only)
- [x] `rowSelection.ts` (toggle/clear; no "select all filtered")
- [ ] TanStack Table / virtualization integration for 60fps on large datasets
- [ ] URL state sync (#056)
- [ ] Column resize/reorder/pin persistence
- [ ] Bulk action integration (#051), row expansion, contextual menus
- [ ] Migration of runs/regression/flaky-test/webhook/audit tables onto this platform
- [ ] Full keyboard/ARIA grid navigation (existing `data-table-keyboard-nav-utils.ts` not
      yet integrated here)

## Code

- `apps/web/src/components/data-table/`

See the full requirements in issue #2279.
