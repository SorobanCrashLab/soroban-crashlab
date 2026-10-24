import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAPABILITY_CODES,
  can,
  capabilityForRoute,
  explainCapability,
  explainGate,
  getCapability,
  hasRequiredRole,
  invalidateAccessCache,
  peekEffectiveAccess,
  primeEffectiveAccess,
  requiredRoleForCapability,
  resolveEffectiveAccess,
  type CapabilityCode,
  type EffectiveAccess,
} from './permissions';
import { ROUTE_CATALOG } from './route-catalog';
import { hasRequiredRole as rbacHasRequiredRole } from './rbac';

function makeAccess(role: 'analyst' | 'maintainer'): EffectiveAccess {
  return {
    principal: {
      identityType: 'anonymous',
      identityValue: 'anonymous',
      subject: 'user:anon',
      authenticated: false,
    },
    role,
    capabilities: {
      canAnnotate: true,
      canAdminister: role === 'maintainer',
    },
    maintainerCount: 1,
    gitHubSessionsEnabled: false,
  };
}

describe('capability registry ↔ route catalog consistency', () => {
  it('exposes exactly the expected capability codes', () => {
    expect([...CAPABILITY_CODES]).toEqual([
      'runs:create',
      'runs:annotate',
      'runs:replay',
      'runs:delete',
      'campaigns:create',
      'schedules:manage',
      'artifacts:manage',
      'audit:checkpoint',
      'database:migrate',
      'networks:manage',
      'settings:write',
      'roles:manage',
      'tokens:manage',
    ]);
  });

  it('resolves every registered selector to the same capability in the catalog', () => {
    for (const code of CAPABILITY_CODES) {
      const definition = getCapability(code);
      expect(definition, code).toBeDefined();
      for (const selector of definition!.routes) {
        const [method, path] = selector.split(' ');
        expect(
          capabilityForRoute(method, path),
          `${code}: ${selector}`,
        ).toBe(code);
      }
    }
  });

  it('uses unique selectors across capabilities (no overlap to fight over)', () => {
    const seen = new Map<string, CapabilityCode>();
    for (const code of CAPABILITY_CODES) {
      for (const selector of getCapability(code)!.routes) {
        const clash = seen.get(selector);
        expect(clash, `${selector} claimed by ${clash} and ${code}`).toBeUndefined();
        seen.set(selector, code);
      }
    }
  });

  it('keeps every selector in METHOD PATH form', () => {
    for (const code of CAPABILITY_CODES) {
      for (const selector of getCapability(code)!.routes) {
        expect(selector, `${code}: ${selector}`).toMatch(/^[A-Z]+ \S+$/);
      }
    }
  });

  it('claims every session-auth mutating route (token-class routes excluded)', () => {
    const unclaimed = ROUTE_CATALOG.filter(
      (entry) =>
        entry.method !== 'GET' &&
        entry.authClass === 'session' &&
        entry.requiredCapability !== null,
    )
      .filter((entry) => capabilityForRoute(entry.method, entry.path) === null)
      .map((entry) => `${entry.method} ${entry.path}`);

    expect(unclaimed).toEqual([]);
  });

  it('never claims a route the catalog does not register', () => {
    for (const code of CAPABILITY_CODES) {
      for (const selector of getCapability(code)!.routes) {
        const [method, path] = selector.split(' ');
        const entry = ROUTE_CATALOG.find(
          (candidate) =>
            candidate.method === method && candidate.path === path,
        );
        expect(entry, selector).toBeDefined();
        expect(entry?.requiredCapability?.role, selector).not.toBeNull();
      }
    }
  });
});

describe('requiredRoleForCapability', () => {
  it('derives each capability role from the route catalog', () => {
    // Derived, not declared — this table locks in today's catalog policy so a
    // catalog change is either reflected here deliberately or fails loudly.
    const expected: Record<CapabilityCode, 'analyst' | 'maintainer'> = {
      'artifacts:manage': 'analyst',
      'audit:checkpoint': 'analyst',
      'campaigns:create': 'maintainer',
      'database:migrate': 'analyst',
      'networks:manage': 'maintainer',
      'roles:manage': 'maintainer',
      'runs:annotate': 'analyst',
      'runs:create': 'analyst',
      'runs:delete': 'maintainer',
      'runs:replay': 'maintainer',
      'schedules:manage': 'analyst',
      'settings:write': 'maintainer',
      'tokens:manage': 'maintainer',
    };

    for (const [code, role] of Object.entries(expected)) {
      expect(requiredRoleForCapability(code as CapabilityCode), code).toBe(role);
    }
  });

  it('returns null for an unknown capability', () => {
    expect(requiredRoleForCapability('bogus:capability' as CapabilityCode)).toBeNull();
  });
});

