/**
 * lib/route-catalog — declarative route capability registry (#1817).
 *
 * Single source of truth for which routes exist and what they require. The
 * central guard (`route-guard.ts`) consults this catalog on every API request:
 * a request whose (method, path) has no entry here is denied outright, so a new
 * route handler cannot ship without a deliberate registration — forgetting is a
 * test failure, not a silent authorization hole.
 *
 * Each entry declares:
 *  - `authClass`   — public (no credential), session (role-based), or token.
 *  - `requiredCapability` — the role a mutating request must satisfy, plus the
 *    token scopes a token must carry. Read-only requests are not role-gated
 *    (the exhaustive capability matrix is W5-C12).
 *  - `rateLimitClass` — the bucket the request belongs to.
 *
 * The role values mirror the historical `ROUTE_ROLE_RULES` table exactly; this
 * module is now that table's home.
 */

import type { ApiTokenScope } from './storage/api-token-store';
import type { UserRole } from './storage/role-store';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type AuthClass = 'public' | 'session' | 'token';

export type RateLimitClass = 'default' | 'strict' | 'lenient' | 'none';

export interface RouteCapability {
  /** Mutating requests are role-gated; read-only entries omit this. */
  /** Absent for read-only endpoints: a token scope is enough. */
  role?: UserRole;
  scopes?: ApiTokenScope[];
}

export interface RouteCatalogEntry {
  method: HttpMethod;
  path: string;
  authClass: AuthClass;
  requiredCapability: RouteCapability | null;
  rateLimitClass: RateLimitClass;
  tags?: string[];
}

const r = (
  method: HttpMethod,
  path: string,
  authClass: AuthClass,
  requiredCapability: RouteCapability | null = null,
  rateLimitClass: RateLimitClass = 'default',
  tags: string[] = [],
): RouteCatalogEntry => ({
  method,
  path,
  authClass,
  requiredCapability,
  rateLimitClass,
  tags,
});

