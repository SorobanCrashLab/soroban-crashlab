import { describe, expect, it } from 'vitest';
import { runStorageDriverContract, type ContractHarness } from './driver-contract';
import { InMemoryStorageDriver } from './in-memory-driver';
import { S3StorageDriver } from './s3-driver';
import {
  classifyStatus,
  MULTIPART_THRESHOLD_BYTES,
  needsMultipart,
  partCount,
  StorageError,
} from './driver';
import {
  readS3Config,
  S3_ENV_KEYS,
  selectedDriverName,
  storageEnvNames,
  STORAGE_DRIVER_ENV_KEY,
} from './env-config';
import { selectStorageDriver } from './index';

const S3_CONFIG = {
  endpoint: 'https://s3.us-east-1.amazonaws.com',
  region: 'us-east-1',
  bucket: 'crashlab-artifacts',
  credentials: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'top-secret-value' },
};

/**
 * Mocked object store: enough of S3's HEAD/DELETE semantics to run the whole
 * contract without a container, so routine PRs skip that cost. The MinIO job
 * runs the same suite against the real thing.
 */
function mockS3(): { fetchImpl: typeof fetch; objects: Set<string>; calls: Request[] } {
  const objects = new Set<string>();
  const calls: Request[] = [];

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    const method = (init?.method ?? 'GET').toUpperCase();
    calls.push(new Request(url, init));
    const key = decodeURIComponent(url.pathname.split('/').slice(2).join('/'));

    if (method === 'HEAD') {
      return new Response(null, { status: objects.has(key) ? 200 : 404 });
    }
    if (method === 'DELETE') {
      objects.delete(key);
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 405 });
  }) as typeof fetch;

  return { fetchImpl, objects, calls };
}

runStorageDriverContract('InMemoryStorageDriver', (): ContractHarness => {
  const driver = new InMemoryStorageDriver();
  return {
    driver,
    seed: async (key, sizeBytes) => {
      await driver.createUploadTicket(key, { sizeBytes });
    },
  };
});

runStorageDriverContract('S3StorageDriver (mocked object store)', (): ContractHarness => {
  const { fetchImpl, objects } = mockS3();
  return {
    driver: new S3StorageDriver({ config: S3_CONFIG, fetchImpl }),
    seed: async (key) => {
      objects.add(key);
    },
  };
});

describe('multipart thresholds', () => {
  it('treats the threshold itself as single-PUT', () => {
    expect(needsMultipart(MULTIPART_THRESHOLD_BYTES)).toBe(false);
    expect(needsMultipart(MULTIPART_THRESHOLD_BYTES + 1)).toBe(true);
  });

  it('always yields at least one part', () => {
    expect(partCount(0)).toBe(1);
    expect(partCount(1)).toBe(1);
  });
});

describe('failure taxonomy', () => {
  it('classifies retryable statuses as transient', () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(classifyStatus(status)).toBe('transient');
    }
  });

  it('classifies client errors as permanent', () => {
    for (const status of [400, 401, 403, 404, 409, 412]) {
      expect(classifyStatus(status)).toBe('permanent');
    }
  });

  it('surfaces a transient StorageError when the object store 500s', async () => {
    const fetchImpl = (async () => new Response(null, { status: 503 })) as typeof fetch;
    const driver = new S3StorageDriver({ config: S3_CONFIG, fetchImpl });

    await expect(driver.exists('runs/x.zip')).rejects.toMatchObject({
      name: 'StorageError',
      kind: 'transient',
      statusCode: 503,
    });
  });

  it('surfaces a permanent StorageError when the object store rejects', async () => {
    const fetchImpl = (async () => new Response(null, { status: 403 })) as typeof fetch;
    const driver = new S3StorageDriver({ config: S3_CONFIG, fetchImpl });

    await expect(driver.exists('runs/x.zip')).rejects.toMatchObject({
      kind: 'permanent',
      statusCode: 403,
    });
  });

  it('treats a network throw as transient', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const driver = new S3StorageDriver({ config: S3_CONFIG, fetchImpl });

    await expect(driver.exists('runs/x.zip')).rejects.toMatchObject({ kind: 'transient' });
  });

  it('exports StorageError with a usable kind', () => {
    const error = new StorageError('boom', 'permanent', 400);
    expect(error).toBeInstanceOf(Error);
    expect(error.kind).toBe('permanent');
  });
});

