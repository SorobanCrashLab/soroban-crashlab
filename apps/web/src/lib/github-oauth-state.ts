/**
 * Cryptographically bound GitHub OAuth state (#1559).
 *
 * The `state` parameter binds a login request to its callback so a
 * cross-site request cannot hijack an in-flight authorization. Instead of a
 * raw unguessable nonce, the state is an HMAC-SHA256 signed token
 * (`<nonce>.<hex-signature>`). The callback recomputes the signature over the
 * nonce with a server secret, so a tampered or forged state is rejected
 * without ever revealing the secret to the client.
 *
 * The cookie carrying the state is HttpOnly, Secure (production),
 * SameSite=Lax and short-lived (10 minutes), and is cleared on every callback
 * outcome so a state can only be used once (replay / raced-callback
 * protection).
 */

import { logger } from '@/lib/logger';

export const STATE_COOKIE_NAME = 'github_oauth_state';
export const NEXT_COOKIE_NAME = 'github_oauth_next';
export const STATE_MAX_AGE_SECONDS = 60 * 10; // 10 minutes

/**
 * Signing secret: a dedicated state secret, falling back to the GitHub session
 * secret. Absent means state cannot be cryptographically bound; in that case
 * the login route falls back to a plain random nonce (logged as a warning) so
 * the flow still works in undeployed environments, but production should set
 * one of these secrets.
 */
export function getOAuthStateSecret(): string | undefined {
  const secret =
    process.env.CRASHLAB_GITHUB_STATE_SECRET ?? process.env.CRASHLAB_GITHUB_SESSION_SECRET;
  return secret && secret.trim().length > 0 ? secret.trim() : undefined;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Compares two hex digests without short-circuiting, so a mismatching
 * signature does not leak its prefix length by timing.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Mints an HMAC-signed state token: `<nonce>.<hex-hmac>`.
 * Returns a plain random nonce (unbound) when no signing secret is configured.
 */
export async function issueState(): Promise<string> {
  const secret = getOAuthStateSecret();
  if (!secret) {
    logger.warn('issueState: no CRASHLAB_GITHUB_STATE_SECRET / CRASHLAB_GITHUB_SESSION_SECRET configured; issuing unbound state nonce');
    return crypto.randomUUID();
  }

  const nonce = crypto.randomUUID();
  const signature = await hmacSha256Hex(secret, nonce);
  return `${nonce}.${signature}`;
}

/**
 * Verifies an HMAC-signed state token and returns the nonce it binds.
 * In the no-secret fallback mode the token is returned as-is (it is trusted
 * only because it arrived in an HttpOnly cookie we set). Returns `null` for
 * absent, malformed, unsigned or tampered tokens.
 */
export async function verifyState(token: string | null | undefined): Promise<string | null> {
  const secret = getOAuthStateSecret();
  if (!token) return null;

  if (!secret) {
    // Fallback mode: no cryptographic binding available; trust the cookie-issued value.
    return token;
  }

  const separator = token.lastIndexOf('.');
  if (separator <= 0 || separator === token.length - 1) return null;

  const nonce = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const expected = await hmacSha256Hex(secret, nonce);
  if (!constantTimeEqual(expected, signature)) return null;

  return nonce.length > 0 ? nonce : null;
}

export { base64UrlEncode, base64UrlDecode };
