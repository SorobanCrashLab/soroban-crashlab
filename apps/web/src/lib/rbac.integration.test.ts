/**
 * RBAC escalation integration tests (#1548).
 *
 * The unit tests cover the policy and the identity lookup. This file covers the
 * claim the issue actually makes: that a caller cannot raise its own role by
 * anything it puts in the request.
 *
 * Every escalation surface is driven through the real enforcement path — the
 * proxy entry point that middleware uses — with a request built the way a
 * hostile client would build it. Header, query parameter, cookie, JSON body and
 * the old dev override header are each tried, and each must leave the caller
 * at the lowest role.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../rate-limit';
import { getRbacAuditLogs, resolvePrincipalRole, ENV_API_KEY_IDENTITY } from './rbac';
import { InMemoryRecordDriver, setRecordDriver, resetRecordDriver } from './storage/record-driver';
import { assignRole, revokeRole, resetRoleStore } from './storage/role-store';
import {
  hashTokenSecret,
  registerTokenPrincipal,
  resetTokenPrincipalStore,
} from './storage/token-principal-store';

const MAINTAINER_ONLY_ROUTES = [
  { method: 'DELETE', path: '/api/runs/run-1' },
  { method: 'POST', path: '/api/runs/run-1/replay' },
  { method: 'POST', path: '/api/settings/alerting' },
  { method: 'POST', path: '/api/sentry/config' },
  { method: 'POST', path: '/api/networks' },
  { method: 'POST', path: '/api/webhooks/retry' },
];

describe('RBAC escalation resistance (integration)', () => {
  const originalEnv = process.env.NODE_ENV;
  const env = process.env as Record<string, string | undefined>;

  beforeEach(async () => {
    setRecordDriver(new InMemoryRecordDriver());
    await resetRoleStore();
    await resetTokenPrincipalStore();
    env.NODE_ENV = 'test';
  });

  afterEach(() => {
    env.NODE_ENV = originalEnv;
    resetRecordDriver();
  });

  function makeRequest(
    method: string,
    path: string,
    init: { headers?: Record<string, string>; body?: string } = {},
  ): NextRequest {
    return new NextRequest(`http://localhost${path}`, {
      method,
      headers: {
        'x-forwarded-for': '127.0.0.1',
        ...(init.headers ?? {}),
      },
      ...(init.body ? { body: init.body } : {}),
    });
  }

  let tokenCounter = 0;

  async function issueToken(): Promise<{ secret: string; identityValue: string }> {
    tokenCounter += 1;
    const secret = `scl_test_token_${tokenCounter}`;
    const identityValue = `tok_test_${tokenCounter}`;
    await registerTokenPrincipal({ tokenId: identityValue, sha256Hash: await hashTokenSecret(secret) });
    return { secret, identityValue };
  }

  describe('no unauthenticated caller can self-elevate', () => {
    it.each(MAINTAINER_ONLY_ROUTES)(
      'denies $method $path when the role is asserted in a header',
      async ({ method, path }) => {
        const res = await proxy(
          makeRequest(method, path, { headers: { 'x-crashlab-role': 'maintainer' } }),
        );
        expect(res.status).toBe(403);
      },
    );

    it.each(MAINTAINER_ONLY_ROUTES)(
      'denies $method $path when the role is asserted in the legacy override header',
      async ({ method, path }) => {
        const res = await proxy(
          makeRequest(method, path, { headers: { 'x-crashlab-principal-role': 'maintainer' } }),
        );
        expect(res.status).toBe(403);
      },
    );

    it.each(MAINTAINER_ONLY_ROUTES)(
      'denies $method $path when the role is asserted in the query string',
      async ({ method, path }) => {
        const res = await proxy(makeRequest(method, `${path}?role=maintainer`));
        expect(res.status).toBe(403);
      },
    );

    it.each(MAINTAINER_ONLY_ROUTES)(
      'denies $method $path when the role is asserted in the request body',
      async ({ method, path }) => {
        const res = await proxy(
          makeRequest(method, path, {
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ role: 'maintainer', identityType: 'api-key', identityValue: 'self' }),
          }),
        );
        expect(res.status).toBe(403);
      },
    );

    it('denies maintainer routes when the role is asserted in a cookie', async () => {
      const res = await proxy(
        makeRequest('POST', '/api/sentry/config', {
          headers: { cookie: 'crashlab_role=maintainer; role=maintainer; crashlab_github_session=maintainer' },
        }),
      );
      expect(res.status).toBe(403);
    });

    it('ignores role assertions even when they ride along with a bogus credential', async () => {
      const res = await proxy(
        makeRequest('DELETE', '/api/runs/run-1', {
          headers: {
            authorization: 'Bearer totally-made-up',
            'x-crashlab-role': 'maintainer',
          },
        }),
      );
      expect(res.status).toBe(403);
    });

    it('resolves an unauthenticated caller to the lowest role regardless of assertions', async () => {
      const req = makeRequest('POST', '/api/sentry/config?role=maintainer', {
        headers: {
          'x-crashlab-role': 'maintainer',
          'x-crashlab-principal-role': 'maintainer',
          'x-role': 'maintainer',
        },
      });
      expect(await resolvePrincipalRole(req)).toBe('analyst');
    });
  });

  describe('an analyst credential cannot reach maintainer surfaces', () => {
    it('is denied even while presenting every assertion it can think of', async () => {
      const { secret, identityValue } = await issueToken();
      await assignRole({ identityType: 'api-key', identityValue, role: 'analyst' });

      const res = await proxy(
        makeRequest('POST', '/api/settings/alerting?role=maintainer', {
          headers: {
            authorization: `Bearer ${secret}`,
            'x-crashlab-role': 'maintainer',
            'x-crashlab-principal-role': 'maintainer',
          },
          body: JSON.stringify({ role: 'maintainer' }),
        }),
      );

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.currentRole).toBe('analyst');
      expect(body.error.requiredRole).toBe('maintainer');
    });

    it('is still allowed on analyst surfaces', async () => {
      const { secret, identityValue } = await issueToken();
      await assignRole({ identityType: 'api-key', identityValue, role: 'analyst' });

      const res = await proxy(
        makeRequest('POST', '/api/runs/run-1/annotations', { headers: { authorization: `Bearer ${secret}` } }),
      );
      expect(res.status).toBe(200);
    });
  });

  describe('a maintainer credential is allowed only because the store says so', () => {
    it('is allowed on maintainer surfaces and attributed in the audit log', async () => {
      const { secret, identityValue } = await issueToken();
      await assignRole({ identityType: 'api-key', identityValue, role: 'maintainer' });

      const res = await proxy(
        makeRequest('POST', '/api/sentry/config', { headers: { authorization: `Bearer ${secret}` } }),
      );
      expect(res.status).toBe(200);

      const logs = await getRbacAuditLogs();
      expect(logs[0].principalSubject).toBe(`api-key:${identityValue}`);
      expect(logs[0].outcome).toBe('allowed');
    });

    it('loses access the moment the assignment is revoked', async () => {
      const { secret, identityValue } = await issueToken();
      await assignRole({ identityType: 'api-key', identityValue, role: 'maintainer' });

      const allowed = await proxy(
        makeRequest('POST', '/api/sentry/config', { headers: { authorization: `Bearer ${secret}` } }),
      );
      expect(allowed.status).toBe(200);

      await revokeRole({ identityType: 'api-key', identityValue });

      const denied = await proxy(
        makeRequest('POST', '/api/sentry/config', { headers: { authorization: `Bearer ${secret}` } }),
      );
      expect(denied.status).toBe(403);
    });

    it('does not let one identity borrow another identity role', async () => {
      const maintainer = await issueToken();
      const bystander = await issueToken();
      await assignRole({ identityType: 'api-key', identityValue: maintainer.identityValue, role: 'maintainer' });

      // The bystander presents a valid credential of their own and claims the
      // maintainer's token id in the request.
      const res = await proxy(
        makeRequest('POST', '/api/sentry/config', {
          headers: {
            authorization: `Bearer ${bystander.secret}`,
            'x-crashlab-identity': maintainer.identityValue,
          },
          body: JSON.stringify({ identityValue: maintainer.identityValue, role: 'maintainer' }),
        }),
      );
      expect(res.status).toBe(403);
    });
  });

  describe('the deployment API key is a first-class principal', () => {
    const originalKey = process.env.CRASHLAB_WEBHOOK_API_KEY;

    afterEach(() => {
      if (originalKey === undefined) {
        delete process.env.CRASHLAB_WEBHOOK_API_KEY;
      } else {
        process.env.CRASHLAB_WEBHOOK_API_KEY = originalKey;
      }
    });

    it('resolves to its own identity and honours the role assigned to it', async () => {
      process.env.CRASHLAB_WEBHOOK_API_KEY = 'deployment-key-for-this-test';
      await assignRole({ identityType: 'api-key', identityValue: ENV_API_KEY_IDENTITY, role: 'maintainer' });

      const res = await proxy(
        makeRequest('POST', '/api/sentry/config', {
          headers: { authorization: 'Bearer deployment-key-for-this-test' },
        }),
      );
      expect(res.status).toBe(200);
    });

    it('does not match a near-miss credential', async () => {
      process.env.CRASHLAB_WEBHOOK_API_KEY = 'deployment-key-for-this-test';
      const res = await proxy(
        makeRequest('POST', '/api/sentry/config', {
          headers: { authorization: 'Bearer deployment-key-for-this-tes' },
        }),
      );
      expect(res.status).toBe(403);
    });
  });
});
