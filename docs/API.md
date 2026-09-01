# API Reference

This document provides a comprehensive reference for the HTTP API exposed by the Soroban CrashLab web dashboard. All endpoints are implemented as [Next.js Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers) under `apps/web/src/app/api/` and are served from the same origin as the dashboard (default `http://localhost:3000`).

For how these routes fit into the wider system, see the [Architecture Guide](ARCHITECTURE.md). For the environment variables that configure backend proxying, storage adapters, and external integrations, see [Environment Variables](ENV.md). For third-party setup instructions, see the [Integrations Guide](INTEGRATIONS.md).

---

## Conventions

### Base URL

All routes are relative to the dashboard origin and namespaced under `/api`:

```
http://localhost:3000/api/<route>
```

### Backend Proxying & Mock Fallback

Several routes are **proxy-aware**:
- When upstream environment variables are configured (such as `NEXT_PUBLIC_API_URL`, `RUNS_API_URL`, or `ISSUES_API_URL`), route handlers proxy client requests to upstream backend services.
- When proxy variables are unset, routes seamlessly fall back to local in-process storage drivers (`MemoryRunStorageDriver`, `LocalStorageDriver`), fixture data, or in-memory stores so the dashboard operates fully offline and in local development without external dependencies.
- In-memory stores persist for the lifetime of the server process.

### Authentication & Authorization

- **Public Endpoints**: Most read routes (`GET /api/runs`, `GET /api/artifacts`, etc.) and UI-triggered actions operate without authentication in development environments.
- **Webhook API Authentication**: When the `CRASHLAB_WEBHOOK_API_KEY` environment variable is set, all requests to `/api/webhooks` (`GET`, `POST`, `PATCH`, `DELETE`) require an `Authorization: Bearer <key>` header validated via constant-time string comparison.
- **API Tokens**: Granular API access tokens with `read` or `write` scopes can be generated and managed via `/api/settings/tokens`.
- **OAuth CSRF Protection**: OAuth routes (`/api/auth/github/login` and `/api/auth/github/callback`) use secure, `httpOnly`, `sameSite=lax` state cookies to protect against CSRF attacks.

### Request Body & Payload Limits

- Mutations (`POST`, `PUT`, `PATCH`) accept JSON (`Content-Type: application/json`) unless specified otherwise (e.g., artifact binary uploads use `multipart/form-data`).
- Endpoints enforcing size limits (such as `/api/artifacts/validate`) reject payloads exceeding 1 MiB with `413 Payload Too Large`.

### Response Envelopes

Routes follow one of two JSON response patterns:

1. **Wrapped Envelope** — standard resource responses built on `lib/api-response-utils.ts` return a `data` object:

   ```json
   {
     "data": {
       "resource": "..."
     },
     "total": 1
   }
   ```

   (`total` is included on collection responses.)

2. **Direct Format** — specific endpoints (such as `/api/runs/{id}`, `/api/settings/alerting`, and `/api/webhooks`) return the resource object directly.

### Uniform Error Format

All error responses return a standardized JSON structure with an appropriate HTTP status code:

```json
{
  "error": "Human-readable error message"
}
```

### Status Codes

| Code | Meaning | Common Triggers |
| --- | --- | --- |
| `200 OK` | Request succeeded | Successful query, update, or action execution |
| `201 Created` | Resource created | New run tag/annotation, artifact upload, webhook registration, API token |
| `302 Found` | Redirect | OAuth authorization redirect or post-login redirection |
| `400 Bad Request` | Malformed request | Missing required fields, invalid JSON syntax, or invalid query parameters |
| `401 Unauthorized` | Authentication required | Missing or invalid `CRASHLAB_WEBHOOK_API_KEY` Bearer token |
| `403 Forbidden` | Action disallowed | Deleting built-in networks, or invalid OAuth CSRF state parameter |
| `404 Not Found` | Resource not found | Non-existent run, artifact, network, webhook, or missing saved configuration |
| `409 Conflict` | Resource conflict | Duplicate webhook ID, duplicate issue link, or replay signature mismatch |
| `413 Payload Too Large` | Body exceeds limit | Case bundle or upload payload exceeds maximum allowed size |
| `422 Unprocessable Entity` | Validation failure | Schema validation error, malformed URL, or unsupported event type |
| `500 Internal Server Error` | Server error | Uncaught handler exception or runtime processing failure |
| `502 Bad Gateway` | Upstream failure | Upstream proxy or CLI execution failure |
| `503 Service Unavailable` | Service not configured | Upstream unavailable when mock data disabled, or unconfigured integration credentials |

---

## Route Summary

### Runs & Replays
| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/runs` | List fuzzing runs with search, filtering, and pagination |
| `GET` | `/api/runs/{id}` | Retrieve details of a specific fuzzing run |
| `POST` | `/api/runs/{id}/replay` | Deterministically replay the crashing seed using CLI runner |
| `GET` | `/api/runs/{id}/replay-history` | Get past seed replay attempts for a run |
| `GET` | `/api/runs/{id}/stream` | Server-Sent Events (SSE) live event/log stream |
| `GET` `POST` `DELETE` | `/api/runs/{id}/tags` | View, add, or remove tags on a run |
| `GET` `POST` `DELETE` | `/api/runs/{id}/annotations` | View, add, or remove free-text annotations on a run |
| `GET` `POST` `DELETE` | `/api/runs/{id}/issues` | View, attach, or remove external issue tracker links |

### Artifacts & Bundles
| Method | Path | Description |
| --- | --- | --- |
| `GET` `POST` | `/api/artifacts` | List stored artifact metadata or upload new artifacts |
| `GET` `DELETE` | `/api/artifacts/{id}` | Download raw artifact binary or delete an artifact |
| `POST` | `/api/artifacts/validate` | Validate a CaseBundle payload without persisting |

### Campaigns
| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/campaigns` | Queue a new fuzzing campaign |

