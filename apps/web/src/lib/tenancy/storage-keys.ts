/**
 * Tenant storage-key format (#1894). No runtime imports, so the backfill CLI
 * can load it directly.
 *
 * Every tenant-owned object — KV record, MinIO/S3 object, cache entry — lives
 * under `org/<orgId>/project/<projectId>/`. Ids are validated before they are
 * spliced into a key so a crafted id cannot climb out of its prefix.
 */

/** `org_` / `prj_` + 26 lowercase base32 chars (128 random bits), or the backfill default. */
export const ORG_ID_PATTERN = /^org_(?:[a-z2-7]{26}|default)$/;
export const PROJECT_ID_PATTERN = /^prj_(?:[a-z2-7]{26}|default)$/;
export const RESOURCE_ID_PATTERN = /^[a-z]{2,8}_[a-z2-7]{26}$/;

export const DEFAULT_ORG_ID = 'org_default';
export const DEFAULT_PROJECT_ID = 'prj_default';

export const TENANT_KEY_PATTERN = /^org\/org_(?:[a-z2-7]{26}|default)\/project\/prj_(?:[a-z2-7]{26}|default)\/[^/]/;

export function tenantKeyPrefix(orgId: string, projectId: string): string {
  if (!ORG_ID_PATTERN.test(orgId)) throw new Error(`invalid org id ${JSON.stringify(orgId)}`);
  if (!PROJECT_ID_PATTERN.test(projectId)) throw new Error(`invalid project id ${JSON.stringify(projectId)}`);
  return `org/${orgId}/project/${projectId}/`;
}

/** Joins a relative key under a prefix, refusing anything that could escape it. */
export function joinTenantKey(prefix: string, relativeKey: string): string {
  if (
    relativeKey.length === 0 ||
    relativeKey.startsWith('/') ||
    relativeKey.split('/').some((segment) => segment === '..' || segment === '.' || segment === '') ||
    relativeKey.includes('\\')
  ) {
    throw new Error(`unsafe storage key ${JSON.stringify(relativeKey)}`);
  }
  return `${prefix}${relativeKey}`;
}

export function isTenantKey(key: string): boolean {
  return TENANT_KEY_PATTERN.test(key);
}
