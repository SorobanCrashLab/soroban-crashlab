# API Reference

This document describes the HTTP API exposed by the Soroban CrashLab web
dashboard. All endpoints are implemented as [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
under `apps/web/src/app/api/` and are served from the same origin as the
dashboard (default `http://localhost:3000`).

For how these routes fit into the wider system, see the
[Architecture Guide](ARCHITECTURE.md). For the environment variables that
configure backend proxying and integrations, see
[Environment Variables](ENV.md).

---

## Conventions

### Base URL

All routes are relative to the dashboard origin and namespaced under `/api`:

```
http://localhost:3000/api/<route>
```

### Backend proxying

Several routes are **proxy-aware**. When the relevant environment variable is
set (for example `NEXT_PUBLIC_API_URL`, `RUNS_API_URL`, or `ISSUES_API_URL`),
the route forwards the request to the upstream backend and returns its
response. When the variable is unset, the route falls back to deterministic
**mock data** or an in-process **in-memory store** so the dashboard is fully
usable in local development. In-memory stores persist only for the lifetime of
the server process.

### Response envelopes

Routes use one of two JSON shapes:

1. **Wrapped** — routes built on the shared helpers in
   `lib/api-response-utils.ts` return a `data` envelope:

   ```json
   { "data": { "...": "..." }, "total": 0 }
   ```

   (`total` is included only for collection responses.)

2. **Direct** — some routes return the resource object directly without a
   `data` wrapper (noted per route below).

Errors are always returned as:

```json
{ "error": "Human readable message" }
```

### Status codes

| Code | Meaning |
| --- | --- |
| `200 OK` | Request succeeded |
| `201 Created` | Resource created |
| `400 Bad Request` | Missing or malformed input |
| `403 Forbidden` | Operation not permitted (e.g. deleting a built-in network) |
| `404 Not Found` | Resource does not exist |
| `409 Conflict` | Duplicate resource or replay signature mismatch |
| `413 Payload Too Large` | Request body exceeds the route limit |
| `422 Unprocessable Entity` | Input failed validation |
| `500 Internal Server Error` | Unhandled server error |
| `502 Bad Gateway` | Upstream backend error |
| `503 Service Unavailable` | Backend unavailable and no mock fallback |

---

## Route summary

| Method(s) | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/runs` | List fuzzing runs |
| `GET` | `/api/runs/{id}` | Get a single run |
| `POST` | `/api/runs/{id}/replay` | Replay a run's crashing seed |
| `GET` `POST` `DELETE` | `/api/runs/{id}/tags` | Manage run tags |
| `GET` `POST` `DELETE` | `/api/runs/{id}/annotations` | Manage run annotations |
| `GET` `POST` `DELETE` | `/api/runs/{id}/issues` | Manage linked issues |
| `GET` `POST` | `/api/artifacts` | List / upload artifacts |
| `GET` `DELETE` | `/api/artifacts/{id}` | Download / delete an artifact |
| `POST` | `/api/artifacts/validate` | Validate a case bundle |
| `GET` `PUT` | `/api/settings/alerting` | Read / replace alerting settings |
| `GET` `POST` | `/api/networks` | List / add networks |
| `GET` `PUT` | `/api/networks/active` | Read / switch the active network |
| `DELETE` | `/api/networks/{id}` | Delete a custom network |
| `POST` | `/api/campaigns` | Queue a fuzzing campaign |
| `GET` | `/api/notifications` | Notification feed (optional) |
| `GET` `POST` `PATCH` `DELETE` | `/api/webhooks` | Manage outbound webhooks |
| `GET` | `/api/health/metrics` | Metrics system health check |
| `GET` | `/api/integrations/prometheus/health` | Prometheus exporter health |
| `GET` `POST` | `/api/integrations/pagerduty/config` | Read / save PagerDuty config |
| `GET` | `/api/integrations/pagerduty/alerts` | Recent PagerDuty alerts |
| `POST` | `/api/integrations/pagerduty/test-connection` | Test a PagerDuty key |
| `POST` | `/api/integrations/pagerduty/trigger` | Trigger a PagerDuty incident |
| `GET` | `/api/auth/github/callback` | GitHub OAuth callback |

---

## Runs

### `GET /api/runs`

List fuzzing runs. Query parameters are sanitized and forwarded to the upstream
runs backend when `NEXT_PUBLIC_API_URL` is configured; otherwise mock runs are
returned.

**Response** `200` (wrapped):

```json
{ "data": { "runs": [ /* FuzzingRun[] */ ] }, "total": 12 }
```

If the upstream backend is configured but unreachable, returns `503` with
`{ "error": "Backend unavailable", "runs": [], "total": 0 }`. If mock data is
disabled (`NEXT_PUBLIC_ENABLE_MOCK_DATA=false`) and no backend is configured,
returns `503`.

### `GET /api/runs/{id}`

Get a single run by id. Proxies to `RUNS_API_URL` when set, otherwise resolves
from mock data. Responses are sent with `Cache-Control: no-store`.

**Response** `200` (direct): a `FuzzingRun` object.

**Errors:** `400` if `id` is missing, `404` if the run is not found, `502` on
upstream error.

### `POST /api/runs/{id}/replay`

Rebuild the crashing seed for a run into a replay bundle and execute the
`crashlab replay seed` CLI against `contracts/crashlab-core`. Runs on the
Node.js runtime.

**Response** `200` (wrapped) — `data` contains:

| Field | Type | Description |
| --- | --- | --- |
| `ok` | `boolean` | Whether the replay reproduced cleanly |
| `runId` | `string` | Source run id |
| `newRunId` | `string` | Generated id for the replay run |
| `bundleJson` | `string` | Serialized replay bundle document |
| `command`, `args` | `string`, `string[]` | CLI invocation used |
| `stdout`, `stderr` | `string` | Captured CLI output |
| `exitCode` | `number` | CLI exit code |

**Errors:** `400` if `id` is missing, `404` if the run is not found, `422` if
the run has no replayable crash detail, `409` on a replay signature mismatch
(`stderr` contains `replay mismatch:`), `502` on other CLI failures, `500` on
unexpected errors.

### `GET|POST|DELETE /api/runs/{id}/tags`

Manage the tag list for a run (in-memory, seeded from the run's initial tags).

- **`GET`** → `200` `{ "runId": "...", "tags": ["..."] }`
- **`POST`** body `{ "tag": "string" }` → `201` with the updated tag list.
  `400` if `tag` is missing/empty or rejected by the normalizer.
- **`DELETE`** body `{ "tag": "string" }` → `200` with the updated list.
  `404` if the tag is not present.

All methods return `404` if the run does not exist.

### `GET|POST|DELETE /api/runs/{id}/annotations`

Manage free-text annotations for a run (in-memory, seeded from the run).

- **`GET`** → `200` `{ "runId": "...", "annotations": ["..."] }`
- **`POST`** body `{ "text": "string" }` → `201` with the updated list.
  `400` if `text` is missing/empty or exceeds 500 characters.
- **`DELETE`** body `{ "index": 0 }` → `200` with the updated list.
  `400` if `index` is not an integer or is out of range.

All methods return `404` if the run does not exist.

### `GET|POST|DELETE /api/runs/{id}/issues`

Manage external issue links associated with a run. `GET` proxies to
`ISSUES_API_URL` / `NEXT_PUBLIC_API_URL` when configured.

- **`GET`** → `200` `{ "runId": "...", "issues": [ { "label": "...", "href": "..." } ] }`
- **`POST`** body `{ "label": "string", "href": "https://..." }` → `201`.
  `400` if `label`/`href` are missing or `href` is not an `http(s)` URL;
  `409` if the link already exists.
- **`DELETE`** body `{ "href": "https://..." }` → `200`.
  `404` if the link is not found.

All methods return `404` if the run does not exist.

---

## Artifacts

### `GET /api/artifacts`

List stored artifact metadata.

**Response** `200` (direct):

```json
{ "artifacts": [ /* ArtifactMetadata[] */ ], "total": 3 }
```

### `POST /api/artifacts`

Upload an artifact. Accepts `multipart/form-data` with a `file` field.

**Response** `201` (wrapped): `{ "data": { "artifact": { /* metadata */ } } }`.

**Errors:** `400` if `file` is missing or not a file.

### `GET /api/artifacts/{id}`

Download an artifact's raw bytes.

**Response** `200` with `Content-Type: application/octet-stream`,
`Content-Disposition: attachment; filename="..."`, and `Content-Length`.

**Errors:** `400` if `id` is missing, `404` if the artifact is not found.

### `DELETE /api/artifacts/{id}`

Delete an artifact by id.

**Response** `200` `{ "success": true, "message": "Artifact deleted successfully" }`.

**Errors:** `400` if `id` is missing, `404` if not found.

### `POST /api/artifacts/validate`

Validate a CrashLab case bundle without persisting it. Request bodies larger
than 1 MiB are rejected.

**Request** body: `{ "bundle": { /* CaseBundle */ } }`

**Response** `200` when valid / `422` when invalid:

```json
{ "valid": true, "errors": [], "warnings": [] }
```

**Errors:** `400` for invalid JSON or a missing `bundle` field, `413` if the
body exceeds 1 MiB.

---

## Settings

### `GET /api/settings/alerting`

Return the current alerting settings snapshot (in-memory; defaults are created
on first access).

**Response** `200` (direct): an `AlertingSettingsSnapshot` object.

### `PUT /api/settings/alerting`

Replace the alerting settings snapshot. The body is parsed and validated; on
success `lastUpdated` is stamped with the current time.

**Request** body: an `AlertingSettingsSnapshot` JSON document.

**Response** `200` (direct): the stored snapshot.

**Errors:** `400` if the body cannot be read, `422` if the payload is invalid
or fails validation.

---

## Networks

### `GET /api/networks`

List configured networks and the active network id.

**Response** `200` (wrapped):
`{ "data": { "networks": [ /* NetworkConfig[] */ ], "activeNetworkId": "testnet" }, "total": 4 }`

### `POST /api/networks`

Add a custom network. An id is slugified from `name` (built-in ids are
namespaced with a `custom-` prefix and collisions get a numeric suffix).

**Request** body (required): `name`, `networkPassphrase`, `horizonUrl`,
`rpcUrl`. Optional: `friendbotUrl`.

**Response** `201` (wrapped): `{ "data": { "network": { /* NetworkConfig */ } } }`.

**Errors:** `400` if required fields are missing, `422` if the config is
invalid, `409` if it conflicts with an existing network.

### `GET /api/networks/active`

**Response** `200` (wrapped):
`{ "data": { "network": { /* NetworkConfig */ }, "activeNetworkId": "testnet" } }`.

### `PUT /api/networks/active`

Switch the active network.

**Request** body: `{ "id": "string" }`

**Response** `200` (wrapped):
`{ "data": { "activeNetworkId": "...", "network": { /* NetworkConfig */ } } }`.

**Errors:** `400` if `id` is missing, `404` if the network does not exist.

### `DELETE /api/networks/{id}`

Delete a custom network. If the deleted network was active, the active network
falls back to `testnet`.

**Response** `200` (wrapped): `{ "data": { "success": true, "deletedId": "..." } }`.

**Errors:** `404` if the network does not exist, `403` if it is a built-in
network.

---

## Campaigns

### `POST /api/campaigns`

Queue a new fuzzing campaign. The submitted body is merged into a generated
record.

**Request** body: arbitrary campaign configuration (JSON object).

**Response** `201`:

```json
{ "campaign": { "id": "campaign-1700000000000", "status": "queued", "createdAt": "2026-01-01T00:00:00.000Z", "...": "..." } }
```

---

## Notifications

### `GET /api/notifications`

Return the notification feed. This endpoint is **optional**: it returns an empty
feed unless a feed source is configured via `NOTIFICATIONS_FEED_URL` /
`NOTIFICATIONS_API_URL`. It can be disabled with the `enabled=0` query parameter
or `NOTIFICATIONS_FEED_ENABLED=false`. Upstream failures degrade gracefully to
an empty feed.

**Response** `200`:

```json
{ "notifications": [ /* NotificationFeedItem[] */ ], "total": 0, "optional": true }
```

Each item has `id`, `title`, `message`, `severity`
(`info` | `success` | `warning` | `error`), `createdAt`, and `read`.

---

## Webhooks

### `GET /api/webhooks`

List registered webhooks. Secrets are redacted as `***`.

**Response** `200`: `{ "webhooks": [ /* WebhookConfig[] */ ], "total": 0 }`.

### `POST /api/webhooks`

Register a webhook (in-memory store).

**Request** body:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | `string` | yes | Non-empty, unique |
| `url` | `string` | yes | `http(s)` URL |
| `events` | `string[]` | yes | One or more of `run.started`, `run.progressing`, `run.completed`, `run.failed`, `run.cancelled`, `crash.detected` |
| `active` | `boolean` | yes | |
| `secret` | `string` | no | Redacted in responses |
| `maxRetries` | `integer ≥ 0` | no | Defaults to `3` |
| `timeoutMs` | `integer > 0` | no | Defaults to `5000` |
| `headers` | `object<string,string>` | no | Flat string map |

**Response** `201`: the stored config (secret redacted).

**Errors:** `422` on validation failure, `409` if `id` already exists.

### `PATCH /api/webhooks?id={id}`

Update an existing webhook. Body contains any subset of the mutable fields
above (`secret` and `headers` accept `null` to clear them).

**Response** `200`: the updated config (secret redacted).

**Errors:** `400` if `id` query param is missing, `404` if not found, `422` on
field validation failure.

### `DELETE /api/webhooks?id={id}`

Remove a webhook.

**Response** `200`: `{ "deleted": "<id>" }`.

**Errors:** `400` if `id` query param is missing, `404` if not found.

---

## Health & integrations

### `GET /api/health/metrics`

Real health check of the metrics system via the Prometheus adapter
(`PROMETHEUS_ENDPOINT`, `PROMETHEUS_HEALTH_PATH`, `PROMETHEUS_TIMEOUT_MS`).

**Response** `200` `{ "status": "healthy", "timestamp": "...", "endpoint": "...", "statusCode": 200, "version": "1.0.0" }`.

`503` `{ "status": "unhealthy" | "error", ... }` when the exporter is
unreachable, `500` on internal errors.

### `GET /api/integrations/prometheus/health`

Lightweight Prometheus exporter health probe used by pollers / internal
monitoring. Returns a JSON status object.

### `GET|POST /api/integrations/pagerduty/config`

- **`GET`** → saved PagerDuty configuration, or `404`
  `{ "error": "No configuration saved yet" }` if none has been persisted.
- **`POST`** body: a `PagerDutyConfig` object → persists it (in-memory).
  `400` `{ "error": "Invalid configuration payload" }` on invalid input.

### `GET /api/integrations/pagerduty/alerts`

Return recent PagerDuty alerts. Serves mock data in development (when
`PAGERDUTY_INTEGRATION_KEY` is absent) and forwards to the backend in
production.

### `POST /api/integrations/pagerduty/test-connection`

Validate a PagerDuty integration key.

**Request** body: `{ "integrationKey": "string" }`

**Errors:** `400` `{ "error": "integrationKey is required" }`.

### `POST /api/integrations/pagerduty/trigger`

Trigger a PagerDuty incident for a critical failure via the Events API v2.
Reads `PAGERDUTY_INTEGRATION_KEY` from the environment when not supplied in the
body.

**Request** body: a trigger payload, optionally including `integrationKey`.

---

## Auth

### `GET /api/auth/github/callback`

GitHub OAuth 2.0 callback. Expects `code` and `state` query parameters and
exchanges the authorization code for an access token.

**Errors:** `400` when `code` or `state` is missing.

---

## Related documentation

- [Architecture Guide](ARCHITECTURE.md) — how the dashboard, API layer, and
  Rust core fit together.
- [Environment Variables](ENV.md) — configuration for backend proxying and
  integrations referenced above.
- [Reproducibility Guide](REPRODUCIBILITY.md) — replay determinism behind
  `POST /api/runs/{id}/replay`.
