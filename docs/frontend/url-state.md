# Deep Linking & URL State Framework (WIP)

Tracks issue #2277. This is an early scaffold, not a complete implementation.

`apps/web/src/app/url-state-codec.ts` already implements a compressed, versioned codec for
the runs page's filter state. This scaffold generalizes the *schema/versioning* approach
across routes with zod validation, but is not a migration of that file — it's not deprecated
or touched here.

## Status

- [x] `defineRouteViewSchema` + zod-validated schemas for runs/runDetail/campaigns/analytics
- [x] `canonicalize.ts` (sorted keys, default omission)
- [x] `codec.ts` (encode/decode with safe fallback to defaults on parse failure)
- [x] `migrations.ts` (registry shape, no migrations registered yet)
- [x] `useRouteViewState` hook (App Router `replace`, no debouncing yet)
- [ ] Compression for large state (existing `url-state-codec.ts` already does this for runs
      and should inform the approach here)
- [ ] Debounced URL writes; push-vs-replace distinction for significant changes
- [ ] Multi-value/range/selection param support beyond what zod gives for free
- [ ] Integration with saved views (#2273), filters, comparison, and run workspace
- [ ] Error-recovery UX for invalid/expired links (currently falls back silently to defaults)
- [ ] Adoption on the actual run detail / campaigns / analytics pages

## Code

- `apps/web/src/lib/url-state/`

See the full requirements in issue #2277.
