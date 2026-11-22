/**
 * ID token validation (#1893).
 *
 * Order matters: the header is checked against an asymmetric-only allowlist
 * before any key is fetched, the signature is verified with the key the
 * header's `kid` names (and only if that key's type fits the algorithm), and
 * the claims are read only after the signature holds.
 */

import { constants, verify } from 'node:crypto';
import { OidcError } from './oidc-discovery';
import type { JwksCache, ResolvedKey } from './oidc-jwks';

/** Asymmetric only. `none` and every HS* are absent by construction. */
export const ALLOWED_ID_TOKEN_ALGS = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'EdDSA'] as const;
export type IdTokenAlg = (typeof ALLOWED_ID_TOKEN_ALGS)[number];

export const DEFAULT_CLOCK_SKEW_SECONDS = 60;

export interface IdTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nbf?: number;
  nonce?: string;
  azp?: string;
  email?: string;
  email_verified?: boolean;
  [claim: string]: unknown;
}

export interface IdTokenExpectations {
  issuer: string;
  clientId: string;
  nonce: string;
  /** Seconds. */
  clockSkewSeconds?: number;
  /** Epoch seconds. */
  now?: number;
}

const KEY_TYPE_FOR_ALG: Record<IdTokenAlg, { kty: string; crv?: string }> = {
  RS256: { kty: 'RSA' },
  RS384: { kty: 'RSA' },
  RS512: { kty: 'RSA' },
  PS256: { kty: 'RSA' },
  PS384: { kty: 'RSA' },
  PS512: { kty: 'RSA' },
  ES256: { kty: 'EC', crv: 'P-256' },
  ES384: { kty: 'EC', crv: 'P-384' },
  EdDSA: { kty: 'OKP', crv: 'Ed25519' },
};

function decodeSegment<T>(segment: string, what: string): T {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as T;
  } catch {
    throw new OidcError('malformed_token', `id_token ${what} is not valid JSON`);
  }
}

function verifySignature(alg: IdTokenAlg, { key }: ResolvedKey, signingInput: string, signature: Buffer): boolean {
  const data = Buffer.from(signingInput, 'utf8');
  if (alg === 'EdDSA') return verify(null, data, key, signature);

  const digest = `sha${alg.slice(2)}`;
  if (alg.startsWith('PS')) {
    return verify(digest, data, { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: Number(alg.slice(2)) / 8 }, signature);
  }
  if (alg.startsWith('ES')) return verify(digest, data, { key, dsaEncoding: 'ieee-p1363' }, signature);
  return verify(digest, data, key, signature);
}

export async function validateIdToken(
  idToken: string,
  jwks: JwksCache,
  expected: IdTokenExpectations,
): Promise<IdTokenClaims> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new OidcError('malformed_token', 'id_token must have three segments');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  const header = decodeSegment<{ alg?: string; kid?: string; crit?: unknown }>(encodedHeader, 'header');
  if (!ALLOWED_ID_TOKEN_ALGS.includes(header.alg as IdTokenAlg)) {
    throw new OidcError('alg_not_allowed', `id_token alg ${String(header.alg)} is not allowed`);
  }
  if (header.crit !== undefined) throw new OidcError('alg_not_allowed', 'id_token crit header is not supported');
  if (typeof header.kid !== 'string' || header.kid.length === 0) {
    throw new OidcError('unknown_kid', 'id_token header has no kid');
  }
  const alg = header.alg as IdTokenAlg;

  const resolved = await jwks.getKey(header.kid);
  const required = KEY_TYPE_FOR_ALG[alg];
  if (
    resolved.jwk.kty !== required.kty ||
    (required.crv && resolved.jwk.crv !== required.crv) ||
    (resolved.jwk.alg !== undefined && resolved.jwk.alg !== alg)
  ) {
    throw new OidcError('alg_not_allowed', `key ${header.kid} cannot verify ${alg}`);
  }

  if (!verifySignature(alg, resolved, `${encodedHeader}.${encodedPayload}`, Buffer.from(encodedSignature, 'base64url'))) {
    throw new OidcError('bad_signature', 'id_token signature does not verify');
  }

  const claims = decodeSegment<IdTokenClaims>(encodedPayload, 'payload');
  const skew = expected.clockSkewSeconds ?? DEFAULT_CLOCK_SKEW_SECONDS;
  const now = expected.now ?? Math.floor(Date.now() / 1000);

  if (claims.iss !== expected.issuer) throw new OidcError('issuer_mismatch', 'id_token iss does not match the pinned issuer');
  if (typeof claims.sub !== 'string' || claims.sub.length === 0) throw new OidcError('claims_invalid', 'id_token has no sub');

  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(expected.clientId)) throw new OidcError('audience_mismatch', 'id_token aud does not include this client');
  if (audiences.length > 1 && claims.azp === undefined) {
    throw new OidcError('audience_mismatch', 'multi-audience id_token has no azp');
  }
  if (claims.azp !== undefined && claims.azp !== expected.clientId) {
    throw new OidcError('audience_mismatch', 'id_token azp is not this client');
  }

  if (typeof claims.exp !== 'number') throw new OidcError('claims_invalid', 'id_token has no exp');
  if (typeof claims.iat !== 'number') throw new OidcError('claims_invalid', 'id_token has no iat');
  if (now - skew >= claims.exp) throw new OidcError('token_expired', 'id_token has expired');
  if (claims.iat > now + skew) throw new OidcError('claims_invalid', 'id_token iat is in the future');
  if (typeof claims.nbf === 'number' && claims.nbf > now + skew) {
    throw new OidcError('claims_invalid', 'id_token is not yet valid');
  }

  if (claims.nonce !== expected.nonce) throw new OidcError('nonce_mismatch', 'id_token nonce does not match this login');

  return claims;
}
