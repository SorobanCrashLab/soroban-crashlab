# Integrations Guide

Soroban CrashLab connects with external services to extend what you can do with your fuzzing campaign data. This guide explains how to set up each integration and what it provides.

---

## How Integrations Work

Each integration follows the same pattern. There is an adapter file in `apps/web/src/lib/integrations/` that handles communication with the external service, and an API route in `apps/web/src/app/api/` that proxies requests from the frontend to the adapter.

When the external service is not available or not configured, the integration falls back to mock data so you can test the UI without setting up real credentials.

### Outbound timeout and retry policy

Server-side calls to third parties go through one wrapper,
`httpCall(name, url, init, policy)` in `apps/web/src/lib/http-call.ts`, so a
slow or hung provider can never hold a serverless function (10 s limit) or
leave a test-connection button spinning.

| Setting                                            | Default              | Constant                                           |
| -------------------------------------------------- | -------------------- | -------------------------------------------------- |
| Per-attempt timeout (until response headers)       | 4 s                  | `OUTBOUND_ATTEMPT_TIMEOUT_MS`                      |
| Total budget (all attempts, backoff and body read) | 8 s                  | `OUTBOUND_TOTAL_BUDGET_MS`                         |
| Retries after the first attempt                    | 2                    | `DEFAULT_HTTP_CALL_POLICY.maxRetries`              |
| Backoff (equal jitter)                             | 200 ms base, 2 s cap | `OUTBOUND_RETRY_BASE_MS` / `OUTBOUND_RETRY_MAX_MS` |

