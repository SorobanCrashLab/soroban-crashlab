/**
 * The ingestion gate as wired into the UploadThing router (#1636): the real
 * `fuzzArtifact` endpoint's middleware and error formatter.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UploadThingError } from 'uploadthing/server';
import { crashlabFileRouter } from './core';
import { resetAuditLog, getAuditLog } from '@/lib/audit/audit-sink';

interface EndpointInternals {
  middleware: (args: { input: Record<string, unknown>; files: unknown[] }) => Promise<Record<string, unknown>>;
  errorFormatter: (err: UploadThingError) => Record<string, unknown>;
}
const endpoint = crashlabFileRouter.fuzzArtifact as unknown as EndpointInternals;

const savedEnv = { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };

beforeEach(() => {
  resetAuditLog();
  process.env.KV_REST_API_URL = 'https://kv.example.com';
  process.env.KV_REST_API_TOKEN = 'token';
});

afterEach(() => {
  process.env.KV_REST_API_URL = savedEnv.url;
  process.env.KV_REST_API_TOKEN = savedEnv.token;
  if (savedEnv.url === undefined) delete process.env.KV_REST_API_URL;
  if (savedEnv.token === undefined) delete process.env.KV_REST_API_TOKEN;
});

describe('fuzzArtifact middleware', () => {
  it('admits a valid WASM declaration and tags it with its class', async () => {
    const metadata = await endpoint.middleware({
      input: { runId: 'run-1', artifactType: 'wasm' },
      files: [{ name: 'contract.wasm', size: 2_048, type: 'application/wasm' }],
    });
    expect(metadata).toEqual({ runId: 'run-1', artifactType: 'wasm' });
  });

  it('rejects a mis-typed file before upload with an auditable UPLOAD_REJECTED error', async () => {
    const error = await endpoint
      .middleware({
        input: { artifactType: 'wasm' },
        files: [{ name: 'contract.wasm.exe', size: 2_048, type: 'application/x-msdownload' }],
      })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(UploadThingError);
    expect(endpoint.errorFormatter(error as UploadThingError)).toMatchObject({
      code: 'UPLOAD_REJECTED',
      reason: 'extension-not-allowed',
      error: expect.any(String),
      message: expect.any(String),
    });
    expect(getAuditLog().list().map((log) => log.action)).toContain('upload.reject');
  });

  it('rejects an oversized declaration', async () => {
    const error = await endpoint
      .middleware({
        input: { artifactType: 'bundle' },
        files: [{ name: 'bundle.json', size: 64 * 1024 * 1024, type: 'application/json' }],
      })
      .catch((err: unknown) => err);
    expect(endpoint.errorFormatter(error as UploadThingError)).toMatchObject({ reason: 'too-large' });
  });

  it('formats unrelated SDK errors without the rejection envelope', () => {
    expect(endpoint.errorFormatter(new UploadThingError('Storage not configured'))).toEqual({
      message: 'Storage not configured',
    });
  });
});
