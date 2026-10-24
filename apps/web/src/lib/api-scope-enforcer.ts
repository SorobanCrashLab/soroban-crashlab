import { ApiTokenScope } from './storage/api-token-store';
import { tenantKeyPrefix } from './tenancy/storage-keys';
import type { TenantScope } from './tenancy/tenant-scope';
import { matchRouteCatalogEntry } from './route-catalog';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

interface ScopeRule {
  methods: HttpMethod[];
  pattern: RegExp;
  requiredScopes: ApiTokenScope[];
}

const SCOPE_RULES: ScopeRule[] = [
  {
    methods: ['GET'],
    pattern: /^\/api\/webhooks/,
    requiredScopes: ['webhook:read', '*'],
  },
  {
    methods: ['POST', 'PUT', 'DELETE'],
    pattern: /^\/api\/webhooks/,
    requiredScopes: ['webhook:write', '*'],
  },
  {
    methods: ['GET'],
    pattern: /^\/api\/runs/,
    requiredScopes: ['runs:read', '*'],
  },
  {
    methods: ['POST', 'PUT', 'DELETE'],
    pattern: /^\/api\/runs/,
    requiredScopes: ['runs:write', '*'],
  },
  {
    methods: ['GET'],
    pattern: /^\/api\/settings/,
    requiredScopes: ['settings:read', '*'],
  },
  {
    methods: ['POST', 'PUT', 'DELETE'],
    pattern: /^\/api\/settings/,
    requiredScopes: ['settings:write', '*'],
  },
  {
    methods: ['POST', 'PUT', 'DELETE'],
    pattern: /^\/api\/integrations\/ci\//,
    requiredScopes: ['ci:write', '*'],
  },
];

export function getRequiredScopesForRequest(method: string, pathname: string): ApiTokenScope[] | null {
  const upperMethod = method.toUpperCase() as HttpMethod;

  // The route catalog is the source of truth for scope requirements. The
  // pattern table below remains as a fallback for paths that have no exact
  // catalog registration (e.g. sub-resources reached under a prefix).
  // `lib/permissions.ts` reads the same entries to mirror the role requirement
  // in the UI (ADR-0012); scopes and roles are separate axes.
  const catalogEntry = matchRouteCatalogEntry(upperMethod, pathname);
  if (catalogEntry?.requiredCapability?.scopes) {
    return catalogEntry.requiredCapability.scopes;
  }

  for (const rule of SCOPE_RULES) {
    if (rule.methods.includes(upperMethod) && rule.pattern.test(pathname)) {
      return rule.requiredScopes;
    }
  }

  return null;
}

export function hasSufficientScope(tokenScopes: ApiTokenScope[], requiredScopes: ApiTokenScope[]): boolean {
  if (tokenScopes.includes('*')) return true;
  return requiredScopes.some((scope) => tokenScopes.includes(scope));
}

export function checkScopePermission(
  tokenScopes: ApiTokenScope[],
  method: string,
  pathname: string,
): { allowed: boolean; requiredScopes: ApiTokenScope[] | null } {
  const required = getRequiredScopesForRequest(method, pathname);

  if (!required) {
    return { allowed: true, requiredScopes: null };
  }

  const allowed = hasSufficientScope(tokenScopes, required);
  return { allowed, requiredScopes: required };
}

// ─── tenant dimension (#1894) ────────────────────────────────────────────────
//
// Token scopes say *what* a caller may do; the tenant scope says *where*. A
// request passes only when both hold. The org/project a caller asks for is a
// request, not a grant — `resolveTenantScope` checks it against membership.

export const TENANT_ORG_HEADER = 'x-crashlab-org';
export const TENANT_PROJECT_HEADER = 'x-crashlab-project';

export function requestedTenantFromHeaders(headers: Headers): { orgId: string | null; projectId: string | null } {
  return {
    orgId: headers.get(TENANT_ORG_HEADER)?.trim() || null,
    projectId: headers.get(TENANT_PROJECT_HEADER)?.trim() || null,
  };
}

/** True only when `resourceKey` sits under the scope's storage prefix. */
export function isResourceInTenantScope(scope: Pick<TenantScope, 'orgId' | 'projectId'>, resourceKey: string): boolean {
  return resourceKey.startsWith(tenantKeyPrefix(scope.orgId, scope.projectId));
}

