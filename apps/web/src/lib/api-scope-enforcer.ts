import { ApiTokenScope } from './storage/api-token-store';
import { tenantKeyPrefix } from './tenancy/storage-keys';
import type { TenantScope } from './tenancy/tenant-scope';

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
