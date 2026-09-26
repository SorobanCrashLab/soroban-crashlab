# Changelog

All notable project changes should be recorded here by maintainers as part of the release process.

The format is intentionally lightweight:

- Keep an `Unreleased` section during normal development.
- Move items from `Unreleased` into a dated release section when tagging a release.
- Call out breaking changes, schema changes, and required maintainer actions explicitly.

## Unreleased

### Added

- Identity-bound RBAC: roles resolve from a persisted role store keyed by a verified principal (API token id, or signed GitHub session) instead of from request configuration. Adds `CRASHLAB_GITHUB_SESSION_SECRET`, `CRASHLAB_GITHUB_SESSION_TTL_SECONDS`, `CRASHLAB_RBAC_AUDIT_RETENTION_DAYS`, `CRASHLAB_RBAC_AUDIT_MAX_ENTRIES` and `CRASHLAB_RBAC_ROLE_AUDIT_MAX_ENTRIES`.
- Key/value record driver layer (`lib/storage/record-driver.ts`) backing role assignments and both audit logs, with an Upstash Redis driver and an in-memory default.
- Append-only RBAC authorization audit with retention, replacing the 500-entry in-process ring buffer. Entries record the resolved principal, so a decision can be traced back to who made it.
- `GET /api/settings/roles/me`, reporting the caller's resolved identity, role and capabilities from the same lookup the server authorizes with.
- GitHub OAuth callback now issues a signed session cookie when a session secret is configured.

### Changed

- `checkRbacPermission`, the rate-limit/proxy entry point and the middleware are now async, because resolving a role reads persisted state.
- `lib/storage/role-store.ts` operations are now async and driver-backed.
- RBAC denial envelopes include the resolved `principal` alongside `requiredRole` and `currentRole`.
- Settings → Role Management now shows the caller's effective access and explains that roles are identity-bound.
- Closed auto-generated stub issues #924, #925, #926, #927 (no acceptance criteria defined; TBD placeholders with no actionable work).

### Fixed

- Roles can no longer be escalated by sending `x-crashlab-role` (or its alias, or a `role` query parameter, cookie, or body field) — the dev override header is gone in every environment, not just production.
- The RBAC audit log no longer lives in a module-level array that a fresh serverless instance starts out empty.

### Breaking changes

- The `x-crashlab-role` and `x-crashlab-principal-role` request headers are no longer honoured, in development or test. Scripts that relied on them must present an API token or a GitHub session instead.
- `checkRbacPermission` and the rate-limit `proxy` return promises; direct callers must await them.
- `assignRole`, `revokeRole`, `getRoleAssignment`, `listRoleAssignments`, `countMaintainers`, `listAuditLogs` and `getAuditLogsForIdentity` return promises.
- `RbacAuditEntry` now carries `id` and `principalSubject` and no longer carries a caller-supplied `timestamp`.