### Networks
| Method | Path | Description |
| --- | --- | --- |
| `GET` `POST` | `/api/networks` | List configured Soroban networks or add a custom network |
| `GET` `PUT` | `/api/networks/active` | Get active network configuration or switch active network |
| `DELETE` | `/api/networks/{id}` | Delete a custom network (built-in networks protected) |

### Settings & API Tokens
| Method | Path | Description |
| --- | --- | --- |
| `GET` `PUT` | `/api/settings/alerting` | Read or replace alerting configuration snapshot |
| `GET` `POST` | `/api/settings/tokens` | List API tokens or generate a new scoped token |
| `POST` | `/api/settings/tokens/{id}/revoke` | Revoke an existing API token by ID |

### Webhooks
| Method | Path | Description |
| --- | --- | --- |
| `GET` `POST` `PATCH` `DELETE` | `/api/webhooks` | Full CRUD operations for outbound webhook subscribers |
| `GET` | `/api/webhooks/history` | List webhook delivery attempts and delivery statistics |
| `POST` | `/api/webhooks/retry` | Manually re-trigger a failed webhook delivery attempt |

### Authentication
| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/auth/github/login` | Initiate GitHub OAuth 2.0 flow with CSRF state cookie |
| `GET` | `/api/auth/github/callback` | OAuth redirect callback and code exchange |

### Health & Monitoring
| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Aggregate health check with per-dependency status |
| `GET` | `/api/health/metrics` | Health check probe of metrics system via Prometheus adapter |
| `GET` | `/api/notifications` | Fetch system notification feed |
| `GET` | `/api/integrations/prometheus/health` | Lightweight Prometheus exporter health probe |
| `GET` | `/api/integrations/datadog/metrics` | Datadog StatsD metrics configuration and status probe |

### Integrations
| Method | Path | Description |
| --- | --- | --- |
| `GET` `POST` | `/api/integrations/pagerduty/config` | Read or save PagerDuty integration settings |
| `GET` | `/api/integrations/pagerduty/alerts` | List recent PagerDuty incidents and alerts |
| `POST` | `/api/integrations/pagerduty/test-connection` | Verify a PagerDuty integration key |
| `POST` | `/api/integrations/pagerduty/trigger` | Trigger a high-priority incident via Events API v2 |
| `POST` | `/api/integrations/slack` | Send formatted notification or threaded reply to Slack |
| `POST` | `/api/integrations/slack/interactivity` | Handle Slack interactive component callbacks |
| `POST` | `/api/integrations/discord` | Post crash notifications and embeds to Discord webhook |
| `GET` `POST` | `/api/integrations/grafana/config` | Read or save Grafana dashboard configuration |
| `GET` `POST` | `/api/integrations/grafana/annotations` | List or create Grafana dashboard annotations |
| `POST` | `/api/integrations/grafana/test-connection` | Verify Grafana endpoint and API token connectivity |
| `GET` `POST` | `/api/sentry/config` | Read or save Sentry DSN configuration |
| `GET` | `/api/sentry/reports` | List recent Sentry crash reports |
| `POST` | `/api/sentry/test-connection` | Verify Sentry DSN endpoint connectivity |
| `GET` `POST` | `/api/integrations/smtp/config` | Read or save SMTP mail server settings |
| `POST` | `/api/integrations/smtp/test-connection` | Verify SMTP connection and authentication |
| `POST` | `/api/integrations/smtp/send` | Send test email alert to specified recipient |
| `GET` | `/api/integrations/smtp/history` | View recent SMTP email dispatch history |
| `GET` | `/api/integrations/github-issue` | Resolve GitHub issue URL to title and status |
| `GET` `POST` | `/api/integrations/github-actions` | List workflow runs or trigger workflow dispatch |
| `POST` | `/api/integrations/jira` | Create a new bug or task ticket in Jira |
| `GET` `POST` | `/api/integrations/jira/{issueKey}` | Get metadata or add comment/crash details to Jira issue |
| `GET` | `/api/integrations/linear/{issueId}` | Fetch issue metadata from Linear |

---

## Runs API

### `GET /api/runs`

List fuzzing runs with search, status filtering, severity, area, tags, and pagination. When `NEXT_PUBLIC_API_URL` is set, queries are sanitized and forwarded to the backend. Otherwise, queries resolve against the active storage driver or mock dataset.

**Query Parameters:**

| Parameter | Type | Description |
| --- | --- | --- |
| `search` | `string` | Free-text search matching run ID or contract name |
| `status` | `string` | Filter by run status (`passed`, `failed`, `running`, `cancelled`) |
| `severity` | `string` | Filter by severity (`low`, `medium`, `high`, `critical`) |
| `area` | `string` | Filter by contract area (`auth`, `state`, `budget`, `xdr`) |
| `contract` | `string` | Filter by contract identifier |
| `tags` | `string` | Comma-separated list of tags to match |
| `limit` | `number` | Maximum number of records to return (default: `20`) |
| `offset` | `number` | Number of records to skip for pagination |
| `sort` | `string` | Field to sort by (`createdAt`, `duration`, `seedCount`, `crashCount`) |
| `order` | `string` | Sort direction: `asc` or `desc` (default: `desc`) |

**Response** `200 OK` (wrapped):

```json
{
  "data": {
    "runs": [
      {
        "id": "run-101",
        "status": "failed",
        "area": "auth",
        "severity": "critical",
        "duration": 4820,
        "seedCount": 100000,
        "crashCount": 3,
        "contractId": "CCORP...101",
        "createdAt": "2026-08-30T12:00:00.000Z",
        "tags": ["auth-matrix", "regression"],
        "crashDetail": {
          "failureCategory": "auth",
          "signature": "AUTH_MODE_MISMATCH_RECORD_ALLOW_NONROOT",
          "signatureHash": 8472910384,
          "payload": "0xa001deadbeef",
          "replayAction": "crashlab replay seed --id 42"
        }
      }
    ]
  },
  "total": 1
}
```

**Errors:**
- `503 Service Unavailable`: Backend configured but unreachable, or mock data disabled without backend configured.

---

### `GET /api/runs/{id}`

Retrieve full metadata for a single fuzzing run by ID. Proxies to `RUNS_API_URL` when set, otherwise loads from the run storage driver.

**Headers:** Responses return with `Cache-Control: no-store`.

**Response** `200 OK` (direct): `FuzzingRun` object.

**Errors:**
- `400 Bad Request`: `id` parameter missing or blank.
- `404 Not Found`: No run exists with the specified ID.
- `502 Bad Gateway`: Upstream backend returned an error.

---

### `POST /api/runs/{id}/replay`

Reconstructs the crashing seed from a run's failure record into a `CaseBundle` and invokes the `crashlab replay seed` CLI against `contracts/crashlab-core`. Runs on the Node.js runtime.

**Response** `200 OK` (wrapped):

```json
{
  "data": {
    "ok": true,
    "runId": "run-101",
    "newRunId": "replay-run-101-1700000000",
    "bundleJson": "{\"seed\":{\"id\":42,\"payload\":\"0xa0...\"}}",
    "command": "crashlab",
    "args": ["replay", "seed", "--bundle", "/tmp/bundle-101.json"],
    "stdout": "Replaying seed 42... Crash reproduced successfully.",
    "stderr": "",
    "exitCode": 0
  }
}
```

**Errors:**
- `400 Bad Request`: Missing run `id`.
- `404 Not Found`: Run does not exist.
- `409 Conflict`: Replay signature mismatch (`stderr` contains `replay mismatch:`).
- `422 Unprocessable Entity`: Run has no reproducible crash detail.
- `502 Bad Gateway`: CLI invocation failed or returned unexpected non-zero exit code.

---

### `GET /api/runs/{id}/replay-history`

Retrieve the list of previous seed replay executions for a run, sorted chronologically. Proxies to `RUNS_API_URL/runs/{id}/replay-history` when set.

**Response** `200 OK` (wrapped):

```json
{
  "data": {
    "entries": [
      {
        "id": "replay-101-1",
        "runId": "run-101",
        "timestamp": "2026-08-30T14:30:00.000Z",
        "status": "reproduced",
        "durationMs": 412,
        "seedIndex": 42,
        "signature": "AUTH_MODE_MISMATCH_RECORD_ALLOW_NONROOT"
      }
    ]
  }
}
```

---

### `GET /api/runs/{id}/stream`

Subscribes to a live Server-Sent Events (SSE) stream of run events, log lines, artifact additions, and periodic heartbeats.

**Headers:**
- Accept: `text/event-stream`
- Optional `Last-Event-ID` header or `?after=<seq>` query parameter to resume from a sequence number.

**Response** `200 OK`:
- `Content-Type: text/event-stream; charset=utf-8`
- `Cache-Control: no-cache, no-transform`
- `Connection: keep-alive`

**Stream Events:**
```
id: 1
data: {"seq":1,"runId":"run-101","event":{"type":"RUN_STATUS","status":"running","metrics":{"seedCount":100128,"duration":5820}}}

