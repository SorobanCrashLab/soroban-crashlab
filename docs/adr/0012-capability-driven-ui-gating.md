# ADR 0012: Capability-driven UI gating and 403 recovery

**Status:** Accepted
**Date:** 2026-10-19

## Context

The API already authorizes every mutating request in [`proxy.ts`](../../apps/web/src/proxy.ts)
against a role from [`rbac.ts`](../../apps/web/src/lib/rbac.ts) and the declarative
route registry in [`route-catalog.ts`](../../apps/web/src/lib/route-catalog.ts)
(W5-C15). A request the caller's role does not cover answers
`403 { error: { code: 'FORBIDDEN_INSUFFICIENT_ROLE', requiredRole } }`.

The UI ignored that policy. It rendered destructive and administrative controls
for every visitor — bulk delete, replay, API-token create/rotate/revoke, role
assignment/revocation, notification and Sentry settings, campaign launch — and
turned the server's 403 into a dead end: a raw error, a stalled spinner, or a
console-only failure with nothing on screen explaining what was missing or how to
get it. The local `crashlab:maintainer-mode` toggle made this worse by revealing
maintainer surfaces whose writes still failed server-side.

The client needs to mirror *what the server already decided*, without becoming a
second security boundary: hiding a button must never be the reason a write is
blocked, and a broken capability lookup must never lock a maintainer out of an
admin page the server would allow.

## Decision

**1. Capabilities are derived from the route catalog, never restated.**
[`apps/web/src/lib/permissions.ts`](../../apps/web/src/lib/permissions.ts) defines
a registry of 13 capability codes (`runs:delete`, `settings:write`,
`roles:manage`, `tokens:manage`, …). Each entry lists `${METHOD} ${path}`
selectors into the route catalog; `requiredRoleForCapability()` derives the
required role from those entries. A catalog change therefore changes the UI
automatically, and consistency tests fail if a selector does not resolve. The
caller's role comes from `GET /api/settings/roles/me`, resolved server-side with
the same principal lookup the API authorizes with.

**2. Deny while the role is unknown; never be optimistic.**
`useEffectiveAccess()` caches the snapshot module-side for 30 seconds, joins
in-flight requests, revalidates on focus/visibility, and reports `loading` until
a role is known. `Can` denies while loading. This avoids a flash of enabled
controls that a non-maintainer could click.

**3. Deny with an explanation, in place, by default.**
[`Can.tsx`](../../apps/web/src/components/Can.tsx) has two modes: `hidden` (for
duplicative menu entries) and `disabled` (the default for unique affordances). A
disabled gate adds `disabled`, a `title` with the full reason, an
`aria-describedby` link and a visible note naming the capability, the role it
needs, the current role and who manages assignments. `showNote={false}` lets a
page attach one shared note (tokens card, campaign launch) instead of repeating
it per control. Hiding is reserved for controls whose absence the surrounding
explanation already covers.

**4. Routes fail open on lookup errors; actions fail closed.**
[`RequireCapability.tsx`](../../apps/web/src/components/RequireCapability.tsx)
redirects an unauthorized caller to `/403?capability=…&from=…` with
`router.replace` (soft) or `window.location.replace` (hard). If the role lookup
itself fails, the guard renders the page: the server still authorizes every
request, so a broken mirror must not block an admin page. Actions remain denied
until the role is known, because the UI is where dead ends are prevented.

**5. `/403` is a recovery surface, not an error dump.**
[`403/page.tsx`](../../apps/web/src/app/403/page.tsx) reads the missing capability
and originating page from the query string and explains: the capability label and
code, the required role versus the caller's role, the number of maintainers on
the deployment, the caller's identity, and where assignments are managed
(Settings → Roles). It offers Back and Home, and points anonymous visitors at
sign-in. Without parameters it degrades to a generic explanation.

**6. Settings → Roles shows the whole matrix.**
The page stays readable to analysts; Assign and Revoke are disabled in place with
the shared explanation, and a capability matrix lists every capability, its code,
what it covers, the role derived from the catalog, and whether the current caller
holds it. When an entire page's controls are gated, the matrix is the durable
explanation instead of a one-off note.

**7. The local maintainer toggle is discoverability, not authority.**
`/maintainer` and the nav entry are allowed by the server capability
`settings:write` **or** the local `crashlab:maintainer-mode` flag, so the
documented developer workflow keeps working on deployments where the operator has
not been granted a role. Every write control inside those surfaces remains
capability-only — enabling local mode never re-enables a control the server would
reject.

**8. Scope stays with the server.**
Token *scope* enforcement (`api-scope-enforcer.ts`) and API-key capabilities are
a separate axis and are not modelled here. Read-only routes are not gated. The 2
session-auth Sentry routes are mapped to `settings:write` so every session-auth
mutating route has a capability.

## Rationale

- **One source of truth.** Roles come from the catalog the server enforces, so
  the UI cannot drift into a conflicting policy; the parity and selector tests
  make drift a test failure.
- **Discoverability over concealment.** Showing a disabled control with a reason
  and a path to request access is more useful than silently removing it,
  especially for new analysts who do not know the capability model exists.
- **Dead ends are the bug.** The issue is not that the server returns 403 — it is
  that the UI let the user walk into it. Gating removes the walk; `/403` explains
  the rare redirects (deep links, bookmarks, stale tabs).
- **Fail-open at the route, fail-closed at the action.** The server is the
  authority; an unavailable mirror should reduce explanation quality, not
  availability of a page the server would serve.

## Consequences

- **Positive:** Gated controls no longer fire requests that end in 403; denial
  copy is consistent, accessible (title + described-by + visible note) and
  localised in one module; the capability matrix documents the model; catalog
  changes flow into the UI.
- **Negative:** A UI mirror is another place that can be stale. Cached access can
  lag a role grant by up to the 30 s stale window or until focus; and CI has no
  maintainer credential, so the granted half of the matrix is covered by unit
  tests rather than end-to-end.
- **Mitigations:** Revalidation on focus/visibility plus `invalidateAccessCache()`
  for future session transitions; unit tests assert registry↔catalog
  consistency, derived roles, analyst grants, RBAC parity and the access cache;
  the allowed half is exercised by `Can`/`RequireCapability` render tests with a
  primed maintainer snapshot and can be spot-checked manually with a maintainer
  API key.

## Compliance & Verification

- `apps/web/src/lib/permissions.test.ts` — registry ↔ catalog consistency,
  derived roles, analyst/maintainer grants, RBAC parity, route mapping,
  explanations, access-cache behaviour.
- `apps/web/src/components/Can.test.tsx`,
  `RequireCapability.test.tsx`, `apps/web/src/app/403/page.test.tsx` — render
  states: loading, allowed, denied, external note, bypass, fail-open.
- `apps/web/e2e/forbidden.spec.ts` — redirect URL, 403 copy, navigation, generic
  fallback, fail-open when `/api/settings/roles/me` is down.
- `apps/web/e2e/no-403-on-click.spec.ts` — walks every gated control as an
  analyst (with local maintainer mode off and on) and asserts no
  `FORBIDDEN_INSUFFICIENT_ROLE` response and no gated write is attempted.
- `apps/web/e2e/a11y.spec.ts` scans `/403` as a core route.
- [`docs/contributors/architecture.md`](../contributors/architecture.md#c-dashboard-request-path)
  documents the client mirror in the dashboard request path.
