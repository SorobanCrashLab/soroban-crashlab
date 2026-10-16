# ADR 0010: Org → project tenancy with enforced scoping

- **Status:** Accepted
- **Issue:** #1894
- **Code:** `apps/web/src/lib/tenancy/`, `apps/web/src/lib/artifact-store.ts`, `apps/web/src/lib/api-scope-enforcer.ts`

## Context

Runs, artifacts and settings were stored in one global namespace. Team adoption
needs organisations and projects, and the failure mode of getting that wrong is
the worst one a multi-tenant product has: one tenant reading or changing
another's data (IDOR / tenant hopping). Retrofitting scoping onto live data
later means a migration under traffic, so the model and its enforcement land
first and existing stores move onto it in stacked follow-ups.

## Decision

### Model

`org → project → resources`. A `Membership` binds a principal (`github:<login>`,
`api-key:<id>`, `oidc:<identity>`) to an org, a set of its projects (or `*`)
and a role. Roles reuse `analyst`/`maintainer` so capability × scope composes
with existing RBAC.

### Enforcement

1. **Scope is a type, not a convention.** `TenantScope` is branded: only
   `resolveTenantScope` (membership-checked) and `systemTenantScope` (system
   jobs, grep-able) produce one. A hand-built `{ orgId, projectId }` does not
   type-check.
2. **Repositories take scope first, always.** `ScopedRepository` has no
   unscoped method. `tenancy-gate.test.ts` parses each module in
   `SCOPED_MODULES` and fails if an exported accessor or public method does not
   take `TenantScope` first, or if a raw store binding is exported.
3. **Storage keys are prefixed** `org/<org>/project/<project>/<collection>/<id>`
   for KV, MinIO/S3 objects and cache entries (`cache/` + the same prefix).
   Ids are validated before they are spliced into a key; relative keys reject
   `..`, `.`, empty segments, leading `/` and `\`.
4. **Ids are random** (`<prefix>_` + 128 random bits, base32), so a valid id
   for one tenant cannot be guessed from another's.
5. **Not found, not forbidden.** A lookup for another tenant's id returns
   `null`, identical to a missing record, so ids are not an existence oracle;
   the attempt is audited as `tenant.access.denied` (`cross_tenant`).
   Membership failures at scope resolution are audited too
   (`no_membership` / `not_a_member`).
6. **Request context**: the org/project a caller wants comes from session or
   token claims or the `x-crashlab-org` / `x-crashlab-project` headers
   (`api-scope-enforcer.ts`). It is a request, never a grant. Without one, a
   principal with exactly one reachable project gets it; anything ambiguous is
   denied.

### Threat analysis (isolation)

| Attack | Control | Test |
|---|---|---|
| IDOR: use tenant B's id with tenant A's session | prefix-scoped lookup + random ids; audited | property test (5 seeds × 400 ops) |
| Tenant hop: ask for B's org/project | membership check in `resolveTenantScope` | `denies and audits tenant hopping` |
| Path traversal in id/key (`../`) | id patterns + `joinTenantKey` | `rejects malformed ids` |
| Forgotten scope in a new store method | branded type + AST gate | `tenancy-gate.test.ts` |
| Unscoped object left in storage | `findUnscopedKeys` scan | storage-level scan assertions |
| Shared cache answer across tenants | cache keys carry the tenant prefix | `never shares a cache key` |
| Existence probing by id | not-found == foreign | property test asserts `null` |

### Migration

Existing data moves to `org/org_default/project/prj_default/legacy/<encoded key>`
with `runBackfill` (`apps/web/scripts/tenancy-backfill.ts`):

```bash
pnpm --dir apps/web exec jiti scripts/tenancy-backfill.ts --input export.json          # dry run + report
pnpm --dir apps/web exec jiti scripts/tenancy-backfill.ts --input export.json --apply --out migrated.json
```

Dry run is the default. Apply copies then deletes, never overwrites (a
differing target is reported as a conflict and the run exits non-zero), and
writes `<out>.report.json`. Deployment-wide keys (roles, audit log) are left in
place.

**Rollback:** `rollbackBackfill(store, report)` replays the report's moves in
reverse. The legacy key is recoverable from the target (`decodeURIComponent`),
so a lost report can be rebuilt from the `legacy/` prefix.

### Stack

1. Model + enforcement + isolation suite + backfill (this change). The
   in-memory artifact store is the first store on `ScopedRepository`.
2. Move the remaining stores (runs, settings, webhooks) onto
   `ScopedRepository`, adding each to `SCOPED_MODULES`.
3. Resolve scope in route handlers from the principal; CLI/env project context
   (`CRASHLAB_ORG_ID` / `CRASHLAB_PROJECT_ID`) for `crashlab-core`.
4. UI: org/project switcher.

## Consequences

- New stores cannot be written without a scope; the gate fails CI first.
- Cross-tenant ids look missing, which makes support debugging slightly harder;
  the audit log has the full picture.
- Until step 2 completes, stores outside `SCOPED_MODULES` remain single-tenant.
