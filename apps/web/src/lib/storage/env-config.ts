/**
 * Environment contract for the artifact storage driver (#1433).
 *
 * The S3 driver ships DISABLED: unless `CRASHLAB_STORAGE_DRIVER=s3` is set and
 * the credential variables are present, the in-memory driver stays the default.
 *
 * Every name here is server-only on purpose. Next.js exposes exactly the
 * variables prefixed `NEXT_PUBLIC_`, so keeping the prefix off these names is
 * what guarantees no key reaches a client bundle — asserted in the tests.
 */

import type { SigV4Credentials } from './sigv4';

export const STORAGE_DRIVER_ENV_KEY = 'CRASHLAB_STORAGE_DRIVER';

export const S3_ENV_KEYS = {
  endpoint: 'CRASHLAB_S3_ENDPOINT',
  region: 'CRASHLAB_S3_REGION',
  bucket: 'CRASHLAB_S3_BUCKET',
  accessKeyId: 'CRASHLAB_S3_ACCESS_KEY_ID',
  secretAccessKey: 'CRASHLAB_S3_SECRET_ACCESS_KEY',
  sessionToken: 'CRASHLAB_S3_SESSION_TOKEN',
} as const;

export type StorageDriverName = 'in-memory' | 's3';

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  credentials: SigV4Credentials;
}

export type S3ConfigResult =
  | { enabled: false; reason: string }
  | { enabled: true; config: S3Config }
  | { enabled: false; reason: string; missing: string[] };

export type EnvLike = Record<string, string | undefined>;

export function selectedDriverName(env: EnvLike): StorageDriverName {
  return env[STORAGE_DRIVER_ENV_KEY] === 's3' ? 's3' : 'in-memory';
}

/**
 * Reads the S3 contract. A partially configured environment is reported as
 * disabled with the missing names listed, rather than half-starting a driver
 * that will fail on first use.
 */
export function readS3Config(env: EnvLike): S3ConfigResult {
  if (selectedDriverName(env) !== 's3') {
    return { enabled: false, reason: `${STORAGE_DRIVER_ENV_KEY} is not set to "s3"` };
  }

  const required = ['endpoint', 'region', 'bucket', 'accessKeyId', 'secretAccessKey'] as const;
  const missing = required.filter((field) => !env[S3_ENV_KEYS[field]]?.trim());

  if (missing.length > 0) {
    return {
      enabled: false,
      reason: 'S3 driver selected but required configuration is missing',
      missing: missing.map((field) => S3_ENV_KEYS[field]),
    };
  }

  return {
    enabled: true,
    config: {
      endpoint: env[S3_ENV_KEYS.endpoint]!.trim().replace(/\/$/, ''),
      region: env[S3_ENV_KEYS.region]!.trim(),
      bucket: env[S3_ENV_KEYS.bucket]!.trim(),
      credentials: {
        accessKeyId: env[S3_ENV_KEYS.accessKeyId]!.trim(),
        secretAccessKey: env[S3_ENV_KEYS.secretAccessKey]!.trim(),
        sessionToken: env[S3_ENV_KEYS.sessionToken]?.trim() || undefined,
      },
    },
  };
}

/** Every environment name this feature reads. Used by the client-leak test. */
export function storageEnvNames(): string[] {
  return [STORAGE_DRIVER_ENV_KEY, ...Object.values(S3_ENV_KEYS)];
}