id: 2
data: {"seq":2,"runId":"run-101","event":{"type":"LOG_APPEND","entries":[{"id":"log-1","timestamp":1700000000,"level":"info","source":"stream","message":"Campaign checkpoint reached"}]}}

id: 3
data: {"seq":3,"runId":"run-101","event":{"type":"HEARTBEAT","at":"2026-08-30T12:00:15.000Z"}}
```

---

### `GET|POST|DELETE /api/runs/{id}/tags`

Manage tags assigned to a run.

- **`GET /api/runs/{id}/tags`** → `200 OK` `{ "runId": "run-101", "tags": ["auth", "triage"] }`
- **`POST /api/runs/{id}/tags`**
  - **Body**: `{ "tag": "regression-v2" }`
  - **Response** `201 Created`: `{ "runId": "run-101", "tags": ["auth", "triage", "regression-v2"] }`
  - **Errors**: `400 Bad Request` if tag is empty/invalid, `404 Not Found` if run does not exist.
- **`DELETE /api/runs/{id}/tags`**
  - **Body**: `{ "tag": "triage" }`
  - **Response** `200 OK`: Updated tag array.
  - **Errors**: `404 Not Found` if tag or run not present.

---

### `GET|POST|DELETE /api/runs/{id}/annotations`

Manage free-text notes and findings attached to a run.

- **`GET /api/runs/{id}/annotations`** → `200 OK` `{ "runId": "run-101", "annotations": ["Initial triage notes"] }`
- **`POST /api/runs/{id}/annotations`**
  - **Body**: `{ "text": "Root cause tracked to signature verification order" }`
  - **Response** `201 Created`: Updated annotations array.
  - **Errors**: `400 Bad Request` if text is empty or exceeds 500 characters, `404 Not Found` if run missing.
- **`DELETE /api/runs/{id}/annotations`**
  - **Body**: `{ "index": 0 }`
  - **Response** `200 OK`: Updated annotations array.
  - **Errors**: `400 Bad Request` if index is invalid/out of range, `404 Not Found` if run missing.

---

### `GET|POST|DELETE /api/runs/{id}/issues`

Link external issue tracker URLs (GitHub, Jira, Linear) to a run. Proxies `GET` to `ISSUES_API_URL` when set.

- **`GET /api/runs/{id}/issues`** → `200 OK` `{ "runId": "run-101", "issues": [{ "label": "GH #412", "href": "https://github.com/org/repo/issues/412" }] }`
- **`POST /api/runs/{id}/issues`**
  - **Body**: `{ "label": "GH #412", "href": "https://github.com/org/repo/issues/412" }`
  - **Response** `201 Created`: Updated issue links array.
  - **Errors**: `400 Bad Request` (invalid URL/label), `404 Not Found`, `409 Conflict` (link already attached).
- **`DELETE /api/runs/{id}/issues`**
  - **Body**: `{ "href": "https://github.com/org/repo/issues/412" }`
  - **Response** `200 OK`: Updated issue links array.
  - **Errors**: `404 Not Found` if link or run not present.

---

## Artifacts API

### `GET /api/artifacts`

List all stored crash artifacts, execution logs, and case bundles.

**Response** `200 OK` (direct):

```json
{
  "artifacts": [
    {
      "id": "artifact-401",
      "name": "crash-seed-0xdead.bundle.json",
      "type": "bundle",
      "size": 4096,
      "updatedAt": "2026-08-30T10:00:00.000Z",
      "contentType": "json"
    }
  ],
  "total": 1
}
```

---

### `POST /api/artifacts`

Upload an artifact file. Accepts `multipart/form-data` with a single file field `file`.

**Response** `201 Created` (wrapped):

```json
{
  "data": {
    "artifact": {
      "id": "artifact-402",
      "name": "fuzz-target.wasm",
      "type": "wasm",
      "size": 184320,
      "updatedAt": "2026-08-30T12:00:00.000Z"
    }
  }
}
```

**Errors:** `400 Bad Request` if `file` field is missing.

---

### `GET /api/artifacts/{id}`

Download an artifact's raw binary or file content stream.

**Response** `200 OK`:
- `Content-Type: application/octet-stream`
- `Content-Disposition: attachment; filename="<filename>"`
- `Content-Length: <bytes>`

**Errors:** `400 Bad Request` if `id` missing, `404 Not Found` if artifact does not exist.

---

### `DELETE /api/artifacts/{id}`

Delete an artifact from local or configured artifact storage.

**Response** `200 OK`:

```json
{
  "success": true,
  "message": "Artifact deleted successfully"
}
```

**Errors:** `400 Bad Request` if `id` missing, `404 Not Found` if artifact not found.

---

### `POST /api/artifacts/validate`

Validates a CrashLab `CaseBundle` JSON structure without persisting it. Enforces a maximum payload size limit of 1 MiB.

**Request Body:**

```json
{
  "bundle": {
    "seed": { "id": 42, "payload": "0xa0deadbeef" },
    "signature": { "category": "auth", "digest": "sha256...", "signatureHash": 10293 },
    "matrixReport": { "mismatches": [] },
    "reproStatus": { "isStable": true, "flakeRate": 0.0 }
  }
}
```

**Response** `200 OK` (when valid) / `422 Unprocessable Entity` (when invalid):

```json
{
  "valid": true,
  "errors": [],
  "warnings": []
}
```

**Errors:**
- `400 Bad Request`: Malformed JSON or missing `bundle` field.
- `413 Payload Too Large`: Payload exceeds 1 MiB size limit.

---

## Campaigns API

### `POST /api/campaigns`

Queue a new fuzzing campaign against a target Soroban contract.

**Request Body:**

```json
{
  "contractId": "CCORP...101",
  "preset": "nightly",
  "durationSeconds": 3600,
  "seedCount": 500000,
  "authModes": ["enforce", "record", "record-allow-nonroot"],
  "tags": ["ci", "security-audit"]
}
```

**Response** `201 Created`:

```json
{
  "campaign": {
    "id": "campaign-1700000000000",
    "status": "queued",
    "contractId": "CCORP...101",
    "preset": "nightly",
    "createdAt": "2026-08-30T12:00:00.000Z"
  }
}
```

---

## Networks API

### `GET /api/networks`

List all configured Stellar networks and the currently selected active network ID.

**Response** `200 OK` (wrapped):

```json
{
  "data": {
    "networks": [
      {
        "id": "testnet",
        "name": "Stellar Testnet",
        "networkPassphrase": "Test SDF Network ; September 2015",
        "horizonUrl": "https://horizon-testnet.stellar.org",
        "rpcUrl": "https://soroban-testnet.stellar.org",
        "friendbotUrl": "https://friendbot.stellar.org",
        "isBuiltIn": true
      }
    ],
    "activeNetworkId": "testnet"
  },
  "total": 1
}
```

---

### `POST /api/networks`

Register a custom Stellar/Soroban network configuration.

**Request Body:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | `string` | Yes | Human-readable network name |
| `networkPassphrase` | `string` | Yes | Stellar network passphrase |
| `horizonUrl` | `string` | Yes | Horizon HTTP API endpoint |
| `rpcUrl` | `string` | Yes | Soroban RPC endpoint |
| `friendbotUrl` | `string` | No | Friendbot funder URL |

**Response** `201 Created` (wrapped): `{ "data": { "network": { /* NetworkConfig */ } } }`.

**Errors:**
- `400 Bad Request`: Missing required fields.
- `409 Conflict`: Network with identical name or passphrase already exists.
- `422 Unprocessable Entity`: Invalid URL format.

---

### `GET /api/networks/active`

Get the configuration of the currently active network.

**Response** `200 OK` (wrapped):

```json
{
  "data": {
    "activeNetworkId": "testnet",
    "network": {
      "id": "testnet",
      "name": "Stellar Testnet",
      "rpcUrl": "https://soroban-testnet.stellar.org"
    }
  }
}
```

---

### `PUT /api/networks/active`

Switch the active network to another configured network ID.

**Request Body:** `{ "id": "futurenet" }`

**Response** `200 OK` (wrapped): `{ "data": { "activeNetworkId": "futurenet", "network": { /* ... */ } } }`.

**Errors:** `400 Bad Request` if `id` missing, `404 Not Found` if network ID does not exist.

---

### `DELETE /api/networks/{id}`

Remove a custom network configuration. If the deleted network was active, the active network safely falls back to `testnet`.

**Response** `200 OK` (wrapped): `{ "data": { "success": true, "deletedId": "custom-network-1" } }`.

**Errors:**
- `403 Forbidden`: Attempting to delete a built-in network (`testnet`, `futurenet`, `mainnet`, `standalone`).
- `404 Not Found`: Network not found.

---

## Settings & API Tokens API

### `GET /api/settings/alerting`

Retrieve the current alerting threshold and channel configuration snapshot.

**Response** `200 OK` (direct):

```json
{
  "channels": {
    "email": { "enabled": true, "recipients": ["security@example.com"] },
    "slack": { "enabled": false },
    "pagerduty": { "enabled": true, "severityThreshold": "high" },
    "webhook": { "enabled": true, "endpointUrl": "https://api.example.com/alerts" }
  },
  "thresholds": {
    "crashRatePercent": 5,
    "consecutiveFailures": 3
  },
  "lastUpdated": "2026-08-30T10:00:00.000Z"
}
```

---

### `PUT /api/settings/alerting`

Replace the alerting settings snapshot. Updates `lastUpdated` timestamp upon successful validation.

**Request Body:** `AlertingSettingsSnapshot` JSON object.

**Response** `200 OK` (direct): Updated snapshot object.

**Errors:** `400 Bad Request` (malformed JSON), `422 Unprocessable Entity` (validation failed).

---

### `GET /api/settings/tokens`

List all created API access tokens (with secret values hashed and omitted).

**Response** `200 OK`:

```json
{
  "tokens": [
    {
      "id": "tok_101",
      "name": "CI Runner Key",
      "scope": "write",
      "createdAt": "2026-08-30T09:00:00.000Z",
      "expiresAt": null,
      "lastUsedAt": "2026-08-30T11:45:00.000Z",
      "revoked": false
    }
  ]
}
```

---

### `POST /api/settings/tokens`

Generate a new scoped API token. The full plaintext `secret` is returned **only once** in this response and cannot be retrieved later.

**Request Body:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | `string` | Yes | Non-empty descriptive name |
| `scope` | `string` | No | Token scope: `"read"` or `"write"` (default: `"read"`) |
| `expiresAt` | `string` | No | ISO 8601 expiry timestamp |

**Response** `201 Created`:

```json
{
  "message": "Token created successfully. Store this secret safely as it will not be shown again.",
  "secret": "scl_live_9f830a...",
  "token": {
    "id": "tok_102",
    "name": "CI Runner Key",
    "scope": "write",
    "createdAt": "2026-08-30T12:00:00.000Z",
    "expiresAt": null,
    "revoked": false
  }
}
```

**Errors:** `400 Bad Request` if name is missing or expiration date format is invalid.

---

### `POST /api/settings/tokens/{id}/revoke`

Revoke an API token immediately, rendering it invalid for subsequent requests.

**Response** `200 OK`: `{ "message": "Token revoked successfully." }`.

**Errors:** `400 Bad Request` if ID missing, `404 Not Found` if token does not exist.

---

## Webhooks API

### Authentication Header
When `CRASHLAB_WEBHOOK_API_KEY` is set in the server environment, all calls to `/api/webhooks` must include:
```http
Authorization: Bearer <CRASHLAB_WEBHOOK_API_KEY>
```

---

### `GET /api/webhooks`

List all registered outbound webhook subscriptions. Secrets are redacted as `***`.

**Response** `200 OK`:

```json
{
  "webhooks": [
    {
      "id": "wh-ops-alert",
      "url": "https://ops.example.com/webhooks/crashlab",
      "events": ["crash.detected", "run.failed"],
      "active": true,
      "secret": "***",
      "maxRetries": 3,
      "timeoutMs": 5000,
      "headers": { "X-Service": "crashlab" }
    }
  ],
  "total": 1
}
```

---

### `POST /api/webhooks`

Register a new outbound webhook subscriber.

**Request Body:**

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes | Unique identifier |
| `url` | `string` | Yes | Valid `http` or `https` URL |
| `events` | `string[]` | Yes | Non-empty array of valid event types: `run.started`, `run.progressing`, `run.completed`, `run.failed`, `run.cancelled`, `crash.detected` |
| `active` | `boolean` | Yes | Subscription active flag |
| `secret` | `string` | No | Shared HMAC signing secret (redacted in output) |
| `maxRetries` | `number` | No | Maximum retry attempts (default: `3`) |
| `timeoutMs` | `number` | No | Request timeout in milliseconds (default: `5000`) |
| `headers` | `object` | No | Custom HTTP headers map (`Record<string, string>`) |

**Response** `201 Created`: The stored config with secret masked.

**Errors:**
- `401 Unauthorized`: API key authentication failed.
- `409 Conflict`: Webhook with ID already exists.
- `422 Unprocessable Entity`: Validation failure (malformed URL, invalid event name).

---

### `PATCH /api/webhooks?id={id}`

Partially update an existing webhook configuration. Body accepts any subset of mutable fields. Pass `null` for `secret` or `headers` to clear them.

**Query Parameters:** `id` (string, required).

**Response** `200 OK`: Updated configuration with secret masked.

**Errors:** `400 Bad Request` (missing `id`), `401 Unauthorized`, `404 Not Found`, `422 Unprocessable Entity`.

---

### `DELETE /api/webhooks?id={id}`

Remove a webhook subscription by ID.

**Query Parameters:** `id` (string, required).

**Response** `200 OK`: `{ "deleted": "wh-ops-alert" }`.

**Errors:** `400 Bad Request` (missing `id`), `401 Unauthorized`, `404 Not Found`.

---

### `GET /api/webhooks/history`

Get delivery attempt records, execution status, payload previews, and aggregate metrics.

**Query Parameters:**
- `status`: Filter by status (`all`, `success`, `failed`, `pending`)
- `search`: Search filter matching webhook URL or event name

**Response** `200 OK`:

```json
{
  "items": [
    {
      "id": "del-1001",
      "webhookId": "wh-ops-alert",
      "event": "crash.detected",
      "url": "https://ops.example.com/webhooks/crashlab",
      "statusCode": 500,
      "status": "failed",
      "attempts": 3,
      "timestamp": "2026-08-30T11:00:00.000Z",
      "error": "HTTP 500 Internal Server Error"
    }
  ],
  "stats": {
    "total": 120,
    "successful": 115,
    "failed": 5,
    "successRate": 95.83
  },
  "total": 1
}
```

---

### `POST /api/webhooks/retry`

Manually trigger an immediate delivery retry for a failed webhook delivery record.

**Request Body:** `{ "id": "del-1001" }`

**Response** `200 OK`: `{ "success": true, "item": { /* updated delivery item */ }, "stats": { /* ... */ } }`.

**Errors:** `400 Bad Request` if `id` missing, `404 Not Found` if delivery record not found.

---

## Authentication API

### `GET /api/auth/github/login`

Initiates GitHub OAuth 2.0 authorization. Generates a cryptographic CSRF `state` token, stores it in an `httpOnly`, `sameSite=lax` cookie, and redirects the browser to GitHub's authorization endpoint.

**Redirect Target:**
```
https://github.com/login/oauth/authorize?client_id=...&redirect_uri=...&state=...&scope=read:user user:email
```

**Response** `302 Found`.

**Errors:** `503 Service Unavailable` if `NEXT_PUBLIC_GITHUB_CLIENT_ID` is unconfigured.

---

### `GET /api/auth/github/callback`

GitHub OAuth 2.0 redirect handler. Validates the CSRF `state` parameter against the request cookie before exchanging the authorization code for an authenticated session.

**Query Parameters:**
- `code` (string, required): GitHub authorization code
- `state` (string, required): CSRF state token

**Response** `302 Found`: Redirects to application root `/` on success while clearing the state cookie.

**Errors:**
- `400 Bad Request`: Missing `code` parameter.
- `403 Forbidden`: Missing or mismatched CSRF state token.
- `500 Internal Server Error`: Code exchange or upstream error.

---

## Health & Monitoring API

### `GET /api/health`

Aggregate health check with dependency status. Probes the dashboard's core dependencies (database, Prometheus metrics exporter, and the optional backend) and reports configuration presence for each integration.

**Response** `200 OK`:

```json
{
  "status": "healthy",
  "timestamp": "2026-08-30T12:00:00.000Z",
  "uptimeSec": 3600,
  "version": "1.0.0",
  "dependencies": {
    "database": { "status": "ok", "latencyMs": 4, "detail": { "type": "sqlite" } },
    "metrics": { "status": "ok", "latencyMs": 12, "detail": { "endpoint": "http://localhost:9090", "statusCode": 200 } },
    "backend": { "status": "not_configured", "latencyMs": 0, "message": "Backend not configured (mock mode)" },
    "smtp": { "status": "not_configured", "latencyMs": 0, "message": "SMTP not configured" },
    "slack": { "status": "not_configured", "latencyMs": 0, "message": "Slack not configured" },
    "discord": { "status": "not_configured", "latencyMs": 0, "message": "Discord not configured" },
    "github": { "status": "not_configured", "latencyMs": 0, "message": "GitHub not configured" },
    "jira": { "status": "not_configured", "latencyMs": 0, "message": "Jira not configured" },
    "linear": { "status": "not_configured", "latencyMs": 0, "message": "Linear not configured" },
    "sentry": { "status": "not_configured", "latencyMs": 0, "message": "Sentry not configured" },
    "datadog": { "status": "not_configured", "latencyMs": 0, "message": "Datadog not configured" }
  }
}
```

Each dependency reports one of `ok`, `degraded`, `unavailable`, or `not_configured`. The overall `status` is one of `healthy`, `degraded`, or `unhealthy`.

- `healthy` — all configured dependencies are operational.
- `degraded` — a supporting dependency (e.g. the metrics exporter) is down or unhealthy.
- `unhealthy` — a critical dependency (the database, or a configured backend) is unavailable.

**Errors:** `503 Service Unavailable` when the overall status is `unhealthy` (critical dependency down) or when the health check itself throws.

---

### `GET /api/health/metrics`

Performs an active health check against the Prometheus adapter using `PROMETHEUS_ENDPOINT`, `PROMETHEUS_HEALTH_PATH`, and `PROMETHEUS_TIMEOUT_MS`.

**Response** `200 OK`:

```json
{
  "status": "healthy",
  "timestamp": "2026-08-30T12:00:00.000Z",
  "endpoint": "http://localhost:9090",
  "statusCode": 200,
  "version": "1.0.0"
}
```

**Errors:** `503 Service Unavailable` (`{ "status": "unhealthy", "error": "..." }`) if Prometheus is unreachable.

---

### `GET /api/notifications`

Retrieve the notification feed. Configurable via `NOTIFICATIONS_FEED_URL` and `NOTIFICATIONS_FEED_ENABLED`.

**Query Parameters:** `enabled` (`0`, `1`, `true`, `false`).

**Response** `200 OK`:

```json
{
  "notifications": [
    {
      "id": "notif-1",
      "title": "Fuzzing Run Completed",
      "message": "Run run-101 completed with 3 crashes found.",
      "severity": "warning",
      "createdAt": "2026-08-30T12:00:00.000Z",
      "read": false
    }
  ],
  "total": 1,
  "optional": true
}
```

---

### `GET /api/integrations/prometheus/health`

Lightweight probe used by internal health pollers and Prometheus scrape jobs to check exporter health.

**Response** `200 OK`: `{ "status": "healthy", "timestamp": "...", "uptime": 1234 }`.

---

### `GET /api/integrations/datadog/metrics`

Returns Datadog StatsD metrics export status and runtime host/port configuration (`DATADOG_ENABLED`, `DATADOG_AGENT_HOST`, `DATADOG_AGENT_PORT`).

**Response** `200 OK`:

```json
{
  "status": "active",
  "enabled": true,
  "config": {
    "host": "localhost",
    "port": 8125,
    "prefix": "soroban_crashlab"
  }
}
```

---

## Integrations API

### PagerDuty

#### `GET /api/integrations/pagerduty/config`
- Returns saved PagerDuty configuration.
- **Errors:** `404 Not Found` if unconfigured.

#### `POST /api/integrations/pagerduty/config`
- Persists PagerDuty configuration.
- **Body**: `{ "integrationKey": "string", "serviceName"?: "string" }`
- **Errors:** `400 Bad Request` on invalid payload.

#### `GET /api/integrations/pagerduty/alerts`
- Returns recent PagerDuty incidents: `{ "alerts": [ /* PagerDutyAlert[] */ ] }`.

#### `POST /api/integrations/pagerduty/test-connection`
- Validates an integration key against the PagerDuty API.
- **Body**: `{ "integrationKey": "string" }`
- **Response** `200 OK`: `{ "success": true, "message": "Connection verified" }`.

#### `POST /api/integrations/pagerduty/trigger`
- Triggers a high-severity incident via Events API v2.
- **Body**: `{ "summary": "Critical crash detected", "severity": "critical", "source": "crashlab", "runId": "run-101" }`
- **Response** `200 OK`: `{ "success": true, "dedupKey": "..." }`.

---

### Slack

#### `POST /api/integrations/slack`
Sends crash alerts or lifecycle updates to Slack. Uses `chat.postMessage` to support threaded conversations across multi-stage run events. Requires `SLACK_BOT_TOKEN` and `SLACK_CHANNEL_ID`.

**Request Body:**

```json
{
  "eventType": "crash.detected",
  "runId": "run-101",
  "contractId": "CCORP...101",
  "severity": "critical",
  "message": "Auth mode mismatch crash detected in run-101",
  "threadTs": "1700000000.000100"
}
```

**Response** `200 OK`: `{ "success": true, "ts": "1700000000.000100" }`.

**Errors:** `400 Bad Request`, `500 Internal Server Error`, `503 Service Unavailable` if unconfigured.

#### `POST /api/integrations/slack/interactivity`
Webhook receiver for interactive components (buttons, triage actions) triggered in Slack messages.

---

### Discord

#### `POST /api/integrations/discord`
Dispatches formatted crash notifications and rich embeds to Discord. Requires `DISCORD_WEBHOOK_URL`.

**Request Body:**

```json
{
  "content": "🚨 **Critical Crash Detected** in contract `CCORP...101`",
  "embeds": [
    {
      "title": "Run run-101 Failure",
      "description": "Category: auth | Seed: 42",
      "color": 15158332
    }
  ]
}
```

**Response** `200 OK`: `{ "success": true }`.

**Errors:** `400 Bad Request` if content and embeds are missing, `503 Service Unavailable` if webhook URL unconfigured.

---

### Grafana

#### `GET|POST /api/integrations/grafana/config`
- **`GET`**: Get saved Grafana base URL and configuration (`404` if unconfigured).
- **`POST`**: Save Grafana configuration (`baseUrl`, `apiToken`, `dashboardId`).

#### `GET /api/integrations/grafana/annotations`
- Retrieve dashboard annotations: `{ "annotations": [ /* GrafanaAnnotation[] */ ] }`.

#### `POST /api/integrations/grafana/annotations`
- Creates a timestamped annotation on a Grafana dashboard marking a crash event or campaign milestone.
- **Body**: `{ "runId": "run-101", "text": "Fuzzing campaign completed: 3 crashes", "tags": ["crashlab"] }`
- **Response** `200 OK`: `{ "success": true, "id": 108 }`.

#### `POST /api/integrations/grafana/test-connection`
- Verifies endpoint connectivity and token authentication against `/api/health`.
- **Body**: `{ "baseUrl": "https://grafana.example.com", "apiToken": "glsa_..." }`

---

### Sentry

#### `GET|POST /api/sentry/config`
- **`GET`**: Retrieve saved Sentry DSN configuration.
- **`POST`**: Validate and store Sentry DSN configuration (`{ "dsn": "https://key@sentry.io/123", "environment": "production" }`).
- **Errors**: `422 Unprocessable Entity` if DSN format is invalid.

#### `GET /api/sentry/reports`
- Returns recent crash reports queued or dispatched to Sentry: `{ "reports": [ /* SentryCrashReport[] */ ] }`.

#### `POST /api/sentry/test-connection`
- Verifies Sentry DSN structure and network reachability.
- **Body**: `{ "dsn": "https://public@sentry.example.com/1" }`

---

### SMTP / Email

#### `GET|POST /api/integrations/smtp/config`
- **`GET`**: Get saved SMTP server credentials and sender config.
- **`POST`**: Validate and save SMTP configuration (`host`, `port`, `secure`, `user`, `pass`, `from`).

#### `POST /api/integrations/smtp/test-connection`
- Verifies SMTP server handshake and authentication without sending email.
- **Body**: `SmtpConfig` JSON object.

#### `POST /api/integrations/smtp/send`
- Dispatches a test alert email to a recipient using configured SMTP settings.
- **Body**: `{ "to": "developer@example.com" }`
- **Errors**: `404 Not Found` if SMTP is not yet configured, `422 Unprocessable Entity` on dispatch failure.

#### `GET /api/integrations/smtp/history`
- Returns recent email dispatch log history for the running process: `{ "history": [ /* SmtpLogEntry[] */ ] }`.

---

### Issue Trackers & CI/CD

#### `GET /api/integrations/github-issue?url={url}`
Resolves a public GitHub issue or pull request URL to its real title, state (`open`, `closed`), and author. Operates server-side to avoid CORS issues and share unauthenticated GitHub API rate limits.

**Query Parameters:** `url` (string, required — e.g. `https://github.com/stellar/soroban-sdk/issues/1001`).

