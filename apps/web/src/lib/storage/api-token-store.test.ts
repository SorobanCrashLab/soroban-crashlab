import { describe, it, expect, beforeEach } from 'vitest';
import {
  createApiToken,
  resolveApiToken,
  revokeApiToken,
  rotateApiToken,
  listApiTokens,
  hashApiToken,
  timingSafeHashEqual,
  resetApiTokenStore,
  DEFAULT_TOKEN_TTL_MS,
  TOKEN_ROTATION_GRACE_MS,
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

  it('applies the default 90-day expiry when no explicit expiry is supplied', () => {
    const startMs = Date.now();
    const { secret, token } = createApiToken({
      name: 'Default Expiry Token',
      scope: 'read',
      nowMs: startMs,
    });

    expect(token.expiresAt).not.toBeNull();
    const expiresMs = new Date(token.expiresAt!).getTime();
    expect(expiresMs - startMs).toBe(DEFAULT_TOKEN_TTL_MS);

    // Still valid before the default expiry boundary.
    expect(
      resolveApiToken(secret, startMs + DEFAULT_TOKEN_TTL_MS - 1).status,
    ).toBe('valid');
    // Expired exactly at the default boundary.
    expect(resolveApiToken(secret, startMs + DEFAULT_TOKEN_TTL_MS).status).toBe('expired');
  });

  it('honors an explicit expiry over the default', () => {
    const startMs = Date.now();
    const explicit = new Date(startMs + 60_000).toISOString();
    const { token } = createApiToken({
      name: 'Explicit Expiry Token',
      scope: 'read',
      expiresAt: explicit,
      nowMs: startMs,
    });
    expect(token.expiresAt).toBe(explicit);
  });

  it('rotates a token, minting a successor with a new secret', () => {
    const startMs = Date.now();
    const { secret: oldSecret, token: oldToken } = createApiToken({
      name: 'Rotation Token',
      scope: 'write',
      nowMs: startMs,
    });

    const rotated = rotateApiToken(oldToken.id, startMs + 100);
    expect(rotated).toBeDefined();
    expect(rotated!.secret).not.toBe(oldSecret);
    expect(rotated!.token.name).toBe('Rotation Token');
    expect(rotated!.token.scope).toBe('write');
    expect(rotated!.token.id).not.toBe(oldToken.id);
    expect(rotated!.previousTokenId).toBe(oldToken.id);

    // Two tokens now exist: the original (rotated) and the successor.
    const tokens = listApiTokens();
    expect(tokens.length).toBe(2);
    expect(tokens.find((t) => t.id === oldToken.id)?.rotatedAt).toBeDefined();
  });

  it('keeps the rotated token valid within the grace window, then revokes it', () => {
    const startMs = Date.now();
    const { secret: oldSecret, token: oldToken } = createApiToken({
      name: 'Grace Window Token',
      scope: 'read',
      nowMs: startMs,
    });

    const rotated = rotateApiToken(oldToken.id, startMs + 100);
    expect(rotated).toBeDefined();

    // Within the grace window the old token still resolves.
    expect(
      resolveApiToken(oldSecret, startMs + 100 + TOKEN_ROTATION_GRACE_MS - 1).status,
    ).toBe('valid');

    // Past the grace window the old token is revoked.
    expect(
      resolveApiToken(oldSecret, startMs + 100 + TOKEN_ROTATION_GRACE_MS + 1).status,
    ).toBe('revoked');

    // The successor token keeps working independently.
    expect(resolveApiToken(rotated!.secret, startMs + 200).status).toBe('valid');
  });

  it('rotateApiToken returns undefined for an unknown id', () => {
    expect(rotateApiToken('tok_nonexistent')).toBeUndefined();
  });

  it('timingSafeHashEqual compares hashes in constant time', () => {
    const secret = 'scl_live_secret_abc';
    const hashA = hashApiToken(secret);
    const hashB = hashApiToken(secret);
    expect(timingSafeHashEqual(hashA, hashB)).toBe(true);
    expect(timingSafeHashEqual(hashA, hashApiToken('scl_live_other'))).toBe(false);
    expect(timingSafeHashEqual(hashA, '')).toBe(false);
    expect(timingSafeHashEqual('', hashA)).toBe(false);
  });

  it('resolveApiToken matches via constant-time hash comparison', () => {
    const now = Date.now();
    const { secret } = createApiToken({
      name: 'Constant Time Token',
      scope: 'read',
      nowMs: now,
    });

    // Exact secret resolves valid.
    expect(resolveApiToken(secret, now + 1).status).toBe('valid');
    // A single-byte-off secret must NOT accidentally match a stored hash.
    const nearMiss = secret.slice(0, -1) + (secret.endsWith('a') ? 'b' : 'a');
    expect(resolveApiToken(nearMiss, now + 1).status).toBe('invalid');
  });
});
