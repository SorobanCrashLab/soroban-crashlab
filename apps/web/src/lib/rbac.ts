/**
 * Route-level RBAC bound to an authenticated principal (#1548).
 *
 * Two things changed shape here, and both were the same bug wearing different
 * clothes: an authorization decision that cannot name who made it, and an audit
 * trail that cannot say what happened after the response was sent.
 *
 * **Roles come from a principal, never from the request.** The old resolver
 * read `x-crashlab-role` (or its alias) off the request in every environment
 * except production, which means any caller who could reach the API could
 * declare itself a maintainer. Roles are now looked up by identity — a
 * verified API token or a signed GitHub session — in the persisted role store.
 * A caller that presents no usable credential is the anonymous principal and
 * gets the lowest role. Nothing a caller sends can raise its own role: not a
 * header, not a query parameter, not a cookie, not a request body.
 *
 * **The audit log outlives the process.** It was a module-level array capped at
 * 500 entries, which on serverless means an array that is empty on arrival and
 * holds at most the current invocation. Authorization events now append through
 * the record driver layer, append-only, with a retention policy expressed as a
 * hard entry cap plus an age filter on read.
 *
 * The pure parts — the role hierarchy and the route table — are unchanged, and
 * deliberately still pure: `hasRequiredRole` and `getRequiredRoleForRequest`
 * take a role and a path, not a request, so they can be tested exhaustively
 * without standing up identity.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  GITHUB_SESSION_COOKIE,
  constantTimeHexEqual,
  getGitHubSessionSecret,
  verifyGitHubSession,
} from './github-session';
import { selectRecordDriver, readPositiveIntegerEnv } from './storage/record-driver';
import { getRoleAssignment, type UserIdentity, type UserRole } from './storage/role-store';
import { hashTokenSecret, resolveTokenPrincipalIdByHash } from './storage/token-principal-store';

export type { UserIdentity, UserRole } from './storage/role-store';

/** The lowest role. An unauthenticated caller resolves here and no lower. */
export const DEFAULT_PRINCIPAL_ROLE: UserRole = 'analyst';

/** Identity of the deployment-wide `CRASHLAB_WEBHOOK_API_KEY` credential. */
export const ENV_API_KEY_IDENTITY = 'env:CRASHLAB_WEBHOOK_API_KEY';

export const RBAC_AUDIT_KEY = 'rbac:audit';

/** Hard cap on retained entries. The oldest are dropped once it is reached. */
export const RBAC_AUDIT_MAX_ENTRIES = readPositiveIntegerEnv(
  'CRASHLAB_RBAC_AUDIT_MAX_ENTRIES',
  10_000,
);

/**
 * Age-based retention. Entries older than this are filtered out on read, so a
 * log that is never read stays cheap and a log that is read reports only the
 * window an operator is allowed to see.
 */
export const RBAC_AUDIT_RETENTION_DAYS = readPositiveIntegerEnv(
  'CRASHLAB_RBAC_AUDIT_RETENTION_DAYS',
  90,
);

export type PrincipalIdentityType = UserIdentity | 'anonymous';

export interface RbacPrincipal {
  identityType: PrincipalIdentityType;
  identityValue: string;
  /** Stable, secret-free string written to the audit log. */
  subject: string;
  /** False when no usable credential was presented. */
  authenticated: boolean;
}

export interface RbacAuditEntry {
  id: string;
  timestamp: string;
  /** `${identityType}:${identityValue}`, or `anonymous`. */
  principalSubject: string;
  principalRole: UserRole;
  action: string;
  path: string;
  requiredRole: UserRole;
  outcome: 'allowed' | 'denied';
}

export const ANONYMOUS_PRINCIPAL: RbacPrincipal = {
  identityType: 'anonymous',
  identityValue: 'anonymous',
  subject: 'anonymous',
  authenticated: false,
};

// ─── identity ────────────────────────────────────────────────────────────────

function extractBearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return null;
  return parts[1].length > 0 ? parts[1] : null;
}

function getConfiguredEnvApiKey(): string | undefined {
  const key = process.env.CRASHLAB_WEBHOOK_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : undefined;
}

/**
 * Resolves the authenticated principal for a request.
 *
 * Two credential sources, in order: the deployment API key (an operator-level
 * credential configured in the environment, so its identity is the env var
 * name) and scoped API tokens issued from settings/tokens. Browser sessions
 * carry a signed GitHub cookie.
 *
 * A credential that does not verify — unknown, revoked, expired, forged —
 * resolves to the anonymous principal rather than to an error, because an
 * unverifiable credential carries no more authority than no credential at all.
 */
export async function resolvePrincipal(request: NextRequest): Promise<RbacPrincipal> {
  const bearer = extractBearerToken(request);

  if (bearer) {
    const envKey = getConfiguredEnvApiKey();
    if (envKey) {
      // Compare digests so the compared values are fixed length regardless of
      // the candidate, and fold the difference without short-circuiting.
      const [configuredDigest, presentedDigest] = await Promise.all([
        hashTokenSecret(envKey),
        hashTokenSecret(bearer),
      ]);
      if (constantTimeHexEqual(configuredDigest, presentedDigest)) {
        return {
          identityType: 'api-key',
          identityValue: ENV_API_KEY_IDENTITY,
          subject: `api-key:${ENV_API_KEY_IDENTITY}`,
          authenticated: true,
        };
      }
    }

    const tokenId = await resolveTokenPrincipalIdByHash(await hashTokenSecret(bearer));
    if (tokenId) {
      return {
        identityType: 'api-key',
        identityValue: tokenId,
        subject: `api-key:${tokenId}`,
        authenticated: true,
      };
    }

    return ANONYMOUS_PRINCIPAL;
  }

  const sessionLogin = await verifyGitHubSession(request.cookies.get(GITHUB_SESSION_COOKIE)?.value);
  if (sessionLogin) {
    return {
      identityType: 'github',
      identityValue: sessionLogin,
      subject: `github:${sessionLogin}`,
      authenticated: true,
    };
  }

  return ANONYMOUS_PRINCIPAL;
}

/**
 * The role the persisted store assigns to this principal's identity.
 *
 * Unassigned and unauthenticated callers both fall back to the lowest role. The
 * store is the only place a role can come from — that is the whole point.
 */
export async function resolveRoleForPrincipal(principal: RbacPrincipal): Promise<UserRole> {
  if (principal.identityType === 'anonymous') return DEFAULT_PRINCIPAL_ROLE;
  const assignment = await getRoleAssignment(principal.identityType, principal.identityValue);
  return assignment?.role ?? DEFAULT_PRINCIPAL_ROLE;
}

/**
 * Convenience wrapper: principal identity -> persisted role.
 * Retained as the module's headline entry point for call sites that only need
 * the role.
 */
export async function resolvePrincipalRole(request: NextRequest): Promise<UserRole> {
  return resolveRoleForPrincipal(await resolvePrincipal(request));
}

// ─── audit ───────────────────────────────────────────────────────────────────

