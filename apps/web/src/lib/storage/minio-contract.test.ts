import { describe, it } from 'vitest';
import { runStorageDriverContract, type ContractHarness } from './driver-contract';
import { S3StorageDriver } from './s3-driver';
import { readS3Config } from './env-config';

/**
 * The same contract suite, run against a real S3-compatible server (#1433).
 *
 * Skipped unless the environment contract is satisfied, so routine PRs pay no
 * container cost; the dedicated MinIO workflow sets these variables and runs
 * this file alone.
 */
const configResult = readS3Config(process.env);
const enabled = configResult.enabled;

async function ensureBucket(config: Extract<typeof configResult, { enabled: true }>['config']) {
  // MinIO starts empty; create the bucket with a signed PUT so the signer is
  // exercised here too.
  const response = await fetch(`${config.endpoint}/${config.bucket}`, {
    method: 'PUT',
    headers: await signedBucketHeaders(config),
  });
  if (!response.ok && response.status !== 409) {
    throw new Error(`Could not create bucket: HTTP ${response.status}`);
  }
}

async function signedBucketHeaders(
  config: Extract<typeof configResult, { enabled: true }>['config'],
): Promise<Record<string, string>> {
  const { sha256Hex, signRequest, toAmzDate, uriEncode } = await import('./sigv4');
  const scope = { amzDate: toAmzDate(new Date()), region: config.region, service: 's3' };
  const payloadHash = sha256Hex('');
  const headers: Record<string, string> = {
    host: new URL(config.endpoint).host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': scope.amzDate,
  };
  const signed = signRequest(
    { method: 'PUT', path: `/${uriEncode(config.bucket)}`, query: {}, headers, payloadHash },
    config.credentials,
    scope,
  );
  return { ...headers, Authorization: signed.authorization };
}

if (enabled && configResult.enabled) {
  const { config } = configResult;

  runStorageDriverContract('S3StorageDriver (MinIO service container)', async (): Promise<ContractHarness> => {
    await ensureBucket(config);
    const driver = new S3StorageDriver({ config });

    return {
      driver,
      seed: async (key, sizeBytes) => {
        const ticket = await driver.createUploadTicket(key, { sizeBytes });
        const url = ticket.kind === 'single' ? ticket.url : ticket.parts[0].url;
        const response = await fetch(url, { method: 'PUT', body: 'x'.repeat(Math.max(1, sizeBytes)) });
        if (!response.ok) throw new Error(`Seed upload failed: HTTP ${response.status}`);
      },
    };
  });
} else {
  describe('StorageDriver contract: MinIO service container', () => {
    it.skip('skipped — CRASHLAB_STORAGE_DRIVER=s3 and credentials are not configured', () => {
      // Intentionally empty: the mocked-S3 path in storage-driver.test.ts
      // covers the same contract for PR-speed runs.
    });
  });
}