export const ROUTE_CATALOG: RouteCatalogEntry[] = [
  r('GET', '/api/artifacts', 'session', null, 'default'),
  r('POST', '/api/artifacts', 'session', { role: 'analyst' }, 'default'),
  r('DELETE', '/api/artifacts/[id]', 'session', { role: 'analyst' }, 'default'),
  r('GET', '/api/artifacts/[id]', 'session', null, 'default'),
  r('POST', '/api/artifacts/validate', 'session', { role: 'analyst' }, 'default'),
  r('GET', '/api/audit', 'session', null, 'default'),
  r('POST', '/api/audit/checkpoint', 'session', { role: 'analyst' }, 'default'),
  r('GET', '/api/audit/export', 'session', null, 'default'),
  r('GET', '/api/auth/github/callback', 'public', null, 'default'),
  r('GET', '/api/auth/github/login', 'public', null, 'default'),
  r('GET', '/api/auth/oidc/callback', 'public', null, 'default'),
  r('GET', '/api/auth/oidc/start', 'public', null, 'default'),
  r('POST', '/api/campaigns', 'session', { role: 'maintainer' }, 'default'),
  r('GET', '/api/campaigns/[id]/timeline', 'session', null, 'default'),
  r('GET', '/api/capacity', 'public', null, 'default'),
  r('POST', '/api/capacity/usage', 'token', { role: 'analyst' }, 'default'),
  r('GET', '/api/capacity', 'public', null, 'default'),
  r('POST', '/api/capacity/usage', 'token', { role: 'analyst' }, 'default'),
  r('POST', '/api/csp-report', 'public', null, 'strict'),
  r('GET', '/api/database/migrations', 'session', null, 'default'),
  r('POST', '/api/database/migrations', 'session', { role: 'analyst' }, 'default'),
  r('GET', '/api/health', 'public', null, 'none'),
  r('GET', '/api/health/liveness', 'public', null, 'none'),
  r('GET', '/api/health/metrics', 'token', null, 'none'),
  r('GET', '/api/integrations/ci/results', 'public', null, 'default'),
  r('POST', '/api/integrations/ci/results', 'token', { role: 'analyst', scopes: ['ci:write'] }, 'default'),
  r('GET', '/api/integrations/datadog/metrics', 'session', null, 'default'),
  r('POST', '/api/integrations/discord', 'token', { role: 'analyst' }, 'default'),
  r('GET', '/api/integrations/github-actions', 'session', null, 'default'),
  r('POST', '/api/integrations/github-actions', 'token', { role: 'analyst' }, 'default'),
  r('GET', '/api/integrations/github-issue', 'session', null, 'default'),
  r('GET', '/api/integrations/grafana/annotations', 'session', null, 'default'),
  r('POST', '/api/integrations/grafana/annotations', 'token', { role: 'analyst' }, 'default'),
  r('GET', '/api/integrations/grafana/config', 'session', null, 'default'),
  r('POST', '/api/integrations/grafana/config', 'token', { role: 'maintainer' }, 'default'),
  r('POST', '/api/integrations/grafana/test-connection', 'token', { role: 'maintainer' }, 'default'),
  r('POST', '/api/integrations/jira', 'token', { role: 'analyst' }, 'default'),
  r('GET', '/api/integrations/jira/[issueKey]', 'session', null, 'default'),
  r('POST', '/api/integrations/jira/[issueKey]', 'token', { role: 'analyst' }, 'default'),
  r('GET', '/api/integrations/linear/[issueId]', 'session', null, 'default'),
  r('GET', '/api/integrations/pagerduty/alerts', 'session', null, 'default'),
  r('POST', '/api/integrations/pagerduty/alerts', 'token', { role: 'analyst' }, 'default'),
  r('GET', '/api/integrations/pagerduty/config', 'session', null, 'default'),
  r('POST', '/api/integrations/pagerduty/config', 'token', { role: 'maintainer' }, 'default'),
  r('POST', '/api/integrations/pagerduty/test-connection', 'token', { role: 'maintainer' }, 'default'),
  r('POST', '/api/integrations/pagerduty/trigger', 'token', { role: 'analyst' }, 'default'),
  r('POST', '/api/integrations/pagerduty/webhook', 'token', { role: 'analyst' }, 'default'),
  r('GET', '/api/integrations/prometheus/health', 'public', null, 'default'),
  r('POST', '/api/integrations/slack', 'token', { role: 'analyst' }, 'default'),
  r('POST', '/api/integrations/slack/interactivity', 'token', { role: 'analyst' }, 'default'),
  r('GET', '/api/integrations/smtp/config', 'session', null, 'default'),
  r('POST', '/api/integrations/smtp/config', 'token', { role: 'maintainer' }, 'default'),
  r('GET', '/api/integrations/smtp/history', 'session', null, 'default'),
  r('POST', '/api/integrations/smtp/send', 'token', { role: 'analyst' }, 'default'),
  r('POST', '/api/integrations/smtp/test-connection', 'token', { role: 'maintainer' }, 'default'),
  r('GET', '/api/networks', 'session', null, 'default'),
  r('POST', '/api/networks', 'session', { role: 'maintainer' }, 'default'),
  r('DELETE', '/api/networks/[id]', 'session', { role: 'maintainer' }, 'default'),
  r('GET', '/api/networks/active', 'session', null, 'default'),
  r('PUT', '/api/networks/active', 'session', { role: 'maintainer' }, 'default'),
  r('GET', '/api/notifications', 'session', null, 'default'),
  r('GET', '/api/openapi', 'public', null, 'default'),
  r('GET', '/api/runs', 'session', { scopes: ['runs:read'] }, 'default'),
  r('POST', '/api/runs', 'session', { role: 'analyst', scopes: ['runs:write'] }, 'default'),
  r('GET', '/api/replay-jobs/[id]', 'session', { scopes: ['runs:read'] }, 'default'),
  r('GET', '/api/replay-jobs/[id]/stream', 'session', { scopes: ['runs:read'] }, 'default'),
  r('GET', '/api/runs', 'session', { scopes: ['runs:read'] }, 'default'),
  r('POST', '/api/runs', 'session', { role: 'analyst', scopes: ['runs:write'] }, 'default'),
  r('GET', '/api/runs/compare', 'session', { scopes: ['runs:read'] }, 'default'),
  r('GET', '/api/runs/[id]', 'session', { scopes: ['runs:read'] }, 'default'),
  // Reserved policy: the destructive verb is pre-registered at maintainer so a
  // future DELETE handler cannot land under the permissive fallback.
  r('DELETE', '/api/runs/[id]', 'session', { role: 'maintainer', scopes: ['runs:write'] }, 'default'),
  r('DELETE', '/api/runs/[id]/annotations', 'session', { role: 'analyst', scopes: ['runs:write'] }, 'default'),
  r('GET', '/api/runs/[id]/annotations', 'session', { scopes: ['runs:read'] }, 'default'),
  r('POST', '/api/runs/[id]/annotations', 'session', { role: 'analyst', scopes: ['runs:write'] }, 'default'),
  r('GET', '/api/runs/[id]/clusters', 'session', { scopes: ['runs:read'] }, 'default'),
  r('DELETE', '/api/runs/[id]/issues', 'session', { role: 'analyst', scopes: ['runs:write'] }, 'default'),
  r('GET', '/api/runs/[id]/issues', 'session', { scopes: ['runs:read'] }, 'default'),
  r('POST', '/api/runs/[id]/issues', 'session', { role: 'analyst', scopes: ['runs:write'] }, 'default'),
  r('POST', '/api/runs/[id]/replay', 'session', { role: 'maintainer', scopes: ['runs:write'] }, 'default'),
  r('GET', '/api/runs/[id]/replay-history', 'session', { scopes: ['runs:read'] }, 'default'),
  r('GET', '/api/runs/[id]/stream', 'session', { scopes: ['runs:read'] }, 'default'),
  r('DELETE', '/api/runs/[id]/tags', 'session', { role: 'analyst', scopes: ['runs:write'] }, 'default'),
  r('GET', '/api/runs/[id]/tags', 'session', { scopes: ['runs:read'] }, 'default'),
  r('POST', '/api/runs/[id]/tags', 'session', { role: 'analyst', scopes: ['runs:write'] }, 'default'),
  r('GET', '/api/schedules', 'session', null, 'default'),
  r('POST', '/api/schedules', 'session', { role: 'analyst' }, 'default'),
  r('DELETE', '/api/schedules/[id]', 'session', { role: 'analyst' }, 'default'),
  r('PUT', '/api/schedules/[id]', 'session', { role: 'analyst' }, 'default'),
  r('POST', '/api/schedules/tick', 'session', { role: 'analyst' }, 'default'),
  r('GET', '/api/sentry/config', 'session', null, 'default'),
  r('POST', '/api/sentry/config', 'session', { role: 'maintainer' }, 'default'),
  r('GET', '/api/sentry/reports', 'session', null, 'default'),
  r('POST', '/api/sentry/test-connection', 'session', { role: 'maintainer' }, 'default'),
  r('GET', '/api/settings/alerting', 'session', { scopes: ['settings:read'] }, 'default'),
  r('PUT', '/api/settings/alerting', 'session', { role: 'maintainer', scopes: ['settings:write'] }, 'default'),
  // Reserved policy: any mutating verb on the settings surface is maintainer,
  // including verbs without a handler today. Keeps the historical matrix.
  r('POST', '/api/settings/alerting', 'session', { role: 'maintainer', scopes: ['settings:write'] }, 'default'),
  r('GET', '/api/settings/notifications', 'session', { scopes: ['settings:read'] }, 'default'),
  r('POST', '/api/settings/notifications', 'session', { role: 'maintainer', scopes: ['settings:write'] }, 'default'),
  r('DELETE', '/api/settings/roles', 'session', { role: 'maintainer', scopes: ['settings:write'] }, 'default'),
  r('GET', '/api/settings/roles', 'session', { scopes: ['settings:read'] }, 'default'),
  r('POST', '/api/settings/roles', 'session', { role: 'maintainer', scopes: ['settings:write'] }, 'default'),
  r('GET', '/api/settings/roles/audit', 'session', { scopes: ['settings:read'] }, 'default'),
  r('GET', '/api/settings/roles/me', 'session', { scopes: ['settings:read'] }, 'default'),
  r('GET', '/api/settings/tokens', 'session', { scopes: ['settings:read'] }, 'default'),
  r('POST', '/api/settings/tokens', 'session', { role: 'maintainer', scopes: ['settings:write'] }, 'default'),
  r('POST', '/api/settings/tokens/[id]/revoke', 'session', { role: 'maintainer', scopes: ['settings:write'] }, 'default'),
  r('POST', '/api/settings/tokens/[id]/rotate', 'session', { role: 'maintainer', scopes: ['settings:write'] }, 'default'),
  r('GET', '/api/triage/queue', 'session', { role: 'analyst' }, 'default'),
  r('POST', '/api/triage/queue', 'session', { role: 'analyst' }, 'default'),
  r('GET', '/api/uploadthing', 'token', null, 'default'),
  r('POST', '/api/uploadthing', 'token', { role: 'analyst' }, 'default'),
  r('DELETE', '/api/webhooks', 'token', { role: 'maintainer', scopes: ['webhook:write'] }, 'default'),
  r('GET', '/api/webhooks', 'token', { scopes: ['webhook:read'] }, 'default'),
  r('PATCH', '/api/webhooks', 'token', { role: 'analyst', scopes: ['webhook:write'] }, 'default'),
  r('POST', '/api/webhooks', 'token', { role: 'maintainer', scopes: ['webhook:write'] }, 'default'),
  r('GET', '/api/webhooks/history', 'token', { scopes: ['webhook:read'] }, 'default'),
  r('POST', '/api/webhooks/recovery', 'token', { role: 'maintainer', scopes: ['webhook:write'] }, 'default'),
  r('POST', '/api/webhooks/retry', 'token', { role: 'maintainer', scopes: ['webhook:write'] }, 'default'),
  r('GET', '/api/webhooks/signing-secrets', 'token', { scopes: ['webhook:read'] }, 'default'),
  r('POST', '/api/webhooks/signing-secrets/[keyId]/revoke-grace', 'token', { role: 'maintainer', scopes: ['webhook:write'] }, 'default'),
  r('POST', '/api/webhooks/signing-secrets/rotate', 'token', { role: 'maintainer', scopes: ['webhook:write'] }, 'default'),];

/**
 * True when `pathname` matches a catalog `path`, treating `[param]` segments as
 * single-segment wildcards. This is what lets `/api/runs/run-42` resolve to the
 * `/api/runs/[id]` registration.
 */
export function routePathMatches(pattern: string, pathname: string): boolean {
  const patternParts = pattern.split('/');
  const pathParts = pathname.split('/');
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((part, index) => {
    if (part.startsWith('[') && part.endsWith(']')) return pathParts[index].length > 0;
    return part === pathParts[index];
  });
}

/** The catalog entry for a request, or `null` when the route is undeclared. */
export function matchRouteCatalogEntry(
  method: string,
  pathname: string,
): RouteCatalogEntry | null {
  const upper = method.toUpperCase();
  return (
    ROUTE_CATALOG.find(
      (entry) => entry.method === upper && routePathMatches(entry.path, pathname),
    ) ?? null
  );
}