describe('S3 request signing', () => {
  it('signs HEAD with an Authorization header and the empty-payload digest', async () => {
    const { fetchImpl, calls, objects } = mockS3();
    objects.add('runs/run-1/a.zip');
    const driver = new S3StorageDriver({ config: S3_CONFIG, fetchImpl });

    await driver.exists('runs/run-1/a.zip');

    const request = calls[0];
    expect(request.method).toBe('HEAD');
    expect(request.headers.get('authorization')).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=/,
    );
    expect(request.headers.get('x-amz-content-sha256')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('keeps key separators readable in the object path', async () => {
    const { fetchImpl, calls } = mockS3();
    const driver = new S3StorageDriver({ config: S3_CONFIG, fetchImpl });

    await driver.exists('runs/run-1/nested/a.zip');
    expect(new URL(calls[0].url).pathname).toBe('/crashlab-artifacts/runs/run-1/nested/a.zip');
  });

  it('presigns each multipart part with its own partNumber', async () => {
    const driver = new S3StorageDriver({ config: S3_CONFIG, fetchImpl: mockS3().fetchImpl });
    const ticket = await driver.createUploadTicket('runs/run-1/big.zip', {
      sizeBytes: MULTIPART_THRESHOLD_BYTES * 2,
    });

    expect(ticket.kind).toBe('multipart');
    if (ticket.kind !== 'multipart') return;
    for (const part of ticket.parts) {
      expect(new URL(part.url).searchParams.get('partNumber')).toBe(String(part.partNumber));
      expect(new URL(part.url).searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe('environment contract', () => {
  const fullEnv = {
    [STORAGE_DRIVER_ENV_KEY]: 's3',
    [S3_ENV_KEYS.endpoint]: 'https://minio.local:9000/',
    [S3_ENV_KEYS.region]: 'us-east-1',
    [S3_ENV_KEYS.bucket]: 'artifacts',
    [S3_ENV_KEYS.accessKeyId]: 'key',
    [S3_ENV_KEYS.secretAccessKey]: 'secret',
  };

  it('defaults to the in-memory driver when nothing is configured', () => {
    expect(selectedDriverName({})).toBe('in-memory');
    expect(selectStorageDriver({}).driver.name).toBe('in-memory');
  });

  it('stays disabled when the driver is not explicitly selected', () => {
    const result = readS3Config({ ...fullEnv, [STORAGE_DRIVER_ENV_KEY]: undefined });
    expect(result.enabled).toBe(false);
  });

  it('activates S3 only when every required variable is present', () => {
    const result = readS3Config(fullEnv);
    expect(result.enabled).toBe(true);
    if (!result.enabled) return;
    // Trailing slash trimmed so path joins stay clean.
    expect(result.config.endpoint).toBe('https://minio.local:9000');
    expect(selectStorageDriver(fullEnv).driver.name).toBe('s3');
  });

  it('names what is missing rather than half-starting', () => {
    const result = readS3Config({ ...fullEnv, [S3_ENV_KEYS.secretAccessKey]: '  ' });
    expect(result.enabled).toBe(false);
    if (result.enabled || !('missing' in result)) throw new Error('expected missing list');
    expect(result.missing).toEqual([S3_ENV_KEYS.secretAccessKey]);
    // Falls back rather than throwing, and says why.
    expect(selectStorageDriver({ ...fullEnv, [S3_ENV_KEYS.secretAccessKey]: '' }).fallbackReason)
      .toContain(S3_ENV_KEYS.secretAccessKey);
  });

  it('carries an optional session token through', () => {
    const result = readS3Config({ ...fullEnv, [S3_ENV_KEYS.sessionToken]: 'token' });
    expect(result.enabled).toBe(true);
    if (!result.enabled) return;
    expect(result.config.credentials.sessionToken).toBe('token');
  });

  it('uses no NEXT_PUBLIC_ name, so no credential can reach a client bundle', () => {
    for (const name of storageEnvNames()) {
      expect(name.startsWith('NEXT_PUBLIC_')).toBe(false);
    }
  });
});