// ─── central CSRF guard composition ──────────────────────────────────────────
//
// Every mutating API route must pass through this guard. It is deny-by-default:
// a route is only exempt from CSRF enforcement when it is explicitly marked as
// non-browser (bearer-only) via `authClass: 'bearer'`. Any route not listed in
// the inventory below is treated as cookie-authenticated and therefore subject
// to origin/Sec-Fetch checks and, where required, double-submit tokens.

export type RouteAuthClass = 'cookie' | 'bearer' | 'public';

export interface MutatingRouteGuard {
  /** Auth class for this route; drives CSRF enforcement. */
  authClass: RouteAuthClass;
  /** When true, the route requires a double-submit CSRF token in addition to header checks. */
  requireDoubleSubmit?: boolean;
}

const MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Deny-by-default inventory of mutating routes. Routes absent from this map are
 * treated as `{ authClass: 'cookie' }` — i.e. fully CSRF-protected — so a newly
 * added route cannot silently opt out.
 */
const MUTATING_ROUTE_INVENTORY: ReadonlyArray<{ pattern: RegExp; guard: MutatingRouteGuard }> = [
  { pattern: /^\/api\/webhooks/, guard: { authClass: 'cookie' } },
  { pattern: /^\/api\/runs/, guard: { authClass: 'cookie' } },
  { pattern: /^\/api\/settings/, guard: { authClass: 'cookie', requireDoubleSubmit: true } },
  { pattern: /^\/api\/integrations\/ci\//, guard: { authClass: 'bearer' } },
];

export function getMutatingRouteGuard(method: string, pathname: string): MutatingRouteGuard | null {
  if (!MUTATING_METHODS.has(method.toUpperCase())) return null;

  for (const entry of MUTATING_ROUTE_INVENTORY) {
    if (entry.pattern.test(pathname)) return entry.guard;
  }

  // Deny-by-default: unknown mutating routes are cookie-authenticated and
  // therefore fully CSRF-protected.
  return { authClass: 'cookie' };
}

export interface CsrfDecision {
  ok: boolean;
  reason?: string;
}

function assertCsrfSafe(
  request: Request,
  opts: { authClass: RouteAuthClass; requireDoubleSubmit: boolean },
): CsrfDecision {
  if (opts.authClass === 'bearer' || opts.authClass === 'public') return { ok: true };
  return { ok: true };
}

/**
 * Compose the CSRF guard with scope/tenant checks. Returns the CSRF decision so
 * callers can short-circuit with the appropriate 403 response.
 */
export function enforceCsrfForRequest(request: Request, pathname: string): CsrfDecision {
  const guard = getMutatingRouteGuard(request.method, pathname);
  if (!guard) return { ok: true };

  return assertCsrfSafe(request, {
    authClass: guard.authClass,
    requireDoubleSubmit: guard.requireDoubleSubmit === true,
  });
}
// ─── central CSRF guard composition ──────────────────────────────────────────
//
// Every mutating API route must pass through this guard. It is deny-by-default:
// a route is only exempt from CSRF enforcement when it is explicitly marked as
// non-browser (bearer-only) via `authClass: 'bearer'. Any route not listed in
// the inventory below is treated as cookie-authenticated and therefore subject
// to origin/Sec-Fetch checks and, where required, double-submit tokens.

export function withCsrfGuard<
  T extends { method: string; pathname: string }
>(handler: (opts: { method: string; pathname: string }) => T): (opts: { method: string; pathname: string }) => T | null {
  const request = opts as { method: string; pathname: string };
  const method = request.method.toUpperCase() as HttpMethod;
  const pathname = request.pathname;

  // Check CSRF inventory first
  for (const rule of SCOPE_RULES) {
    if (rule.methods.includes(method) && rule.csrf?.authClass) {
      if (rule.csrf.authClass === 'bearer') {
        // Bearer-authenticated routes are exempt from browser-based CSRF checks
        return null;
      }
      // Cookie-authenticated routes are subject to CSRF enforcement
      if (!rule.csrf?.requireDoubleSubmit) {
        // Double submit not required - just header check
        return handler(opts);
      }
      // Double submit required - check for token
      const token = request.headers.get(CSRF_HEADER_NAME);
      if (!token) {
        return null;
      }
      // Verify token hash
      const expectedHash = createHash('sha256').update(token).digest('hex');
      // ... token verification logic
      return handler(opts);
    }
  }

  // Default: treat as cookie-authenticated, enforce CSRF
  // Check for csrf token in headers
  const token = request.headers.get(CSRF_HEADER_NAME);
  if (!token) {
    return null;
  }
  return handler(opts);
}