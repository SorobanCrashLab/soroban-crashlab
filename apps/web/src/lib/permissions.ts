'use client';

/**
 * lib/permissions — the client-side capability mirror (#1880).
 *
 * Two server-owned sources meet here:
 *
 *  1. `GET /api/settings/roles/me` — the caller's resolved role, read through
 *     the same `describePrincipal` lookup the server authorizes with.
 *  2. `lib/route-catalog.ts` — the W5-C15 declarative route registry that
 *     decides which role each API route requires.
 *
 * A capability is therefore *derived*, never declared: its required role is
 * read back out of the route catalog (one source of truth — a catalog change
 * changes the UI automatically), and whether the caller holds it is computed
 * from the role the server reported.
 *
 * **No client-side security claims.** Nothing here grants, elevates or
 * verifies authority. The server stays the only enforcer: `route-guard.ts`
 * and `rbac.ts` run on every API request regardless of what this mirror
 * thinks. Gating the UI with this module only removes dead ends — a control
 * the caller cannot use is disabled or hidden *with an explanation* instead
 * of firing a request that answers 403.
 *
 * **Caching.** Effective access is fetched once, cached module-side with a
 * short stale window, revalidated on window focus/visibility, and dropped
 * entirely by `invalidateAccessCache()` when a session change is known.
 * Sign-in/sign-out flows hard-navigate today, which reloads this module and
 * clears the cache as a matter of course; `invalidateAccessCache()` is the
 * explicit seam for any future in-app session transition.
 */

import { useCallback, useEffect, useState } from 'react';
import { ROUTE_CATALOG, routePathMatches } from './route-catalog';
import type { UserRole } from './storage/role-store';

// ─── capability registry ─────────────────────────────────────────────────────

export type CapabilityCode =
  | 'artifacts:manage'
  | 'audit:checkpoint'
  | 'campaigns:create'
  | 'database:migrate'
  | 'networks:manage'
  | 'roles:manage'
  | 'runs:annotate'
  | 'runs:create'
  | 'runs:delete'
  | 'runs:replay'
  | 'schedules:manage'
  | 'settings:write'
  | 'tokens:manage';

export interface CapabilityDefinition {
  code: CapabilityCode;
  /** Human label used in 403 copy, gate notes and the capability matrix. */
  label: string;
  /** What the capability lets the caller do. */
  description: string;
  /** Who can grant it (used by the 403 recovery page). */
  whoToAsk: string;
  /**
   * `${METHOD} ${route-catalog path}` selectors this capability covers. The
   * required role is derived from those catalog entries — never restated
   * here — so the registry cannot drift from the server's policy.
   */
  routes: readonly string[];
}