function randomId(prefix: string): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${hex}`;
}

function parseAuditEntry(raw: string): RbacAuditEntry | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Partial<RbacAuditEntry>;
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.timestamp !== 'string' ||
      (candidate.outcome !== 'allowed' && candidate.outcome !== 'denied')
    ) {
      return null;
    }
    return candidate as RbacAuditEntry;
  } catch {
    return null;
  }
}

/**
 * Appends one authorization event. Append-only: the driver interface offers
 * push-and-trim and nothing else, so no caller can rewrite what came before.
 *
 * Never throws. A failure to write the trail must not turn an allowed request
 * into a 500 — the availability trade is deliberate and the operator sees the
 * gap as a missing entry rather than a failed action.
 */
export async function logRbacAudit(
  entry: Omit<RbacAuditEntry, 'id' | 'timestamp' | 'principalSubject'> & {
    principalSubject?: string;
  },
): Promise<void> {
  try {
    const record: RbacAuditEntry = {
      id: randomId('rbac'),
      timestamp: new Date().toISOString(),
      principalSubject: entry.principalSubject ?? 'anonymous',
      principalRole: entry.principalRole,
      action: entry.action,
      path: entry.path,
      requiredRole: entry.requiredRole,
      outcome: entry.outcome,
    };
    await selectRecordDriver().appendEntry(
      RBAC_AUDIT_KEY,
      JSON.stringify(record),
      RBAC_AUDIT_MAX_ENTRIES,
    );
  } catch {
    // Auditing must never break the action it records.
  }
}

function retentionCutoff(nowMs: number): number {
  return nowMs - RBAC_AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

/** Newest first, filtered to the retention window. */
export async function getRbacAuditLogs(limit = 100, nowMs = Date.now()): Promise<RbacAuditEntry[]> {
  const driver = selectRecordDriver();
  const retained = await driver.countEntries(RBAC_AUDIT_KEY);
  const window = Math.max(1, Math.min(limit, retained > 0 ? retained : limit));
  const cutoff = retentionCutoff(nowMs);

  const raws = await driver.listEntries(RBAC_AUDIT_KEY, window);
  return raws
    .map(parseAuditEntry)
    .filter((entry): entry is RbacAuditEntry => entry !== null)
    .filter((entry) => {
      const recorded = Date.parse(entry.timestamp);
      return Number.isNaN(recorded) ? false : recorded >= cutoff;
    });
}

/** Test seam: empties the audit log. */
export async function clearRbacAuditLogs(): Promise<void> {
  await selectRecordDriver().trimEntries(RBAC_AUDIT_KEY, 0);
}

// ─── pure policy ─────────────────────────────────────────────────────────────

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

// ─── enforcement ─────────────────────────────────────────────────────────────

/**
 * Enforce RBAC rules on an incoming request.
 *
 * Returns a 403 response if forbidden, or `null` if allowed. Both outcomes are
 * appended to the persistent audit log, attributed to the resolved principal.
 */
export async function checkRbacPermission(request: NextRequest): Promise<NextResponse | null> {
  const pathname = request.nextUrl.pathname;
  const method = request.method;
  const requiredRole = getRequiredRoleForRequest(method, pathname);

  if (!requiredRole) {
    return null; // Allowed, no role requirement
  }

  const principal = await resolvePrincipal(request);
  const principalRole = await resolveRoleForPrincipal(principal);

  if (!hasRequiredRole(principalRole, requiredRole)) {
    await logRbacAudit({
      principalSubject: principal.subject,
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
          principal: principal.subject,
        },
      },
      { status: 403 },
    );
  }

  await logRbacAudit({
    principalSubject: principal.subject,
    principalRole,
    action: `${method} ${pathname}`,
    path: pathname,
    requiredRole,
    outcome: 'allowed',
  });

  return null;
}

/**
 * The caller's resolved identity and role, for settings surfaces that display
 * roles. Exposed so the UI can say "you are an analyst" from the same lookup
 * the server authorizes with, rather than from anything the client holds.
 */
export async function describePrincipal(request: NextRequest): Promise<{
  principal: RbacPrincipal;
  role: UserRole;
  satisfies: (requiredRole: UserRole) => boolean;
}> {
  const principal = await resolvePrincipal(request);
  const role = await resolveRoleForPrincipal(principal);
  return { principal, role, satisfies: (requiredRole) => hasRequiredRole(role, requiredRole) };
}

/** Whether GitHub sessions can be issued at all in this deployment. */
export function isGitHubSessionEnabled(): boolean {
  return getGitHubSessionSecret() !== undefined;
}
