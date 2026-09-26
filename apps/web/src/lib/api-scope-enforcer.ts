import { ApiTokenScope } from './storage/api-token-store';

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
