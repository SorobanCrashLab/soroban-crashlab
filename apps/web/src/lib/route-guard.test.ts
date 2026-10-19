/**
 * route-guard — deny-by-default behavior (#1817).
 *
 * The completeness test in `route-catalog.test.ts` proves every route file is
 * registered. This suite proves the other half: a request the catalog does not
 * know is refused rather than waved through, and a public route needs no
 * credential.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { enforceRouteAuthorization, UNDECLARED_ROUTE_CODE } from './route-guard';
import { InMemoryRecordDriver, setRecordDriver, resetRecordDriver } from './storage/record-driver';
import { resetRoleStore } from './storage/role-store';
import { resetTokenPrincipalStore } from './storage/token-principal-store';

function makeRequest(method: string, path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'x-forwarded-for': '127.0.0.1' },
  });
}

describe('route guard', () => {
  beforeEach(async () => {
    setRecordDriver(new InMemoryRecordDriver());
    await resetRoleStore();
    await resetTokenPrincipalStore();
  });

  afterEach(() => {
    resetRecordDriver();
  });

  it('denies an undeclared route with 403 UNDECLARED_ROUTE', async () => {
    const denial = await enforceRouteAuthorization(makeRequest('GET', '/api/not-registered'));
    expect(denial?.status).toBe(403);
    const body = await denial!.json();
    expect(body.error.code).toBe(UNDECLARED_ROUTE_CODE);
  });

  it('denies an undeclared verb on a declared path', async () => {
    const denial = await enforceRouteAuthorization(makeRequest('PUT', '/api/health'));
    expect(denial?.status).toBe(403);
  });

  it('allows a public route without a credential', async () => {
    const denial = await enforceRouteAuthorization(makeRequest('GET', '/api/health/liveness'));
    expect(denial).toBeNull();
  });

  it('denies a mutating maintainer route for the anonymous analyst principal', async () => {
    const denial = await enforceRouteAuthorization(makeRequest('POST', '/api/sentry/config'));
    expect(denial?.status).toBe(403);
    const body = await denial!.json();
    expect(body.error.code).toBe('FORBIDDEN_INSUFFICIENT_ROLE');
    expect(body.error.requiredRole).toBe('maintainer');
  });
});