- Retries happen on network errors, timeouts, `408`, `429` and `5xx`, and
  only for idempotent methods (`GET`, `HEAD`, `OPTIONS`, `PUT`, `DELETE`).
  A `POST` is retried only when the caller passes `idempotent: true` because
  the provider deduplicates it (PagerDuty's `dedup_key`).
- `Retry-After` (seconds or HTTP date) is honoured, capped by the backoff
  ceiling and the remaining budget.
- Failures are typed: `OutboundTimeoutError` → `INTEGRATION_TIMEOUT` (504)
  and `OutboundNetworkError` → `INTEGRATION_UNAVAILABLE` (502).

Per-client policies:

| Client            | Calls                                | Attempt timeout                       | Retried?                                      |
| ----------------- | ------------------------------------ | ------------------------------------- | --------------------------------------------- |
| PagerDuty         | Events API trigger / test-connection | 4 s (`PAGERDUTY_FETCH_TIMEOUT_MS`)    | Yes — deduplicated by `dedup_key`             |
| Grafana           | `GET /api/health` (test-connection)  | 4 s (`GRAFANA_FETCH_TIMEOUT_MS`)      | Yes                                           |
| Grafana           | `POST /api/annotations`              | 4 s                                   | No — creating an annotation is not idempotent |
| SMTP (nodemailer) | connect / greeting / idle socket     | 5 s / 5 s / 8 s (`SMTP_*_TIMEOUT_MS`) | No                                            |

Slack, Jira, Linear and Datadog will adopt the same wrapper in follow-up
changes.

---

## Sentry

Sentry provides error tracking and crash reporting for your applications.

**What this integration does**

- Captures exceptions from the dashboard and sends them to Sentry
- Provides a crash report viewer within the dashboard
- Lets you configure Sentry DSN through the settings page
- Uploads hidden source maps during production builds and deletes them post-upload
- Tags releases with the git commit SHA and associates commit metadata

**Setup**

1. Create a Sentry account and project
2. Copy your DSN from the Sentry project settings
3. Set the `NEXT_PUBLIC_SENTRY_DSN` environment variable
4. Set build-time secrets in Vercel / CI: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`
5. The adapter in `sentry-client.ts` initializes automatically on the client, and `withSentryConfig` in `next.config.ts` handles source map upload and release tagging at build time

**Files involved**

- `apps/web/next.config.ts`
- `apps/web/src/lib/integrations/sentry-client.ts`
- `apps/web/src/lib/integrations/sentry-adapter.ts`
- `.github/workflows/vercel-preview.yml`

---

## PagerDuty

PagerDuty provides incident alerting and on call management.

**What this integration does**

- Triggers PagerDuty alerts when critical crashes are detected
- Lets you configure the PagerDuty integration key through settings
- Provides a test connection button to verify configuration
- Shows alert history within the dashboard

**Files involved**

- `apps/web/src/lib/integrations/pagerduty-adapter.ts`
- `apps/web/src/app/api/integrations/pagerduty/`

---

## Slack

Slack provides team messaging and notifications.

**What this integration does**

- Sends formatted notifications to Slack channels when crashes are detected
- Includes run details, failure signatures, and direct links to the dashboard
- Supports threaded messages with additional context: later events for the
  same run (e.g. completed/failed after started) reply into the first
  message's thread instead of posting a new top-level message
- Requires a Slack bot token with the `chat:write` scope and a channel ID
  (`SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`) — incoming webhooks can't return the
  `ts` needed to thread replies, so this uses `chat.postMessage` instead

**Files involved**

- `apps/web/src/lib/integrations/slack-webhook.ts`
- `apps/web/src/lib/integrations/slack-thread-store.ts`
- `apps/web/src/app/api/integrations/slack/route.ts`

---

## Prometheus

Prometheus provides metrics collection and monitoring.

**What this integration does**

- Exports fuzzing campaign metrics to a Prometheus Pushgateway
- Tracks run counts, crash rates, resource usage, and campaign duration
- Lets you configure the push endpoint and interval through settings
- Provides a health check endpoint

**Files involved**

- `apps/web/src/lib/integrations/prometheus-adapter.ts`
- `apps/web/src/app/api/integrations/prometheus/health/route.ts`
- `apps/web/src/app/api/health/metrics/route.ts`

**Securing scrapes**
Set `CRASHLAB_METRICS_SCRAPE_TOKEN` to require `Authorization: Bearer <token>` on
`/api/health/metrics` and `/api/integrations/prometheus/health`. When configured,
Prometheus must attach the header on every scrape:

```yaml
scrape_configs:
  - job_name: crashlab-exporter
    metrics_path: /api/integrations/prometheus/health
    bearer_token: <CRASHLAB_METRICS_SCRAPE_TOKEN value>
    static_configs:
      - targets: [crashlab-web:3000]
```

Label names are restricted to a static allow-list and label values are escaped
and length-capped (`apps/web/src/lib/integrations/prometheus-adapter.ts`), so
attacker-controlled input can never inflate series cardinality.

---

## Discord

Discord provides community messaging and notifications.

**What this integration does**

- Sends crash alerts and campaign updates to Discord channels
- Uses Discord webhooks for message delivery
- Requires a Discord webhook URL from your server settings

---

## Webhooks

Webhooks let you send data to any HTTP endpoint when events occur.

**What this integration does**

- Fires HTTP POST requests to configured URLs when crashes are detected
- Includes the full crash payload as JSON in the request body
- Signs deliveries with `X-Webhook-Signature`, `X-Webhook-Timestamp`, and `X-Webhook-Key-Id` when signing secrets are configured
- Retries through a durable, rate-limited retry queue: attempts are
  persisted and run on the webhook-recovery tick (driven by
  `POST /api/schedules/tick`) with exponential backoff, jitter and a
  per-receiver concurrency cap, never inline in the triggering request
- Drains the dead-letter queue automatically and parks entries that keep
  failing so they surface in the retry dashboard
- Tracks delivery status, history and metrics (latency, retries, DLQ depth)

**Files involved**

- `apps/web/src/lib/webhook-delivery-worker.ts`
- `apps/web/src/lib/webhook-retry-queue.ts`
- `apps/web/src/lib/webhook-dlq.ts`
- `apps/web/src/lib/webhook-recovery.ts`
- `apps/web/src/app/api/webhooks/route.ts`

**Delivery signature verification**
Set `CRASHLAB_WEBHOOK_SIGNING_SECRETS` to a comma-separated, ordered list of
secrets (active key first, grace key second). The legacy
`CRASHLAB_WEBHOOK_SIGNING_SECRET` single-secret variable remains supported for
one release; migrate it to the first item in the list, then add the previous
secret as the second item during rotation. Remove the grace key after all
receivers have switched. Each signature is HMAC-SHA256 over
`timestamp + "." + exact request body`; reject timestamps more than five minutes
from the receiver's current time and compare the signature in constant time.
The key ID is a stable identifier derived from the selected secret and is not
itself a secret.

```ts
import { verifyWebhookSignature } from "./webhook-hmac";

const acceptedSecrets = [
  process.env.ACTIVE_WEBHOOK_SECRET!,
  process.env.GRACE_WEBHOOK_SECRET!,
];
const valid = await verifyWebhookSignature(
  rawRequestBody,
  request.headers.get("x-webhook-signature") ?? "",
  acceptedSecrets,
  300,
  request.headers.get("x-webhook-timestamp") ?? undefined,
);
if (!valid) throw new Error("Invalid or expired webhook signature");
```

---

## Issue Trackers

The platform can link crashes to issues in external tracking systems.

### GitHub Issues

Creates or links GitHub issues when crashes are detected. Requires a GitHub personal access token with repo scope.

### Jira

Creates or links Jira tickets when crashes are detected. Requires Jira instance URL and API credentials.

### Linear

Creates or links Linear issues when crashes are detected. Requires a Linear API key.

---

## SMTP Email

Sends email notifications through an SMTP server.

**What this integration does**

- Sends alert emails to configured recipients when crashes are detected
- Supports multiple notification channels with different severity levels
- Bounds the SMTP handshake with connection, greeting and socket timeouts
  (see [Outbound timeout and retry policy](#outbound-timeout-and-retry-policy))

---

## Datadog

Datadog provides infrastructure and application monitoring.

**What this integration does**

- Exports campaign metrics to Datadog
- Tracks the same metrics as the Prometheus integration
- Requires a Datadog API key

---

## Adding a New Integration

If you want to add a new integration that is not listed here, follow this pattern.

1. Create an adapter file in `apps/web/src/lib/integrations/` that handles the external API
2. Create an API route in `apps/web/src/app/api/` if the frontend needs a proxy
3. Create a page in `apps/web/src/app/integrations/` for the configuration UI
4. Add the integration to the integrations list in `apps/web/src/app/integrations/page.tsx`
5. Add mock data in `apps/web/src/fixtures/` for offline testing
6. Add test files for the adapter and route

Check the existing integrations like PagerDuty or Prometheus for reference implementations.
