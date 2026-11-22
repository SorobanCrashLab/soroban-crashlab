/**
 * API token -> principal resolution for RBAC (#1548).
 *
 * The RBAC decision needs to answer "which token is this?" from the presented
 * `Authorization: Bearer` secret. `api-token-store` can answer that, but it
 * reaches for `node:crypto` to hash and compare, and `rbac.ts` is imported by
 * the proxy/middleware entry points that run on the Edge runtime. Rather than
 * duplicate a hash and hope the two stay in step, both sides agree on SHA-256
 * over the raw secret and the hash is used as the record key.
 *
 * Nothing here is a new secret: the stored value is the same SHA-256 digest
 * `api-token-store` already keeps, so this store adds an index, not a second
 * copy of credential material.
 */

import { selectRecordDriver } from './record-driver';

const TOKEN_INDEX_KEY = 'rbac:token-principals:index';
const TOKEN_RECORD_PREFIX = 'rbac:token-principal:';

/** Hex SHA-256 of the raw token secret. Matches `hashApiToken` in api-token-store. */
export async function hashTokenSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function tokenRecordKey(sha256Hash: string): string {
  return `${TOKEN_RECORD_PREFIX}${sha256Hash}`;
}

/**
 * Records that `sha256Hash` authenticates the API token `tokenId`, so RBAC can
 * map a presented secret onto a role assignment.
 */
export async function registerTokenPrincipal(params: {
  tokenId: string;
  sha256Hash: string;
}): Promise<void> {
  const driver = selectRecordDriver();
  await driver.putRecord(tokenRecordKey(params.sha256Hash), params.tokenId);
  await driver.addToIndex(TOKEN_INDEX_KEY, params.sha256Hash);
}

/**
 * Removes a token principal, so a revoked token stops resolving to a role the
 * instant it is revoked. The digest is the key, so revoking needs the hash the
 * token record already carries.
 */
export async function unregisterTokenPrincipal(params: { sha256Hash: string }): Promise<void> {
  const driver = selectRecordDriver();
  await driver.deleteRecord(tokenRecordKey(params.sha256Hash));
  await driver.removeFromIndex(TOKEN_INDEX_KEY, params.sha256Hash);
}

/**
 * Resolves a presented secret to the API token id it authenticates, or `null`
 * when the secret was never issued. Callers treat `null` as unauthenticated.
 */
export async function resolveTokenPrincipalId(secret: string): Promise<string | null> {
  const sha256Hash = await hashTokenSecret(secret);
  return resolveTokenPrincipalIdByHash(sha256Hash);
}

/** Hash-keyed variant, for callers that already hold the digest. */
export async function resolveTokenPrincipalIdByHash(sha256Hash: string): Promise<string | null> {
  return selectRecordDriver().getRecord(tokenRecordKey(sha256Hash));
}

/** Every registered digest. Used by the retention sweep and by tests. */
export async function listTokenPrincipalHashes(): Promise<string[]> {
  return selectRecordDriver().listIndex(TOKEN_INDEX_KEY);
}

/** Test seam: forgets every token principal this process has registered. */
export async function resetTokenPrincipalStore(): Promise<void> {
  const driver = selectRecordDriver();
  for (const hash of await listTokenPrincipalHashes()) {
    await driver.deleteRecord(tokenRecordKey(hash));
  }
  await driver.clearIndex(TOKEN_INDEX_KEY);
}
