import { NextRequest, NextResponse } from 'next/server';

export type UserRole = 'analyst' | 'maintainer';

export interface RbacAuditEntry {
  timestamp: string;
  principalRole: UserRole;
  action: string;
  path: string;
  requiredRole: UserRole;
  outcome: 'allowed' | 'denied';
}

const auditLogBuffer: RbacAuditEntry[] = [];

/**
 * Log RBAC authorization events into audit buffer.
 */
export function logRbacAudit(entry: Omit<RbacAuditEntry, 'timestamp'>): void {
  const record: RbacAuditEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  auditLogBuffer.push(record);
  if (auditLogBuffer.length > 500) {
    auditLogBuffer.shift();
  }
}

/**
 * Retrieve audit log entries (for audit-log inspection or testing).
 */
export function getRbacAuditLogs(): RbacAuditEntry[] {
  return [...auditLogBuffer];
}

/**
 * Clear audit log buffer (useful in test setups).
 */
export function clearRbacAuditLogs(): void {
  auditLogBuffer.length = 0;
}

/**
 * Check if the user's role satisfies the required role.
 * 'maintainer' satisfies both 'maintainer' and 'analyst'.
 * 'analyst' satisfies 'analyst', but not 'maintainer'.
 */
export function hasRequiredRole(userRole: UserRole, requiredRole: UserRole): boolean {
  if (userRole === 'maintainer') return true;
  if (requiredRole === 'analyst') return true;
  return false;
}

/**
 * Resolves the authenticated principal's role.
 * In development / test environment, checks header `x-crashlab-role` or `x-crashlab-principal-role`.
 * In production environment, development override headers are strictly IGNORED and stripped.
 */
export function resolvePrincipalRole(request: NextRequest): UserRole {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const overrideHeader =
      request.headers.get('x-crashlab-role') ||
      request.headers.get('x-crashlab-principal-role');

    if (overrideHeader) {
      const normalized = overrideHeader.toLowerCase().trim();
      if (normalized === 'maintainer' || normalized === 'analyst') {
        return normalized;
      }
    }
  }

  // Default principal role fallback
  return 'analyst';
}

export interface RouteRoleRule {
  methods: string[];
  pattern: RegExp;
  requiredRole: UserRole;
}

/**
 * Inventory table of route-level role requirements across mutating API endpoints.
 */
export const ROUTE_ROLE_RULES: RouteRoleRule[] = [
  // Destructive / Config endpoints -> maintainer
  { methods: ['DELETE'], pattern: /^\/api\/runs\/[^/]+$/, requiredRole: 'maintainer' },
  { methods: ['POST'], pattern: /^\/api\/runs\/[^/]+\/replay$/, requiredRole: 'maintainer' },
  { methods: ['POST', 'PUT', 'DELETE'], pattern: /^\/api\/settings(\/.*)?$/, requiredRole: 'maintainer' },
  { methods: ['POST'], pattern: /^\/api\/sentry\/config$/, requiredRole: 'maintainer' },
  { methods: ['POST'], pattern: /^\/api\/sentry\/test-connection$/, requiredRole: 'maintainer' },
  { methods: ['POST'], pattern: /^\/api\/integrations\/smtp\/config$/, requiredRole: 'maintainer' },
  { methods: ['POST'], pattern: /^\/api\/integrations\/smtp\/test-connection$/, requiredRole: 'maintainer' },
  { methods: ['POST'], pattern: /^\/api\/integrations\/grafana\/config$/, requiredRole: 'maintainer' },
  { methods: ['POST'], pattern: /^\/api\/integrations\/grafana\/test-connection$/, requiredRole: 'maintainer' },
  { methods: ['POST'], pattern: /^\/api\/integrations\/pagerduty\/config$/, requiredRole: 'maintainer' },
  { methods: ['POST'], pattern: /^\/api\/integrations\/pagerduty\/test-connection$/, requiredRole: 'maintainer' },
  { methods: ['POST', 'PUT', 'DELETE'], pattern: /^\/api\/networks(\/.*)?$/, requiredRole: 'maintainer' },
  { methods: ['POST', 'DELETE'], pattern: /^\/api\/webhooks(\/.*)?$/, requiredRole: 'maintainer' },
  { methods: ['POST'], pattern: /^\/api\/webhooks\/retry$/, requiredRole: 'maintainer' },
  { methods: ['POST'], pattern: /^\/api\/campaigns(\/.*)?$/, requiredRole: 'maintainer' },

  // Annotation / Triage / Action endpoints -> analyst
  { methods: ['POST'], pattern: /^\/api\/runs\/[^/]+\/annotations$/, requiredRole: 'analyst' },
  { methods: ['POST'], pattern: /^\/api\/runs\/[^/]+\/tags$/, requiredRole: 'analyst' },
  { methods: ['POST'], pattern: /^\/api\/runs\/[^/]+\/issues$/, requiredRole: 'analyst' },
  { methods: ['POST'], pattern: /^\/api\/integrations\/smtp\/send$/, requiredRole: 'analyst' },
  { methods: ['POST'], pattern: /^\/api\/integrations\/grafana\/annotations$/, requiredRole: 'analyst' },
  { methods: ['POST'], pattern: /^\/api\/integrations\/pagerduty\/trigger$/, requiredRole: 'analyst' },
  { methods: ['POST'], pattern: /^\/api\/artifacts\/validate$/, requiredRole: 'analyst' },
  { methods: ['POST'], pattern: /^\/api\/integrations\/slack\/interactivity$/, requiredRole: 'analyst' },
  { methods: ['POST'], pattern: /^\/api\/triage\/.*$/, requiredRole: 'analyst' },
];

/**
 * Determine required role for a given request path and method.
 * Returns null if no specific role restriction applies (e.g. GET requests or unlisted endpoints).
 */
export function getRequiredRoleForRequest(method: string, pathname: string): UserRole | null {
  const upperMethod = method.toUpperCase();

  // Read-only GET / OPTIONS / HEAD do not require mutating permissions
  if (['GET', 'HEAD', 'OPTIONS'].includes(upperMethod)) {
    return null;
  }

  for (const rule of ROUTE_ROLE_RULES) {
    if (rule.methods.includes(upperMethod) && rule.pattern.test(pathname)) {
      return rule.requiredRole;
    }
  }

  // Fallback for any other mutating request on /api
  if (pathname.startsWith('/api/')) {
    return 'analyst';
  }

  return null;
}

/**
 * Enforce RBAC rules on an incoming request.
 * Returns a 403 response if forbidden, or null if allowed.
 */
export function checkRbacPermission(request: NextRequest): NextResponse | null {
  const pathname = request.nextUrl.pathname;
  const method = request.method;
  const requiredRole = getRequiredRoleForRequest(method, pathname);

  if (!requiredRole) {
    return null; // Allowed, no role requirement
  }

  const principalRole = resolvePrincipalRole(request);

  if (!hasRequiredRole(principalRole, requiredRole)) {
    logRbacAudit({
      principalRole,
      action: `${method} ${pathname}`,
      path: pathname,
      requiredRole,
      outcome: 'denied',
    });

    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN_INSUFFICIENT_ROLE',
          message: `Access denied. Action '${method} ${pathname}' requires '${requiredRole}' role, but principal role is '${principalRole}'.`,
          requiredRole,
          currentRole: principalRole,
        },
      },
      { status: 403 },
    );
  }

  logRbacAudit({
    principalRole,
    action: `${method} ${pathname}`,
    path: pathname,
    requiredRole,
    outcome: 'allowed',
  });

  return null;
}