const CAPABILITY_REGISTRY: Record<CapabilityCode, CapabilityDefinition> = {
  'runs:create': {
    code: 'runs:create',
    label: 'Start fuzzing runs',
    description: 'Queue new fuzzing runs through the API.',
    whoToAsk: 'a maintainer',
    routes: ['POST /api/runs'],
  },
  'runs:annotate': {
    code: 'runs:annotate',
    label: 'Annotate and triage runs',
    description: 'Add annotations, issue links and tags to runs.',
    whoToAsk: 'a maintainer',
    routes: [
      'POST /api/runs/[id]/annotations',
      'DELETE /api/runs/[id]/annotations',
      'POST /api/runs/[id]/issues',
      'DELETE /api/runs/[id]/issues',
      'POST /api/runs/[id]/tags',
      'DELETE /api/runs/[id]/tags',
    ],
  },
  'runs:replay': {
    code: 'runs:replay',
    label: 'Replay crashes',
    description: 'Trigger seed replays from a crash detail.',
    whoToAsk: 'a maintainer',
    routes: ['POST /api/runs/[id]/replay'],
  },
  'runs:delete': {
    code: 'runs:delete',
    label: 'Delete runs',
    description: 'Remove runs, including bulk deletion from the runs table.',
    whoToAsk: 'a maintainer',
    routes: ['DELETE /api/runs/[id]'],
  },
  'campaigns:create': {
    code: 'campaigns:create',
    label: 'Launch fuzzing campaigns',
    description: 'Create new fuzzing campaigns from the Start flow.',
    whoToAsk: 'a maintainer',
    routes: ['POST /api/campaigns'],
  },
  'schedules:manage': {
    code: 'schedules:manage',
    label: 'Manage schedules',
    description: 'Create, edit, delete and tick run schedules.',
    whoToAsk: 'a maintainer',
    routes: [
      'POST /api/schedules',
      'PUT /api/schedules/[id]',
      'DELETE /api/schedules/[id]',
      'POST /api/schedules/tick',
    ],
  },
  'artifacts:manage': {
    code: 'artifacts:manage',
    label: 'Manage artifacts',
    description: 'Upload, validate and remove run artifacts.',
    whoToAsk: 'a maintainer',
    routes: [
      'POST /api/artifacts',
      'POST /api/artifacts/validate',
      'DELETE /api/artifacts/[id]',
    ],
  },
  'audit:checkpoint': {
    code: 'audit:checkpoint',
    label: 'Record audit checkpoints',
    description: 'Append integrity checkpoints to the audit trail.',
    whoToAsk: 'a maintainer',
    routes: ['POST /api/audit/checkpoint'],
  },
  'database:migrate': {
    code: 'database:migrate',
    label: 'Run database migrations',
    description: 'Apply pending database migrations.',
    whoToAsk: 'a maintainer',
    routes: ['POST /api/database/migrations'],
  },
  'networks:manage': {
    code: 'networks:manage',
    label: 'Manage network endpoints',
    description: 'Add, remove and switch Stellar RPC / Horizon endpoints.',
    whoToAsk: 'a maintainer',
    routes: [
      'POST /api/networks',
      'DELETE /api/networks/[id]',
      'PUT /api/networks/active',
    ],
  },
  'settings:write': {
    code: 'settings:write',
    label: 'Administer settings',
    description: 'Change alerting, notification, Sentry and deployment settings.',
    whoToAsk: 'a maintainer',
    routes: [
      'PUT /api/settings/alerting',
      'POST /api/settings/alerting',
      'POST /api/settings/notifications',
      'POST /api/sentry/config',
      'POST /api/sentry/test-connection',
    ],
  },
  'roles:manage': {
    code: 'roles:manage',
    label: 'Manage role assignments',
    description: 'Assign and revoke analyst / maintainer roles for identities.',
    whoToAsk: 'a maintainer',
    routes: ['POST /api/settings/roles', 'DELETE /api/settings/roles'],
  },
  'tokens:manage': {
    code: 'tokens:manage',
    label: 'Manage API tokens',
    description: 'Create, rotate and revoke scoped API tokens.',
    whoToAsk: 'a maintainer',
    routes: [
      'POST /api/settings/tokens',
      'POST /api/settings/tokens/[id]/rotate',
      'POST /api/settings/tokens/[id]/revoke',
    ],
  },
};

export const CAPABILITY_CODES: readonly CapabilityCode[] = Object.freeze(
  Object.keys(CAPABILITY_REGISTRY) as CapabilityCode[],
);

// ─── role derivation (from the W5-C15 route catalog) ─────────────────────────

const SELECTOR_PATTERN = /^([A-Z]+) (\S+)$/;

function splitSelector(selector: string): { method: string; path: string } | null {
  const match = SELECTOR_PATTERN.exec(selector);
  if (!match) return null;
  return { method: match[1], path: match[2] };
}

/** Returns the registry entry for a code, or `undefined` for unknown codes. */
export function getCapability(code: string): CapabilityDefinition | undefined {
  if (Object.prototype.hasOwnProperty.call(CAPABILITY_REGISTRY, code)) {
    return CAPABILITY_REGISTRY[code as CapabilityCode];
  }
  return undefined;
}

/**
 * The role the route catalog requires for every route a capability covers.
 * Returns `null` for an unknown capability or a code whose routes do not
 * resolve in the catalog (the consistency tests make both impossible for
 * registered codes).
 */
export function requiredRoleForCapability(code: CapabilityCode): UserRole | null {
  const definition = getCapability(code);
  if (!definition) return null;

  let required: UserRole | null = null;
  for (const selector of definition.routes) {
    const parts = splitSelector(selector);
    if (!parts) continue;
    const entry = ROUTE_CATALOG.find(
      (candidate) => candidate.method === parts.method && routePathMatches(candidate.path, parts.path),
    );
    const role = entry?.requiredCapability?.role ?? null;
    if (!role) continue;
    if (required === null) {
      required = role;
    }
  }
  return required;
}

