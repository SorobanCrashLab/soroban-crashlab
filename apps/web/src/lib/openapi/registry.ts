/**
 * lib/openapi/registry — single source of truth for the API surface (#1670).
 *
 * Each route handler under app/api/**/route.ts gets one entry here.
 * The contract test gains a spec-drift check: any handler without a registry
 * entry fails CI, and openapi.json is committed so PRs show a spec delta.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type ApiAuth = 'none' | 'bearer' | 'bearer-or-maintainer' | 'maintainer';

export interface RouteRegistryEntry {
  method: HttpMethod;
  path: string;
  auth: ApiAuth;
  summary: string;
  description: string;
  tags: string[];
  errorCodes: string[];
  paginated?: boolean;
  scopes?: Array<'read' | 'write'>;
}

function r(
  method: HttpMethod,
  path: string,
  auth: ApiAuth,
  summary: string,
  tags: string[],
  errorCodes: string[] = [],
  extra: Partial<RouteRegistryEntry> = {},
): RouteRegistryEntry {
  return {
    method,
    path,
    auth,
    summary,
    description: summary,
    tags,
    errorCodes,
    ...extra,
  };
}

export const ROUTE_REGISTRY: RouteRegistryEntry[] = [
  r('GET', '/api/health', 'none', 'Service health check', ['ops']),
  r('GET', '/api/health/metrics', 'bearer', 'Scrape endpoint metrics', ['ops'], ['UNAUTHORIZED'], {
    description: 'Bearer scrape token (CRASHLAB_METRICS_SCRAPE_TOKEN). Prometheus-compatible.',
  }),
  r('GET', '/api/runs', 'bearer', 'List fuzzing runs (keyset paginated)', ['runs'], ['UNAUTHORIZED', 'VALIDATION_ERROR'], {
    paginated: true,
    scopes: ['read'],
    description: 'Cursor pagination via ?cursor=<opaque>&limit=<n> (default 20). Envelope: { data: { runs, total, nextCursor, hasMore }, total }.',
  }),
  r('POST', '/api/runs', 'bearer-or-maintainer', 'Create a fuzzing run', ['runs'], ['VALIDATION_ERROR', 'UNAUTHORIZED', 'FORBIDDEN'], {
    scopes: ['write'],
  }),
  r('GET', '/api/runs/{id}', 'bearer', 'Get a single run', ['runs'], ['RUN_NOT_FOUND', 'RUN_ID_REQUIRED', 'UNAUTHORIZED'], {
    scopes: ['read'],
  }),
  r('DELETE', '/api/runs/{id}', 'bearer-or-maintainer', 'Delete a run (maintainer)', ['runs'], ['RUN_NOT_FOUND', 'FORBIDDEN'], {
    scopes: ['write'],
  }),
  r('GET', '/api/runs/{id}/annotations', 'bearer', 'List run annotations', ['runs'], ['RUN_NOT_FOUND'], { scopes: ['read'] }),
  r('POST', '/api/runs/{id}/annotations', 'bearer', 'Add a run annotation', ['runs'], ['RUN_NOT_FOUND', 'VALIDATION_ERROR'], { scopes: ['write'] }),
  r('GET', '/api/runs/{id}/issues', 'bearer', 'List issues linked to a run', ['runs'], ['RUN_NOT_FOUND'], { scopes: ['read'] }),
  r('POST', '/api/runs/{id}/issues', 'bearer', 'Link an issue to a run', ['runs'], ['RUN_NOT_FOUND', 'VALIDATION_ERROR'], { scopes: ['write'] }),
  r('GET', '/api/runs/{id}/tags', 'bearer', 'List run tags', ['runs'], ['RUN_NOT_FOUND'], { scopes: ['read'] }),
  r('POST', '/api/runs/{id}/tags', 'bearer', 'Add tags to a run', ['runs'], ['RUN_NOT_FOUND', 'VALIDATION_ERROR'], { scopes: ['write'] }),
  r('POST', '/api/runs/{id}/replay', 'bearer-or-maintainer', 'Replay a crashed run (maintainer)', ['runs'], ['RUN_NOT_FOUND', 'FORBIDDEN'], { scopes: ['write'] }),
  r('GET', '/api/runs/{id}/replay-history', 'bearer', 'Replay history for a run', ['runs'], ['RUN_NOT_FOUND'], { scopes: ['read'] }),
  r('GET', '/api/runs/{id}/stream', 'bearer', 'Stream run progress (SSE)', ['runs'], ['RUN_NOT_FOUND'], { scopes: ['read'] }),
  r('GET', '/api/artifacts', 'bearer', 'List artifacts', ['artifacts'], ['UNAUTHORIZED'], { paginated: true, scopes: ['read'] }),
  r('POST', '/api/artifacts', 'bearer', 'Upload an artifact bundle', ['artifacts'], ['ARTIFACT_MISSING_BUNDLE_FIELD', 'ARTIFACT_PAYLOAD_TOO_LARGE'], { scopes: ['write'] }),
  r('GET', '/api/artifacts/{id}', 'bearer', 'Get an artifact', ['artifacts'], ['NOT_FOUND'], { scopes: ['read'] }),
  r('POST', '/api/artifacts/validate', 'bearer', 'Validate an artifact bundle', ['artifacts'], ['ARTIFACT_INVALID_BUNDLE', 'ARTIFACT_INVALID_JSON'], { scopes: ['write'] }),
  r('GET', '/api/campaigns', 'bearer-or-maintainer', 'List fuzz campaigns', ['campaigns'], ['UNAUTHORIZED'], { paginated: true, scopes: ['read'] }),
  r('POST', '/api/campaigns', 'bearer-or-maintainer', 'Create a fuzz campaign', ['campaigns'], ['VALIDATION_ERROR', 'FORBIDDEN'], { scopes: ['write'] }),
  r('GET', '/api/schedules', 'bearer-or-maintainer', 'List schedules', ['schedules'], ['UNAUTHORIZED'], { scopes: ['read'] }),
  r('POST', '/api/schedules', 'bearer-or-maintainer', 'Create a schedule', ['schedules'], ['VALIDATION_ERROR', 'FORBIDDEN'], { scopes: ['write'] }),
  r('GET', '/api/schedules/{id}', 'bearer-or-maintainer', 'Get a schedule', ['schedules'], ['NOT_FOUND'], { scopes: ['read'] }),
  r('POST', '/api/schedules/tick', 'bearer', 'Advance due schedules', ['schedules'], ['UNAUTHORIZED'], { scopes: ['write'] }),
  r('GET', '/api/webhooks', 'bearer-or-maintainer', 'List webhooks', ['webhooks'], ['UNAUTHORIZED'], { scopes: ['read'] }),
  r('POST', '/api/webhooks', 'bearer-or-maintainer', 'Create a webhook', ['webhooks'], ['VALIDATION_ERROR', 'FORBIDDEN'], { scopes: ['write'] }),
  r('GET', '/api/webhooks/history', 'bearer', 'Webhook delivery history', ['webhooks'], ['UNAUTHORIZED'], { paginated: true, scopes: ['read'] }),
  r('POST', '/api/webhooks/retry', 'bearer', 'Retry a webhook delivery', ['webhooks'], ['WEBHOOK_DELIVERY_NOT_FOUND', 'WEBHOOK_DELIVERY_ID_REQUIRED'], { scopes: ['write'] }),
  r('GET', '/api/notifications', 'bearer', 'List notifications', ['notifications'], ['UNAUTHORIZED'], { paginated: true, scopes: ['read'] }),
  r('GET', '/api/networks', 'bearer-or-maintainer', 'List Stellar networks', ['networks'], ['UNAUTHORIZED'], { scopes: ['read'] }),
  r('GET', '/api/networks/{id}', 'bearer-or-maintainer', 'Get a network', ['networks'], ['NOT_FOUND'], { scopes: ['read'] }),
  r('GET', '/api/networks/active', 'bearer', 'Active network', ['networks'], ['UNAUTHORIZED'], { scopes: ['read'] }),
  r('GET', '/api/settings/tokens', 'bearer-or-maintainer', 'List API tokens', ['settings'], ['FORBIDDEN'], { scopes: ['read'] }),
  r('POST', '/api/settings/tokens/{id}/revoke', 'bearer-or-maintainer', 'Revoke an API token', ['settings'], ['NOT_FOUND', 'FORBIDDEN'], { scopes: ['write'] }),
  r('POST', '/api/settings/tokens/{id}/rotate', 'bearer-or-maintainer', 'Rotate an API token', ['settings'], ['NOT_FOUND', 'FORBIDDEN'], { scopes: ['write'] }),
  r('GET', '/api/settings/alerting', 'bearer-or-maintainer', 'Get alerting config', ['settings'], ['FORBIDDEN'], { scopes: ['read'] }),
  r('GET', '/api/auth/github/login', 'none', 'Start GitHub OAuth', ['auth']),
  r('GET', '/api/auth/github/callback', 'none', 'GitHub OAuth callback', ['auth'], ['VALIDATION_ERROR']),
  r('POST', '/api/uploadthing', 'bearer', 'Uploadthing callback', ['artifacts'], ['UNAUTHORIZED']),
  r('GET', '/api/sentry/config', 'bearer-or-maintainer', 'Get Sentry config', ['integrations'], ['FORBIDDEN']),
  r('GET', '/api/sentry/reports', 'bearer', 'List Sentry reports', ['integrations'], ['UNAUTHORIZED']),
  r('POST', '/api/sentry/test-connection', 'bearer-or-maintainer', 'Test Sentry connection', ['integrations'], ['FORBIDDEN']),
  r('GET', '/api/integrations/slack', 'bearer-or-maintainer', 'Slack integration status', ['integrations'], ['FORBIDDEN']),
  r('POST', '/api/integrations/discord', 'bearer', 'Post to Discord', ['integrations'], ['VALIDATION_ERROR'], { scopes: ['write'] }),
  r('POST', '/api/integrations/github-actions', 'bearer', 'Trigger GitHub Action', ['integrations'], ['VALIDATION_ERROR'], { scopes: ['write'] }),
  r('POST', '/api/integrations/github-issue', 'bearer', 'Open a GitHub issue', ['integrations'], ['VALIDATION_ERROR'], { scopes: ['write'] }),
  r('POST', '/api/integrations/jira', 'bearer', 'Create a Jira issue', ['integrations'], ['VALIDATION_ERROR'], { scopes: ['write'] }),
  r('GET', '/api/integrations/smtp/history', 'bearer', 'SMTP send history', ['integrations'], ['UNAUTHORIZED'], { scopes: ['read'] }),
  r('POST', '/api/integrations/smtp/send', 'bearer', 'Send via SMTP', ['integrations'], ['VALIDATION_ERROR'], { scopes: ['write'] }),
  r('POST', '/api/integrations/pagerduty/trigger', 'bearer', 'Trigger PagerDuty', ['integrations'], ['VALIDATION_ERROR'], { scopes: ['write'] }),
  r('GET', '/api/integrations/datadog/metrics', 'bearer', 'Datadog metrics proxy', ['integrations'], ['UNAUTHORIZED'], { scopes: ['read'] }),
  r('GET', '/api/integrations/prometheus/health', 'none', 'Prometheus health', ['integrations']),
];
