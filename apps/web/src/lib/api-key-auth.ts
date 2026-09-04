import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

/**
 * Reads the configured API key from the environment.
 * Returns undefined when the env var is not set or is empty.
 */
export function getConfiguredApiKey(): string | undefined {
  const key = process.env.CRASHLAB_WEBHOOK_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : undefined;
}

/**
 * Extracts a Bearer token from an `Authorization: Bearer <token>` header.
 * Returns undefined when the header is absent or malformed.
 */
export function extractBearerToken(request: NextRequest): string | undefined {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return undefined;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return undefined;

  const token = parts[1];
  return token.length > 0 ? token : undefined;
}

/**
 * Compares two strings in constant time to prevent timing-based side-channel
 * attacks. Returns true only if both strings are identical.
 */
export function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf-8');
  const bufB = Buffer.from(b, 'utf-8');

  // Buffers must have equal length for timingSafeEqual.
  // Pad both to the same length to avoid short-circuit comparison.
  const maxLen = Math.max(bufA.length, bufB.length);
  const paddedA = Buffer.alloc(maxLen, 0);
  const paddedB = Buffer.alloc(maxLen, 0);
  bufA.copy(paddedA);
  bufB.copy(paddedB);

  // Always run the comparison but only declare success when lengths also match.
  const equal = timingSafeEqual(paddedA, paddedB);
  return equal && bufA.length === bufB.length;
}

/**
 * Validates the `Authorization: Bearer <key>` header on the request against
 * the configured `CRASHLAB_WEBHOOK_API_KEY` environment variable.
 *
 * - When no API key is configured in the environment the request is allowed
 *   through so existing deployments without the env var are unaffected.
 * - When an API key IS configured the caller must supply a matching Bearer
 *   token; mismatches or absent headers are rejected with 401.
 *
 * Returns undefined when authentication passes (or is unconfigured), or a
 * NextResponse with status 401 when it fails.
 */
export function validateWebhookApiKey(request: NextRequest): NextResponse | undefined {
  const configuredKey = getConfiguredApiKey();

  // No key configured — authentication is not enforced.
  if (configuredKey === undefined) {
    return undefined;
  }

  const token = extractBearerToken(request);
  if (token === undefined) {
    return NextResponse.json(
      { error: 'Authentication required. Provide a valid Authorization: Bearer <token> header.' },
      { status: 401 },
    );
  }

  if (!timingSafeStringEqual(token, configuredKey)) {
    return NextResponse.json(
      { error: 'Invalid API key.' },
      { status: 401 },
    );
  }

  // Authentication passed.
  return undefined;
}

import { resolveApiToken, ApiTokenScope } from './storage/api-token-store';

/**
 * Validates a presented Bearer token against stored scoped API tokens.
 * Rejects revoked or expired tokens with distinct status codes and error payloads.
 */
export function validateScopedApiToken(
  request: NextRequest,
  requiredScope?: ApiTokenScope,
): NextResponse | undefined {
  const token = extractBearerToken(request);

  if (token === undefined) {
    // If webhook API key is configured, check if webhook key validation applies
    const configuredKey = getConfiguredApiKey();
    if (configuredKey !== undefined) {
      return NextResponse.json(
        { error: 'Authentication required. Provide a valid Authorization: Bearer <token> header.' },
        { status: 401 },
      );
    }
    return NextResponse.json(
      { error: 'Authentication required.' },
      { status: 401 },
    );
  }

  const configuredKey = getConfiguredApiKey();
  if (configuredKey && timingSafeStringEqual(token, configuredKey)) {
    return undefined;
  }

  const result = resolveApiToken(token);

  if (result.status === 'invalid') {
    return NextResponse.json(
      { error: 'Invalid API key.', code: 'INVALID_TOKEN' },
      { status: 401 },
    );
  }

  if (result.status === 'revoked') {
    return NextResponse.json(
      { error: 'API key has been revoked.', code: 'TOKEN_REVOKED' },
      { status: 401 },
    );
  }

  if (result.status === 'expired') {
    return NextResponse.json(
      { error: 'API key has expired.', code: 'TOKEN_EXPIRED' },
      { status: 401 },
    );
  }

  if (requiredScope === 'write' && result.token.scope === 'read') {
    return NextResponse.json(
      { error: 'Insufficient token scope for write operation.', code: 'INSUFFICIENT_SCOPE' },
      { status: 403 },
    );
  }

  return undefined;
}