**Response** `200 OK` (wrapped):

```json
{
  "data": {
    "issue": {
      "title": "Support non-root authorization recording",
      "state": "open",
      "number": 1001,
      "author": "developer",
      "htmlUrl": "https://github.com/stellar/soroban-sdk/issues/1001"
    }
  }
}
```

---

#### `GET|POST /api/integrations/github-actions`
- **`GET /api/integrations/github-actions?repository={owner/repo}`**:
  List recent workflow runs for the specified repository.
  - **Response** `200 OK` (wrapped): `{ "data": { "workflowRuns": [ /* WorkflowRun[] */ ] } }`.
- **`POST /api/integrations/github-actions`**:
  Trigger a `workflow_dispatch` action.
  - **Body**: `{ "repository": "org/repo", "workflowId": "regression.yml", "ref": "main" }`
  - **Response** `200 OK` (wrapped): `{ "data": { "queued": true, "runId": 982341 } }`.

---

#### `POST /api/integrations/jira`
Create a new bug report in Jira for a crash.

**Request Body:**

```json
{
  "summary": "Crash in contract CCORP...101: auth mode mismatch",
  "description": "Crash details and reproduction seed...",
  "projectKey": "CRASH",
  "issueType": "Bug"
}
```

**Response** `200 OK`: `{ "key": "CRASH-104", "url": "https://jira.example.com/browse/CRASH-104" }`.

---

#### `GET|POST /api/integrations/jira/{issueKey}`
- **`GET /api/integrations/jira/{issueKey}`**: Fetch issue metadata (status, summary) for a Jira ticket.
- **`POST /api/integrations/jira/{issueKey}`**: Update or add a comment with crash diagnostics to an existing Jira issue.

---

#### `GET /api/integrations/linear/{issueId}`
Fetches issue metadata (identifier, title, status) from Linear using the Linear GraphQL API.

**Path Parameters:** `issueId` (string, required — Linear UUID or identifier like `ENG-101`).

**Response** `200 OK`:

```json
{
  "id": "uuid-...",
  "identifier": "ENG-101",
  "title": "Investigate Soroban auth crash",
  "state": "In Progress"
}
```

---

## Related Documentation

- [Architecture Overview](ARCHITECTURE.md) — System architecture, data flow, and fuzzer core design.
- [Integrations Guide](INTEGRATIONS.md) — Step-by-step setup guides for PagerDuty, Slack, Discord, Sentry, Grafana, SMTP, and issue trackers.
- [Environment Variables](ENV.md) — Complete reference for proxy URLs, storage directories, and integration keys.
- [Reproducibility Guide](REPRODUCIBILITY.md) — Replay determinism and seed verification mechanics.