/**
 * Mirrors `rbac.hasRequiredRole` — maintainer satisfies both roles, analyst
 * satisfies only analyst. Kept as a local, dependency-free mirror because
 * `lib/rbac.ts` is server middleware code (NextRequest, storage drivers) that
 * must not enter the client bundle; `permissions.test.ts` asserts parity so
 * the two rules cannot drift apart.
 */
export function hasRequiredRole(userRole: UserRole, requiredRole: UserRole): boolean {
  if (userRole === 'maintainer') return true;
  return requiredRole === 'analyst';
}

/** Whether the given role holds the capability. Unknown roles/codes → false. */
export function can(role: UserRole | null | undefined, code: CapabilityCode): boolean {
  const required = requiredRoleForCapability(code);
  if (!role || !required) return false;
  return hasRequiredRole(role, required);
}

/**
 * The capability a concrete API request would need, or `null` when no
 * capability in the registry claims the route (read-only requests, routes
 * outside the browser surface). Used by tests and by 403 recovery copy.
 */
export function capabilityForRoute(method: string, pathname: string): CapabilityCode | null {
  const upper = method.toUpperCase();
  for (const code of CAPABILITY_CODES) {
    for (const selector of CAPABILITY_REGISTRY[code].routes) {
      const parts = splitSelector(selector);
      if (!parts) continue;
      if (parts.method === upper && routePathMatches(parts.path, pathname)) return code;
    }
  }
  return null;
}

/**
 * The single explanation shown wherever a gate denies access: human label,
 * technical code, required role, current role and who to ask.
 */
export function explainCapability(code: string, role?: UserRole | null): string {
  const definition = getCapability(code);
  const required = getCapability(code) ? requiredRoleForCapability(code as CapabilityCode) : null;
  const you = role ? `You are signed in as ${role}.` : 'You are not signed in.';

  if (!definition || !required) {
    return `Access requires the '${code}' capability, which this deployment did not recognise. ${you} Ask a maintainer if you believe this is wrong.`;
  }

  return (
    `${definition.label} (${definition.code}) requires the ${required} role. ` +
    `${you} Ask ${definition.whoToAsk} to grant your identity access — ` +
    `they manage assignments in Settings → Roles.`
  );
}

/**
 * Explanation for a gate that is denied because access is not (yet) known:
 * during the lookup the gate stays closed, but the copy must not claim the
 * caller lacks a role we have not read yet.
 */
export function explainGate(code: string, status: AccessStatus, role?: UserRole | null): string {
  if (status === 'ready') return explainCapability(code, role);
  if (status === 'loading') {
    const label = getCapability(code)?.label ?? code;
    return `Verifying your access to ${label}…`;
  }
  return (
    `We could not verify your access to '${code}' — the role lookup failed. ` +
    `The server still authorizes every request, so nothing is granted by reloading this page.`
  );
}

// ─── effective access (capability source: GET /api/settings/roles/me) ────────

export interface EffectiveAccess {
  principal: {
    identityType: string;
    identityValue: string;
    subject: string;
    authenticated: boolean;
  };
  role: UserRole;
  capabilities: {
    canAnnotate: boolean;
    canAdminister: boolean;
  };
  maintainerCount: number;
  gitHubSessionsEnabled: boolean;
}

export type AccessStatus = 'loading' | 'ready' | 'error';

const ACCESS_ENDPOINT = '/api/settings/roles/me';
const ACCESS_STALE_TIME_MS = 30_000;

let accessCache: EffectiveAccess | null = null;
let accessCacheAt = 0;
let accessInflight: Promise<EffectiveAccess> | null = null;

/** Drops the cached access so the next read re-fetches (session invalidation). */
export function invalidateAccessCache(): void {
  accessCache = null;
  accessCacheAt = 0;
  accessInflight = null;
}

/** Test seam: the cached snapshot, without triggering a fetch. */
export function peekEffectiveAccess(): EffectiveAccess | null {
  return accessCache;
}

/**
 * Seeds the module cache with an already-resolved snapshot (tests, and any
 * future caller that resolved access server-side and wants to hand it over).
 * Returns a function that clears the seed again.
 */
