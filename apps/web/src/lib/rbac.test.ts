import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  resolvePrincipal,
  resolvePrincipalRole,
  resolveRoleForPrincipal,
  describePrincipal,
  hasRequiredRole,
  getRequiredRoleForRequest,
  getRbacAuditLogs,
  clearRbacAuditLogs,
  ANONYMOUS_PRINCIPAL,
  DEFAULT_PRINCIPAL_ROLE,
  checkRbacPermission,
  type RbacPrincipal,
} from './rbac';
import { proxy } from '../rate-limit';
import { InMemoryRecordDriver, setRecordDriver, resetRecordDriver } from './storage/record-driver';
import { assignRole, revokeRole, resetRoleStore } from './storage/role-store';
import { registerTokenPrincipal, hashTokenSecret, resetTokenPrincipalStore } from './storage/token-principal-store';

describe('RBAC Middleware & Authorization', () => {
  const originalEnv = process.env.NODE_ENV;
  const env = process.env as Record<string, string>;

  beforeEach(async () => {
    setRecordDriver(new InMemoryRecordDriver());
    await resetRoleStore();
    await resetTokenPrincipalStore();
    await clearRbacAuditLogs();
    env.NODE_ENV = 'test';
  });

  afterEach(() => {
    env.NODE_ENV = originalEnv;
    resetRecordDriver();
  });

  function makeRequest(
    method: string,
    path: string,
    headers: Record<string, string> = {},
  ): NextRequest {
    return new NextRequest(`http://localhost${path}`, {
      method,
      headers: {
        'x-forwarded-for': '127.0.0.1',
        ...headers,
      },
    });
  }

  let tokenCounter = 0;

  /** Issues a token and returns its secret plus the identity it resolves to. */
  async function issueToken(): Promise<{ secret: string; identityValue: string }> {
    tokenCounter += 1;
    const secret = `scl_test_token_${tokenCounter}`;
    const identityValue = `tok_test_${tokenCounter}`;
    await registerTokenPrincipal({ tokenId: identityValue, sha256Hash: await hashTokenSecret(secret) });
    return { secret, identityValue };
  }

  describe('Role Hierarchy & Resolution', () => {
    it('verifies role hierarchy rules', () => {
      expect(hasRequiredRole('maintainer', 'maintainer')).toBe(true);
      expect(hasRequiredRole('maintainer', 'analyst')).toBe(true);
      expect(hasRequiredRole('analyst', 'analyst')).toBe(true);
      expect(hasRequiredRole('analyst', 'maintainer')).toBe(false);
    });

    it('gives an unauthenticated caller the lowest role', async () => {
      const req = makeRequest('GET', '/api/runs');
      expect(await resolvePrincipalRole(req)).toBe(DEFAULT_PRINCIPAL_ROLE);
      expect(DEFAULT_PRINCIPAL_ROLE).toBe('analyst');
    });

    it('resolves the role the store assigns to the presented identity', async () => {
      const { secret, identityValue } = await issueToken();
      await assignRole({ identityType: 'api-key', identityValue, role: 'maintainer' });

      const req = makeRequest('GET', '/api/runs', { authorization: `Bearer ${secret}` });
      expect(await resolvePrincipalRole(req)).toBe('maintainer');
    });

    it('ignores role headers entirely — including in non-production', async () => {
      const req = makeRequest('DELETE', '/api/runs/run-123', {
        'x-crashlab-role': 'maintainer',
        'x-crashlab-principal-role': 'maintainer',
      });

      const principal = await resolvePrincipal(req);
      expect(principal.authenticated).toBe(false);
      expect(principal.identityType).toBe('anonymous');
      expect(await resolveRoleForPrincipal(principal)).toBe('analyst');
    });

    it('treats an unrecognised bearer token as anonymous, not as a principal', async () => {
      const req = makeRequest('DELETE', '/api/runs/run-123', {
        authorization: 'Bearer not-a-real-token',
      });

      const principal = await resolvePrincipal(req);
      expect(principal).toEqual(ANONYMOUS_PRINCIPAL);
      expect(await resolveRoleForPrincipal(principal)).toBe('analyst');
    });

    it('keeps two identities with different roles independent', async () => {
      const maintainer = await issueToken();
      const analyst = await issueToken();

      await assignRole({ identityType: 'api-key', identityValue: maintainer.identityValue, role: 'maintainer' });
      await assignRole({ identityType: 'api-key', identityValue: analyst.identityValue, role: 'analyst' });

      expect(
        await resolvePrincipalRole(makeRequest('GET', '/api/runs', { authorization: `Bearer ${maintainer.secret}` })),
      ).toBe('maintainer');
      expect(
        await resolvePrincipalRole(makeRequest('GET', '/api/runs', { authorization: `Bearer ${analyst.secret}` })),
      ).toBe('analyst');
    });

    it('falls back to the lowest role once an assignment is revoked', async () => {
      const { secret, identityValue } = await issueToken();
      await assignRole({ identityType: 'api-key', identityValue, role: 'maintainer' });
      await revokeRole({ identityType: 'api-key', identityValue });

      const req = makeRequest('GET', '/api/runs', { authorization: `Bearer ${secret}` });
      expect(await resolvePrincipalRole(req)).toBe('analyst');
    });
  });

  describe('Route Level Classification', () => {
    it('classifies GET requests as read-only (no role requirement)', () => {
      expect(getRequiredRoleForRequest('GET', '/api/runs')).toBeNull();
      expect(getRequiredRoleForRequest('GET', '/api/settings/alerting')).toBeNull();
    });

    it('classifies destructive and config mutating endpoints as maintainer required', () => {
      expect(getRequiredRoleForRequest('DELETE', '/api/runs/run-1')).toBe('maintainer');
      expect(getRequiredRoleForRequest('POST', '/api/runs/run-1/replay')).toBe('maintainer');
      expect(getRequiredRoleForRequest('POST', '/api/settings/alerting')).toBe('maintainer');
      expect(getRequiredRoleForRequest('POST', '/api/sentry/config')).toBe('maintainer');
      expect(getRequiredRoleForRequest('POST', '/api/integrations/smtp/config')).toBe('maintainer');
      expect(getRequiredRoleForRequest('POST', '/api/networks')).toBe('maintainer');
      expect(getRequiredRoleForRequest('POST', '/api/webhooks/retry')).toBe('maintainer');
    });

    it('classifies annotation and triage mutating endpoints as analyst required', () => {
      expect(getRequiredRoleForRequest('POST', '/api/runs/run-1/annotations')).toBe('analyst');
      expect(getRequiredRoleForRequest('POST', '/api/runs/run-1/tags')).toBe('analyst');
      expect(getRequiredRoleForRequest('POST', '/api/runs/run-1/issues')).toBe('analyst');
      expect(getRequiredRoleForRequest('POST', '/api/integrations/pagerduty/trigger')).toBe('analyst');
      expect(getRequiredRoleForRequest('POST', '/api/artifacts/validate')).toBe('analyst');
    });
  });

  describe('Allow / Deny Matrix per Endpoint Class', () => {
    it('allows the lowest role to create annotations (analyst endpoint)', async () => {
      const req = makeRequest('POST', '/api/runs/run-1/annotations');
      const res = await proxy(req);
      expect(res.status).toBe(200);

      const logs = await getRbacAuditLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].outcome).toBe('allowed');
      expect(logs[0].principalRole).toBe('analyst');
      expect(logs[0].principalSubject).toBe('anonymous');
    });

    it('denies the lowest role on a maintainer endpoint (e.g. delete run) with 403 envelope', async () => {
      const req = makeRequest('DELETE', '/api/runs/run-1');
      const res = await proxy(req);
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body).toEqual({
        error: {
          code: 'FORBIDDEN_INSUFFICIENT_ROLE',
          message: "Access denied. Action 'DELETE /api/runs/run-1' requires 'maintainer' role, but principal role is 'analyst'.",
          requiredRole: 'maintainer',
          currentRole: 'analyst',
          principal: 'anonymous',
        },
      });

      const logs = await getRbacAuditLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].outcome).toBe('denied');
      expect(logs[0].principalRole).toBe('analyst');
      expect(logs[0].requiredRole).toBe('maintainer');
    });

    it('allows a maintainer identity to perform maintainer endpoints', async () => {
      const { secret, identityValue } = await issueToken();
      await assignRole({ identityType: 'api-key', identityValue, role: 'maintainer' });

      const req = makeRequest('POST', '/api/sentry/config', { authorization: `Bearer ${secret}` });
      const res = await proxy(req);
      expect(res.status).toBe(200);

      const logs = await getRbacAuditLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].outcome).toBe('allowed');
      expect(logs[0].principalRole).toBe('maintainer');
      expect(logs[0].principalSubject).toBe(`api-key:${identityValue}`);
    });

    it('denies an analyst identity attempting a maintainer action', async () => {
      const { secret, identityValue } = await issueToken();
      await assignRole({ identityType: 'api-key', identityValue, role: 'analyst' });

      const res = await proxy(makeRequest('POST', '/api/sentry/config', { authorization: `Bearer ${secret}` }));
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN_INSUFFICIENT_ROLE');
      expect(body.error.currentRole).toBe('analyst');
      expect(body.error.principal).toBe(`api-key:${identityValue}`);
    });

    it('denies a maintainer header when the deployment environment is production', async () => {
      env.NODE_ENV = 'production';
      const req = makeRequest('POST', '/api/sentry/config', { 'x-crashlab-role': 'maintainer' });
      const res = await proxy(req);
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN_INSUFFICIENT_ROLE');
      expect(body.error.currentRole).toBe('analyst');
    });

    it('does not authorize read-only requests regardless of role', async () => {
      const res = await proxy(makeRequest('GET', '/api/settings/roles'));
      expect(res.status).toBe(200);
      expect(await getRbacAuditLogs()).toHaveLength(0);
    });
  });

  describe('Audit durability', () => {
    it('attributes every decision to a principal', async () => {
      const { secret, identityValue } = await issueToken();
      await assignRole({ identityType: 'api-key', identityValue, role: 'maintainer' });

      await checkRbacPermission(makeRequest('POST', '/api/sentry/config', { authorization: `Bearer ${secret}` }));
      await checkRbacPermission(makeRequest('DELETE', '/api/runs/run-1', { authorization: `Bearer ${secret}` }));

      const logs = await getRbacAuditLogs();
      expect(logs.map((entry) => entry.principalSubject)).toEqual([
        `api-key:${identityValue}`,
        `api-key:${identityValue}`,
      ]);
      expect(logs[0].id).not.toBe(logs[1].id);
    });

    it('keeps entries after the module state is discarded', async () => {
      // One driver instance stands in for the durable backend; clearing the
      // memo stands in for a fresh serverless invocation.
      const durable = new InMemoryRecordDriver();
      setRecordDriver(durable);
      await checkRbacPermission(makeRequest('DELETE', '/api/runs/run-1'));
      expect(await getRbacAuditLogs()).toHaveLength(1);

      resetRecordDriver();
      setRecordDriver(durable);
      await checkRbacPermission(makeRequest('DELETE', '/api/runs/run-2'));

      const logs = await getRbacAuditLogs();
      expect(logs).toHaveLength(2);
      expect(logs.map((entry) => entry.path)).toEqual(['/api/runs/run-2', '/api/runs/run-1']);
    });

    it('hides entries older than the retention window without deleting them', async () => {
      const driver = new InMemoryRecordDriver();
      setRecordDriver(driver);

      const old = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
      await driver.appendEntry(
        'rbac:audit',
        JSON.stringify({
          id: 'rbac_old',
          timestamp: old,
          principalSubject: 'anonymous',
          principalRole: 'analyst',
          action: 'DELETE /api/runs/run-1',
          path: '/api/runs/run-1',
          requiredRole: 'maintainer',
          outcome: 'denied',
        }),
        10_000,
      );

      expect(await getRbacAuditLogs()).toHaveLength(0);
      // Still on the record: retention is a read-time policy, not a silent delete.
      expect(await driver.countEntries('rbac:audit')).toBe(1);
    });
  });

  describe('describePrincipal', () => {
    it('reports the identity-bound capabilities the server enforces', async () => {
      const { secret, identityValue } = await issueToken();
      await assignRole({ identityType: 'api-key', identityValue, role: 'analyst' });

      const described = await describePrincipal(
        makeRequest('GET', '/api/settings/roles/me', { authorization: `Bearer ${secret}` }),
      );
      expect(described.principal.authenticated).toBe(true);
      expect(described.role).toBe('analyst');
      expect(described.satisfies('analyst')).toBe(true);
      expect(described.satisfies('maintainer')).toBe(false);
    });

    it('describes an anonymous caller without inventing an identity', async () => {
      const described = await describePrincipal(makeRequest('GET', '/api/settings/roles/me'));
      const principal: RbacPrincipal = described.principal;
      expect(principal.identityType).toBe('anonymous');
      expect(principal.authenticated).toBe(false);
    });
  });
});
