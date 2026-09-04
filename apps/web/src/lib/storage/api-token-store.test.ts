import { describe, it, expect, beforeEach } from 'vitest';
import {
  createApiToken,
  resolveApiToken,
  revokeApiToken,
  listApiTokens,
  hashApiToken,
  resetApiTokenStore,
} from './api-token-store';
import { validateScopedApiToken } from '../api-key-auth';
import { NextRequest } from 'next/server';

describe('api-token-store & authentication', () => {
  beforeEach(() => {
    resetApiTokenStore();
  });

  it('verifies hashing round-trip consistency', () => {
    const secret = 'scl_live_test_secret_key_12345';
    const hash1 = hashApiToken(secret);
    const hash2 = hashApiToken(secret);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(secret);
    expect(hash1.length).toBe(64); // SHA-256 hex string

    const differentSecret = 'scl_live_test_secret_key_67890';
    expect(hashApiToken(differentSecret)).not.toBe(hash1);
  });

  it('creates token and returns plaintext secret once while storing hashed record', () => {
    const { secret, token } = createApiToken({
      name: 'CI Worker',
      scope: 'read',
    });

    expect(secret).toMatch(/^scl_live_/);
    expect(token.name).toBe('CI Worker');
    expect(token.scope).toBe('read');
    expect(token.prefixMasked).not.toBe(secret);

    const tokensList = listApiTokens();
    expect(tokensList.length).toBe(1);
    expect(tokensList[0].id).toBe(token.id);
    expect(tokensList[0].prefixMasked).not.toBe(secret);
  });

  it('handles expiry boundary: expired -1ms rejected', () => {
    const now = Date.now();
    const expiryDate = new Date(now + 1000).toISOString();

    const { secret } = createApiToken({
      name: 'Expiring Token',
      scope: 'write',
      expiresAt: expiryDate,
    });

    // Valid 500ms before expiry
    const beforeExpiry = resolveApiToken(secret, now + 500);
    expect(beforeExpiry.status).toBe('valid');

    // Expired right at expiry time (+1000ms)
    const atExpiry = resolveApiToken(secret, now + 1000);
    expect(atExpiry.status).toBe('expired');

    // Expired 1ms after expiry (+1001ms)
    const afterExpiry = resolveApiToken(secret, now + 1001);
    expect(afterExpiry.status).toBe('expired');
  });

  it('enforces revocation immediacy', () => {
    const { secret, token } = createApiToken({
      name: 'Revokable Token',
      scope: 'write',
    });

    // Valid initially
    expect(resolveApiToken(secret).status).toBe('valid');

    // Revoke instantly
    const revoked = revokeApiToken(token.id);
    expect(revoked).toBe(true);

    // Immediate lookup fails with status revoked
    const resolved = resolveApiToken(secret);
    expect(resolved.status).toBe('revoked');
  });

  it('throttles lastUsedAt updates within 60s window', () => {
    const startMs = 1000000;
    const { secret } = createApiToken({
      name: 'Throttled Token',
      scope: 'read',
    });

    // First use at startMs
    const res1 = resolveApiToken(secret, startMs);
    expect(res1.status).toBe('valid');
    const firstUsedAt = res1.status === 'valid' ? res1.token.lastUsedAt : null;
    expect(firstUsedAt).toBe(new Date(startMs).toISOString());

    // Second use 30s later (within 60s throttle window)
    const res2 = resolveApiToken(secret, startMs + 30000);
    expect(res2.status).toBe('valid');
    const secondUsedAt = res2.status === 'valid' ? res2.token.lastUsedAt : null;
    // lastUsedAt should NOT be updated
    expect(secondUsedAt).toBe(firstUsedAt);

    // Third use 65s after startMs (>60s window)
    const res3 = resolveApiToken(secret, startMs + 65000);
    expect(res3.status).toBe('valid');
    const thirdUsedAt = res3.status === 'valid' ? res3.token.lastUsedAt : null;
    // lastUsedAt should BE updated
    expect(thirdUsedAt).toBe(new Date(startMs + 65000).toISOString());
  });

  it('validates HTTP requests with validateScopedApiToken middleware helper', () => {
    const { secret, token } = createApiToken({
      name: 'HTTP Test Token',
      scope: 'read',
    });

    // Valid read request
    const req1 = new NextRequest('http://localhost/api/test', {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(validateScopedApiToken(req1, 'read')).toBeUndefined();

    // Insufficient scope for write requirement
    const reqWrite = new NextRequest('http://localhost/api/test', {
      headers: { authorization: `Bearer ${secret}` },
    });
    const writeRes = validateScopedApiToken(reqWrite, 'write');
    expect(writeRes?.status).toBe(403);

    // Revoked token request
    revokeApiToken(token.id);
    const reqRevoked = new NextRequest('http://localhost/api/test', {
      headers: { authorization: `Bearer ${secret}` },
    });
    const revokedRes = validateScopedApiToken(reqRevoked);
    expect(revokedRes?.status).toBe(401);
  });
});