export function primeEffectiveAccess(access: EffectiveAccess): () => void {
  accessCache = access;
  accessCacheAt = Date.now();
  accessInflight = null;
  return invalidateAccessCache;
}

function isRole(value: unknown): value is UserRole {
  return value === 'analyst' || value === 'maintainer';
}

async function requestEffectiveAccess(): Promise<EffectiveAccess> {
  const response = await fetch(ACCESS_ENDPOINT, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(`Effective access request failed with ${response.status}`);
  }
  const payload = (await response.json()) as Partial<EffectiveAccess> & { role?: unknown };

  // Anything the server did not classify resolves to the lowest role — the
  // same default the server applies to an unassigned principal.
  const role: UserRole = isRole(payload.role) ? payload.role : 'analyst';
  return {
    principal: {
      identityType: payload.principal?.identityType ?? 'anonymous',
      identityValue: payload.principal?.identityValue ?? 'anonymous',
      subject: payload.principal?.subject ?? 'anonymous',
      authenticated: payload.principal?.authenticated ?? false,
    },
    role,
    capabilities: {
      canAnnotate: payload.capabilities?.canAnnotate ?? hasRequiredRole(role, 'analyst'),
      canAdminister: payload.capabilities?.canAdminister ?? hasRequiredRole(role, 'maintainer'),
    },
    maintainerCount:
      typeof payload.maintainerCount === 'number' && payload.maintainerCount >= 0
        ? payload.maintainerCount
        : 0,
    gitHubSessionsEnabled: payload.gitHubSessionsEnabled === true,
  };
}

/**
 * Cache-aware load: serves the fresh cache, joins an in-flight request, or
 * issues one. Callers share a single network round trip per stale window.
 */
export function resolveEffectiveAccess(): Promise<EffectiveAccess> {
  if (accessInflight) return accessInflight;
  if (accessCache && Date.now() - accessCacheAt < ACCESS_STALE_TIME_MS) {
    return Promise.resolve(accessCache);
  }
  const inflight = requestEffectiveAccess()
    .then((access) => {
      accessCache = access;
      accessCacheAt = Date.now();
      return access;
    })
    .finally(() => {
      if (accessInflight === inflight) accessInflight = null;
    });
  accessInflight = inflight;
  return inflight;
}

export interface EffectiveAccessState {
  /** The server-reported access, or `null` while loading / on failure. */
  access: EffectiveAccess | null;
  status: AccessStatus;
  role: UserRole | null;
  /** Bound capability check. False until the role is known (never optimistic). */
  can: (code: CapabilityCode) => boolean;
  /** Forces a fresh fetch (drops the cache first). */
  refetch: () => void;
}

export function useEffectiveAccess(): EffectiveAccessState {
  const [access, setAccess] = useState<EffectiveAccess | null>(() => accessCache);
  const [status, setStatus] = useState<AccessStatus>(() => (accessCache ? 'ready' : 'loading'));
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Intended fetch-on-mount pattern (same shape as useRuns): the async body
    // settles before it touches state.
    void resolveEffectiveAccess()
      .then((result) => {
        if (!cancelled) {
          setAccess(result);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Fail soft: keep any cached snapshot, otherwise report `error`.
          // Callers treat `error` like `loading` for gating (deny until known),
          // except RequireCapability which fails open — the server enforces.
          setStatus(accessCache ? 'ready' : 'error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  // Revalidate when the caller comes back to the tab: a session may have
  // changed elsewhere (sign-out in another tab, role granted meanwhile).
  useEffect(() => {
    let active = true;

    const revalidate = () => {
      void resolveEffectiveAccess()
        .then((result) => {
          if (active) {
            setAccess(result);
            setStatus('ready');
          }
        })
        .catch(() => {
          // Keep showing the last known access; the server still decides.
        });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') revalidate();
    };

    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      active = false;
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const refetch = useCallback(() => {
    invalidateAccessCache();
    setReloadToken((token) => token + 1);
  }, []);

  const check = useCallback(
    (code: CapabilityCode) => status === 'ready' && access !== null && can(access.role, code),
    [status, access],
  );

  return {
    access,
    status,
    role: access?.role ?? null,
    can: check,
    refetch,
  };
}

export default useEffectiveAccess;
