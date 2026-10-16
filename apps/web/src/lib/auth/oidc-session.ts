/**
 * Signed session cookie for OIDC logins (#1893).
 *
 * Same shape and posture as the GitHub session (`github-session.ts`): the
 * cookie names an identity, never a role — RBAC looks the role up in the role
 * store, where the OIDC callback wrote it from the mapped claims. The cookie
 * also carries its own expiry so a stolen value does not live forever.
 *
 * Web Crypto only: `rbac.ts` reaches this from the Edge proxy graph.
 */

import { constantTimeHexEqual } from '../github-session';

export const OIDC_SESSION_COOKIE = 'crashlab_oidc_session';
export const OIDC_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export function getOidcSessionSecret(): string | undefined {
  const secret = process.env.CRASHLAB_OIDC_SESSION_SECRET?.trim();
  return secret ? secret : undefined;
}

async function hmacHex(secret: string, message: string): Promise<string> {
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

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

/** `identity` is `<issuer>#<sub>`. Returns null when no secret is configured. */
export async function issueOidcSession(identity: string, nowMs = Date.now()): Promise<string | null> {
  const secret = getOidcSessionSecret();
  if (!secret) return null;
  const payload = toBase64Url(JSON.stringify({ id: identity, exp: Math.floor(nowMs / 1000) + OIDC_SESSION_MAX_AGE_SECONDS }));
  return `${payload}.${await hmacHex(secret, payload)}`;
}

export async function verifyOidcSession(raw: string | null | undefined, nowMs = Date.now()): Promise<string | null> {
  const secret = getOidcSessionSecret();
  if (!secret || !raw) return null;
  const separator = raw.lastIndexOf('.');
  if (separator <= 0) return null;

  const payload = raw.slice(0, separator);
  if (!constantTimeHexEqual(await hmacHex(secret, payload), raw.slice(separator + 1))) return null;

  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as { id?: unknown; exp?: unknown };
    if (typeof parsed.id !== 'string' || typeof parsed.exp !== 'number') return null;
    return parsed.exp > Math.floor(nowMs / 1000) ? parsed.id : null;
  } catch {
    return null;
  }
}
