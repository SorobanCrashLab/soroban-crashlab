# Unified State & Data Fetching Architecture (WIP)

Tracks issue #2276. This is an early scaffold, not a complete implementation.

TanStack Query is not a project dependency, so this scaffold is a minimal in-memory cache
(`SimpleQueryCache`) rather than a real query library — there's no request deduplication,
background refetch, or garbage-collection policy. `apps/web/src/app/providers.tsx` does not
exist yet, so nothing here is wired into the app.

## Status

- [x] `queryKeys.ts` typed key factory for runs/campaigns/crashes/integrations/settings
- [x] `SimpleQueryCache` (get/set/invalidate/invalidatePrefix)
- [x] `createResourceHook` generic fetch-and-cache hook, used by the per-domain `apiHooks/*`
- [x] `optimistic.ts` (manual rollback on mutation failure)
- [x] `invalidation.ts`, `conflicts.ts` (updatedAt-based conflict detection only)
- [x] `realtimeSync.ts` (patches one cache entry; not subscribed to any real SSE stream)
- [x] `devtools.ts` (console-only, dev-mode snapshot)
- [ ] Real query library integration (or a GC/retry/dedup policy if staying custom)
- [ ] `apps/web/src/app/providers.tsx` — does not exist; needs to be created to wire this in
- [ ] SSR-safe hydration boundaries for the App Router
- [ ] Pagination/infinite-scroll utilities compatible with the data-table platform (#2279)
- [ ] Real SSE/WebSocket subscription wiring for `realtimeSync.ts`
- [ ] Migration of ad-hoc fetch call sites onto this layer

## Code

- `apps/web/src/lib/data/`

See the full requirements in issue #2276.
