# Integrations Guide

Soroban CrashLab connects with external services to extend what you can do with your fuzzing campaign data. This guide explains how to set up each integration and what it provides.

---

## How Integrations Work

Each integration follows the same pattern. There is an adapter file in `apps/web/src/lib/integrations/` that handles communication with the external service, and an API route in `apps/web/src/app/api/` that proxies requests from the frontend to the adapter.

When the external service is not available or not configured, the integration falls back to mock data so you can test the UI without setting up real credentials.

---

## Sentry

Sentry provides error tracking and crash reporting for your applications.

**What this integration does**
- Captures exceptions from the dashboard and sends them to Sentry
- Provides a crash report viewer within the dashboard
- Lets you configure Sentry DSN through the settings page

**Setup**
1. Create a Sentry account and project
2. Copy your DSN from the Sentry project settings
3. Set the `NEXT_PUBLIC_SENTRY_DSN` environment variable
4. The adapter in `sentry-client.ts` initializes automatically

**Files involved**
- `apps/web/src/lib/integrations/sentry-client.ts`
- `apps/web/src/lib/integrations/sentry-adapter.ts`

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
- Supports retry with exponential backoff
- Tracks delivery status and history

**Files involved**
- `apps/web/src/lib/webhook-delivery-worker.ts`
- `apps/web/src/app/api/webhooks/route.ts`

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
