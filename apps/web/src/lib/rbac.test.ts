import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  resolvePrincipalRole,
  hasRequiredRole,
  getRequiredRoleForRequest,
  getRbacAuditLogs,
  clearRbacAuditLogs,
} from './rbac';
import { proxy } from '../rate-limit';

describe('RBAC Middleware & Authorization', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    clearRbacAuditLogs();
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
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

  describe('Role Hierarchy & Resolution', () => {
    it('verifies role hierarchy rules', () => {
      expect(hasRequiredRole('maintainer', 'maintainer')).toBe(true);
      expect(hasRequiredRole('maintainer', 'analyst')).toBe(true);
      expect(hasRequiredRole('analyst', 'analyst')).toBe(true);
      expect(hasRequiredRole('analyst', 'maintainer')).toBe(false);
    });

    it('resolves principal role from dev override header in non-production', () => {
      const reqMaintainer = makeRequest('GET', '/api/runs', { 'x-crashlab-role': 'maintainer' });
      expect(resolvePrincipalRole(reqMaintainer)).toBe('maintainer');

      const reqAnalyst = makeRequest('GET', '/api/runs', { 'x-crashlab-principal-role': 'analyst' });
      expect(resolvePrincipalRole(reqAnalyst)).toBe('analyst');
    });

    it('strictly IGNORES dev override headers in production environment', () => {
      process.env.NODE_ENV = 'production';
      const req = makeRequest('DELETE', '/api/runs/run-123', { 'x-crashlab-role': 'maintainer' });
      
      // In production, header override is ignored and defaults to analyst
      expect(resolvePrincipalRole(req)).toBe('analyst');
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
    it('allows analyst role to create annotations (analyst endpoint)', () => {
      const req = makeRequest('POST', '/api/runs/run-1/annotations', {
        'x-crashlab-role': 'analyst',
      });
      const res = proxy(req);
      expect(res.status).toBe(200);

      const logs = getRbacAuditLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].outcome).toBe('allowed');
      expect(logs[0].principalRole).toBe('analyst');
    });

    it('denies analyst role on maintainer endpoint (e.g. delete run) with 403 envelope', async () => {
      const req = makeRequest('DELETE', '/api/runs/run-1', {
        'x-crashlab-role': 'analyst',
      });
      const res = proxy(req);
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body).toEqual({
        error: {
          code: 'FORBIDDEN_INSUFFICIENT_ROLE',
          message: "Access denied. Action 'DELETE /api/runs/run-1' requires 'maintainer' role, but principal role is 'analyst'.",
          requiredRole: 'maintainer',
          currentRole: 'analyst',
        },
      });

      const logs = getRbacAuditLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].outcome).toBe('denied');
      expect(logs[0].principalRole).toBe('analyst');
      expect(logs[0].requiredRole).toBe('maintainer');
    });

    it('allows maintainer role to perform maintainer endpoints (e.g. config updates)', () => {
      const req = makeRequest('POST', '/api/sentry/config', {
        'x-crashlab-role': 'maintainer',
      });
      const res = proxy(req);
      expect(res.status).toBe(200);

      const logs = getRbacAuditLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].outcome).toBe('allowed');
      expect(logs[0].principalRole).toBe('maintainer');
    });

    it('denies unauthenticated / default role when attempting maintainer action in prod', async () => {
      process.env.NODE_ENV = 'production';
      // Attempting to spoof maintainer role in production with header
      const req = makeRequest('POST', '/api/sentry/config', {
        'x-crashlab-role': 'maintainer',
      });
      const res = proxy(req);
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.error.code).toBe('FORBIDDEN_INSUFFICIENT_ROLE');
      expect(body.error.currentRole).toBe('analyst');
    });
  });
});
