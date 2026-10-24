# ADR 0012: Keyset pagination — cursor contract and snapshot consistency

**Status:** Accepted
**Issue:** #1834
**Code:** `apps/web/src/app/pagination-utils.ts`, `apps/web/src/app/api/runs/route.ts`,
`apps/web/src/app/api/artifacts/route.ts`, `apps/web/src/app/api/audit/route.ts`,
`apps/web/src/lib/audit/audit-query.ts`

## Context

Every list endpoint an operator triages from — runs, artifacts, audit — paginated
over data that mutates while the user scrolls. Offset cursors drift under inserts
(rows shift between pages), unstable sorts on non-unique keys (identical
`queuedAt`/`updatedAt` timestamps from batch creations) let page boundaries fall
back to storage or memory iteration order, and nothing property-tested the
no-loss/no-duplicate guarantee. The visible failure mode is a dashboard that
silently drops or duplicates rows mid-triage, which erodes trust in everything
else on the page.

## Decision

### 1. Keyset pagination on a `(sort_key, id)` composite with total ordering

All list routes page with `paginateKeyset` (runs, artifacts) or the audit
sequence keyset (audit). The `id` tiebreaker is mandatory: when primary sort
keys collide the id strictly disambiguates position, so the order is total and
independent of insertion or memory order. Pages are cut by "strictly after the
cursor in this total order", never by numeric offset.

### 2. Cursors are opaque, versioned, and bound to the query's sort/filter

Cursor payloads are base64 of a JSON document. v2 payloads carry
`{ v: 2, sortKey, id, scope }` where `scope` is an FNV-1a fingerprint
(`computeCursorScope`) of the route, sort direction and active filters.
Replaying a cursor after changing a filter (e.g. `status=failed` →
`status=running` mid-scroll) returns **400 `CURSOR_MISMATCH`** instead of a
silently misaligned page. Legacy offset cursors and unversioned v1 payloads
carry no scope proof and reset gracefully to page 1 (logged). Cursors minted by
a future server version (`v` ≠ 2) are rejected explicitly rather than
misread.

### 3. Snapshot-consistency policy at page boundaries

Pages are cut from a live scan, not a frozen snapshot (the storage backends —
KV, filesystem, in-memory — have no multi-page snapshot read). The guarantee,
enforced by property tests with fixed CI seeds:

- A row present for the entire pagination pass is returned **exactly once** —
  no loss, no duplicates — regardless of concurrent inserts or deletes.
- A row inserted mid-pass **may or may not** appear: keyset cannot see rows
  that sort before the cursor. This is the documented "no phantom guarantee
  window" — there is no snapshot watermark.
- A row deleted mid-pass may vanish before being seen; it is never duplicated.
- `total` is a point-in-time count at the moment each page is served and may
  drift between pages; `hasMore`/`nextCursor` are the continuation contract.

An as-of watermark was rejected: none of the current storage backends can
honor one without a versioned multi-version store, and the audit log already
solves the equivalent problem differently (append-only `sequence` keyset).

### 4. Uniform response envelope

Every paginated list route returns `nextCursor` (opaque string or `null`) and
`hasMore` (boolean) inside its data payload, plus `total` where a cheap count
exists. The contract is documented in the OpenAPI registry (`paginated: true`)
per the W5-D13 generated-spec work.

## Rationale

- Keyset pagination is the only scheme that is correct under concurrent inserts
  without snapshot reads; offset pagination cannot be patched into correctness.
- Binding the cursor to the filter set converts a silent data-integrity bug
  (triaging the wrong page) into an explicit, recoverable client error.
- Graceful reset for legacy cursors avoids stranding clients holding old
  bookmarks, while versioned rejection prevents cross-version misinterpretation.
- Property tests with deterministic seeds catch the entire bug class (drift,
  boundary duplicates, tie instability) rather than the three hand-picked cases.

## Consequences

- **Positive:** Dashboards no longer drop or duplicate rows mid-triage; filter
  changes mid-scroll fail loudly; the envelope is uniform and machine-readable.
- **Negative:** Cursors are not interchangeable across filter changes — clients
  must restart from page 1 (the UI already resets its cursor when filters are
  re-applied). `total` remains a live count, not a snapshot count.
- **Mitigations:** Legacy cursors reset instead of erroring; 400
  `CURSOR_MISMATCH` messages tell the client exactly how to recover; the audit
  UI resets cursors on filter changes and is covered by the same contract.

## Compliance & Verification

- `src/app/pagination-property.test.ts` — fixed-seed property tests: random
  insert (and insert+delete) interleavings between page fetches assert set
  equality over expected ids (no loss, no dup), strict `(sortKey, id)`
  monotonicity, and scope-mismatch rejection.
- `src/lib/audit/audit-query.property.test.ts` — same properties for the
  append-only audit sequence keyset.
- Route tests: `runs/route.test.ts` (cursor round-trip, `CURSOR_MISMATCH` on
  status change), `artifacts/route.integration.test.ts` (pagination under
  timestamp ties, tampered-scope cursor rejection).
- `src/lib/openapi/route-registry.drift.test.ts` keeps the registry (and thus
  the documented envelope) in lockstep with the handlers.
