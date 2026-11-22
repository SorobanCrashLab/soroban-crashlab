# Rate Limiting

Per-principal rate limiting with identity-bound buckets and 429 semantics (#1810).

## Architecture

Two limiting layers cooperate in the proxy (`src/rate-limit.ts`):

### Layer 1: IP-keyed fixed-window (outer)

Keyed on `x-forwarded-for` / `x-real-ip`. Protects against unauthenticated floods
before any identity resolution runs. Default: 120 requests / 60 seconds,
overridable via `CRASHLAB_API_RATE_LIMIT_MAX_REQUESTS` and
`CRASHLAB_API_RATE_LIMIT_WINDOW_MS`.

### Layer 2: Principal-keyed sliding-window (inner)

Runs after `resolvePrincipal()` returns the caller's stable, secret-free subject
(e.g. `api-key:tok_abc`, `github:alice`, `anonymous`). Different principals never
share a bucket, so one abusive token cannot starve legitimate ones — even if
both come from the same shared NAT. Anonymous callers share a single
`'anonymous'` bucket, so unauthenticated flood after IP rotation is still capped.

## Route classes and policies

| Class             | Default limit | Window | Cost | Fail mode   |
|-------------------|---------------|--------|------|-------------|
| `default`         | 300 req/min   | 60 s   | 1    | fail-open   |
| `auth`            |  20 req/min   | 60 s   | 1    | fail-closed |
| `fuzz-trigger`    |  30 req/min   | 60 s   | 2    | fail-closed |
| `artifact-upload` |  60 req/min  | 60 s   | 3    | fail-closed |
| `replay`          |  30 req/min   | 60 s   | 2    | fail-closed |

### Environment variable overrides

| Env var                                | Default | Route class       |
|----------------------------------------|---------|-------------------|
| `CRASHLAB_RATE_LIMIT_DEFAULT`          | 300     | default           |
| `CRASHLAB_RATE_LIMIT_AUTH`             | 20      | auth              |
| `CRASHLAB_RATE_LIMIT_FUZZ_TRIGGER`     | 30      | fuzz-trigger      |
| `CRASHLAB_RATE_LIMIT_ARTIFACT_UPLOAD`  | 60      | artifact-upload   |
| `CRASHLAB_RATE_LIMIT_REPLAY`           | 30      | replay            |

## Fail-open vs fail-closed

| Route class         | Mode         | Rationale                           |
|---------------------|--------------|-------------------------------------|
| `auth`              | fail-closed  | brute-force protection is safety    |
| `fuzz-trigger`      | fail-closed  | resource exhaustion is safety      |
| `artifact-upload`   | fail-closed  | storage DoS is safety               |
| `default` (reads)   | fail-open    | availability > strict accounting    |

**Recommendation**: fail-closed for auth, fuzz, and upload routes; fail-open +
metric for read APIs. This is the default; adjust per class if needed.

## 429 response semantics

All 429 responses (both layers) emit:

- HTTP status `429 Too Many Requests`
- `Retry-After: <seconds>` header (at least 1)
- `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` headers
- JSON body: `{ "error": "...", "code": "RATE_LIMITED" }`

Neither layer echoes the caller's credential, token, or API key in the
response body or headers.

## Principal key derivation

The bucket key is `RbacPrincipal.subject` from `resolvePrincipal()`:

| Identity type                          | Subject format                           |
|---------------------------------------|------------------------------------------|
| Scoped API token                      | `api-key:<tokenId>`                      |
| Deployment API key                    | `api-key:env:CRASHLAB_WEBHOOK_API_KEY`   |
| GitHub session                        | `github:<login>`                         |
| OIDC session                          | `oidc:<identity>`                        |
| Anonymous                             | `anonymous`                              |

The subject is secret-free: `resolvePrincipal()` hashes secrets before using
them as lookup keys; the subject it returns is safe to log and use as a map key.

## Cost multiplier

Expensive operations (artifact upload, fuzz triggers) count as multiple units
so a high-cost operation exhausts the budget faster than cheap reads. The
`cost` field on `RateLimitPolicy` multiplies the number of units consumed per
request.

## Testing

Tests use an injected clock (`installTestLimiters(nowFn)`) so there are no real
sleeps. Coverage:

- Policy table resolution (class names, limits, costs, fail-mode flags)
- Route → class mapping (`resolveRouteClass`)
- `applyPrincipalRateLimit` — exhaustion, recovery, cost multiplier
- Principal isolation: two different subjects never share a bucket
- Anonymous subjects share one bucket (intended behaviour)
- 429 response carries `Retry-After` and `code: 'RATE_LIMITED'`
- 429 response does not echo the bearer token

Run:

```bash
pnpm --dir apps/web exec vitest run src/lib/rate-limit.test.ts
pnpm --dir apps/web exec vitest run src/rate-limit.test.ts
```

## Adding a new route class

1. Add the policy to `RATE_LIMIT_POLICIES` in `src/lib/rate-limit.ts`.
2. Add a `RouteClassRule` entry to `ROUTE_CLASS_RULES` mapping the route
   pattern to the new class name.
3. Add an env var override for the limit.
4. Add tests to `src/lib/rate-limit.test.ts` covering the new class.

## Follow-up route classes

The initial PR covers auth, fuzz-trigger, artifact-upload, and replay. Remaining
route classes listed as follow-ups:

- `webhook-delivery` — outbound webhook retry endpoints
- `integration-config` — integration configuration writes
- `audit-read` — audit log reads (high-volume dashboards)