describe('hasRequiredRole parity with lib/rbac.ts', () => {
  it('matches the server rule for every role pair', () => {
    const roles = ['analyst', 'maintainer'] as const;
    for (const userRole of roles) {
      for (const requiredRole of roles) {
        expect(hasRequiredRole(userRole, requiredRole)).toBe(
          rbacHasRequiredRole(userRole, requiredRole),
        );
      }
    }
  });

  it('maintainer satisfies both roles, analyst only analyst', () => {
    expect(hasRequiredRole('maintainer', 'maintainer')).toBe(true);
    expect(hasRequiredRole('maintainer', 'analyst')).toBe(true);
    expect(hasRequiredRole('analyst', 'analyst')).toBe(true);
    expect(hasRequiredRole('analyst', 'maintainer')).toBe(false);
  });
});

describe('can', () => {
  it('grants analysts only capabilities whose catalog role is analyst', () => {
    const granted = CAPABILITY_CODES.filter((code) => can('analyst', code));
    expect(granted).toEqual([
      'runs:create',
      'runs:annotate',
      'schedules:manage',
      'artifacts:manage',
      'audit:checkpoint',
      'database:migrate',
    ]);
  });

  it('grants maintainers every registered capability', () => {
    const denied = CAPABILITY_CODES.filter((code) => !can('maintainer', code));
    expect(denied).toEqual([]);
  });

  it('denies unknown or missing roles', () => {
    expect(can(null, 'runs:replay')).toBe(false);
    expect(can(undefined, 'runs:replay')).toBe(false);
    expect(can('analyst', 'bogus:capability' as CapabilityCode)).toBe(false);
  });
});

describe('capabilityForRoute', () => {
  it('matches parameterized catalog paths', () => {
    expect(capabilityForRoute('POST', '/api/runs/run-1002/replay')).toBe('runs:replay');
    expect(capabilityForRoute('delete', '/api/runs/run-1002')).toBe('runs:delete');
    expect(capabilityForRoute('DELETE', '/api/settings/roles')).toBe('roles:manage');
    expect(capabilityForRoute('POST', '/api/settings/tokens/tok-1/rotate')).toBe(
      'tokens:manage',
    );
  });

  it('returns null for reads and unclaimed routes', () => {
    expect(capabilityForRoute('GET', '/api/runs')).toBeNull();
    expect(capabilityForRoute('GET', '/api/settings/roles')).toBeNull();
    expect(capabilityForRoute('POST', '/api/unknown')).toBeNull();
  });
});

describe('explanations', () => {
  it('names the capability, required role and where to ask', () => {
    const text = explainCapability('roles:manage', 'analyst');
    expect(text).toContain('Manage role assignments');
    expect(text).toContain('roles:manage');
    expect(text).toContain('requires the maintainer role');
    expect(text).toContain('You are signed in as analyst.');
    expect(text).toContain('Settings → Roles');
  });

  it('says so when the caller is anonymous', () => {
    expect(explainCapability('runs:replay', null)).toContain('You are not signed in.');
  });

  it('flags capabilities the deployment does not know', () => {
    const text = explainCapability('bogus:capability', 'analyst');
    expect(text).toContain('bogus:capability');
    expect(text).toContain('did not recognise');
  });

  it('vary by access status so loading copy never claims a missing role', () => {
    expect(explainGate('roles:manage', 'loading', null)).toBe(
      'Verifying your access to Manage role assignments…',
    );
    expect(explainGate('roles:manage', 'error', null)).toContain('could not verify');
    expect(explainGate('roles:manage', 'error', null)).toContain('server still authorizes');
    expect(explainGate('roles:manage', 'ready', 'analyst')).toBe(
      explainCapability('roles:manage', 'analyst'),
    );
  });
});

describe('effective access cache', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    invalidateAccessCache();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    invalidateAccessCache();
    vi.unstubAllGlobals();
  });

  it('fetches once and serves the fresh cache afterwards', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => makeAccess('maintainer'),
    });

    const first = await resolveEffectiveAccess();
    const second = await resolveEffectiveAccess();

    expect(first.role).toBe('maintainer');
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/roles/me',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('joins an in-flight request instead of issuing a second one', async () => {
    let release!: (value: unknown) => void;
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    const a = resolveEffectiveAccess();
    const b = resolveEffectiveAccess();
    expect(a).toBe(b);

    release({ ok: true, json: async () => makeAccess('analyst') });
    await a;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-fetches after invalidation', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => makeAccess('analyst'),
    });

    await resolveEffectiveAccess();
    invalidateAccessCache();
    await resolveEffectiveAccess();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws on a non-2xx response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(resolveEffectiveAccess()).rejects.toThrow('500');
    expect(peekEffectiveAccess()).toBeNull();
  });

  it('falls back to analyst when the server reports an unknown role', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ role: 'superuser', capabilities: {} }),
    });

    const access = await resolveEffectiveAccess();
    expect(access.role).toBe('analyst');
    expect(access.capabilities.canAnnotate).toBe(true);
    expect(access.capabilities.canAdminister).toBe(false);
    expect(peekEffectiveAccess()?.role).toBe('analyst');
  });

  it('primes and clears the cache through the test seams', async () => {
    primeEffectiveAccess(makeAccess('maintainer'));
    expect(peekEffectiveAccess()?.role).toBe('maintainer');
    invalidateAccessCache();
    expect(peekEffectiveAccess()).toBeNull();
  });
});
