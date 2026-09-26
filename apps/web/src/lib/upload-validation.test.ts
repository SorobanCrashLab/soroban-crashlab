import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ARTIFACT_CLASS_RULES,
  getUploadRejectionCounts,
  MAX_UPLOAD_BYTES,
  resetUploadRejectionCounts,
  resolveArtifactClass,
  UPLOADTHING_MAX_FILE_SIZE,
  UPLOAD_RATE_LIMIT_CLASS,
  validateDeclaredUpload,
  validateUploadContent,
} from './upload-validation';
import {
  gateDeclaredUploads,
  ingestUploadedArtifact,
  readBytesCapped,
  toStandardUploadRejection,
  type ArtifactRecord,
} from './artifact-ingestion';
import { MAX_MODULE_SIZE } from './wasm-parse';
import { DEFAULT_REQUEST_SIZE_LIMITS } from './request-size-limits';
import { getAuditLog, resetAuditLog } from './audit/audit-sink';

/** Smallest valid module: magic + version, no sections. */
const EMPTY_WASM = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);

/** A module with a type section `() -> ()`, one function and an export "run". */
const WASM_WITH_EXPORT = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x04, 0x01, 0x60, 0x00, 0x00, // type section
  0x03, 0x02, 0x01, 0x00, // function section
  0x07, 0x07, 0x01, 0x03, 0x72, 0x75, 0x6e, 0x00, 0x00, // export "run"
  0x0a, 0x04, 0x01, 0x02, 0x00, 0x0b, // code section
]);

const encode = (text: string) => new TextEncoder().encode(text);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
};
const ZIP_HEADER = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00]);

beforeEach(() => {
  resetAuditLog();
  resetUploadRejectionCounts();
});

describe('size caps align with the artifact pipeline (#1636)', () => {
  it('uses the WASM parser limit and the request-size limits', () => {
    expect(ARTIFACT_CLASS_RULES.wasm.maxBytes).toBe(MAX_MODULE_SIZE);
    expect(ARTIFACT_CLASS_RULES.bundle.maxBytes).toBe(DEFAULT_REQUEST_SIZE_LIMITS.maxJsonSize);
    expect(ARTIFACT_CLASS_RULES.log.maxBytes).toBe(DEFAULT_REQUEST_SIZE_LIMITS.maxBodySize);
  });

  it('keeps the SDK route ceiling equal to the largest class cap', () => {
    expect(UPLOADTHING_MAX_FILE_SIZE).toBe(`${MAX_UPLOAD_BYTES / (1024 * 1024)}MB`);
  });
});

describe('validateDeclaredUpload — allowlist before any bytes move', () => {
  it('accepts a declared WASM module', () => {
    expect(validateDeclaredUpload({ name: 'contract.wasm', size: 1_024, type: 'application/wasm' }, 'wasm')).toEqual({
      ok: true,
      artifactClass: 'wasm',
    });
  });

  it('infers the class from the extension when none is declared', () => {
    expect(resolveArtifactClass(undefined, 'Bundle.JSON')).toBe('bundle');
    expect(resolveArtifactClass(undefined, 'run.jsonl')).toBe('trace');
    expect(resolveArtifactClass(undefined, 'payload.exe')).toBeNull();
  });

  it.each([
    ['unknown class', { name: 'a.wasm', size: 10, type: 'application/wasm' }, 'firmware', 'unknown-class'],
    ['mis-typed extension', { name: 'contract.exe', size: 10, type: 'application/octet-stream' }, 'wasm', 'extension-not-allowed'],
    ['double extension', { name: 'bundle.json.exe', size: 10, type: 'application/json' }, 'bundle', 'extension-not-allowed'],
    ['wrong mime', { name: 'bundle.json', size: 10, type: 'image/png' }, 'bundle', 'mime-not-allowed'],
    ['empty file', { name: 'bundle.json', size: 0, type: 'application/json' }, 'bundle', 'empty'],
    ['oversized WASM', { name: 'c.wasm', size: MAX_MODULE_SIZE + 1, type: 'application/wasm' }, 'wasm', 'too-large'],
    [
      'oversized bundle',
      { name: 'b.json', size: DEFAULT_REQUEST_SIZE_LIMITS.maxJsonSize + 1, type: 'application/json' },
      'bundle',
      'too-large',
    ],
  ] as const)('rejects %s', (_label, file, declared, reason) => {
    const result = validateDeclaredUpload(file, declared);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });
});

describe('validateUploadContent — magic-byte sniffing', () => {
  it('accepts valid WASM modules', () => {
    expect(validateUploadContent('wasm', EMPTY_WASM).ok).toBe(true);
    expect(validateUploadContent('wasm', WASM_WITH_EXPORT).ok).toBe(true);
  });

  it('accepts JSON bundles and text logs', () => {
    expect(validateUploadContent('bundle', encode('﻿  {"schema":1,"seed":{}}')).ok).toBe(true);
    expect(validateUploadContent('log', encode('run started\nrun finished\n')).ok).toBe(true);
  });

  it('rejects a .wasm without the \\0asm header', () => {
    expect(validateUploadContent('wasm', encode('{"not":"wasm"}'))).toMatchObject({ ok: false, reason: 'bad-magic' });
  });

  it('rejects a WASM header glued onto other content (polyglot)', () => {
    const polyglot = concat(EMPTY_WASM, ZIP_HEADER, encode('payload'));
    expect(validateUploadContent('wasm', polyglot)).toMatchObject({ ok: false, reason: 'malformed' });
  });

  it('rejects a bundle that is really a WASM module or an archive', () => {
    expect(validateUploadContent('bundle', WASM_WITH_EXPORT)).toMatchObject({ ok: false, reason: 'polyglot' });
    expect(validateUploadContent('bundle', concat(ZIP_HEADER, encode('{}')))).toMatchObject({ ok: false, reason: 'polyglot' });
  });

  it('rejects malformed JSON and non-JSON text in a bundle', () => {
    expect(validateUploadContent('bundle', encode('{"schema": 1,'))).toMatchObject({ ok: false, reason: 'malformed' });
    expect(validateUploadContent('bundle', encode('<html></html>'))).toMatchObject({ ok: false, reason: 'bad-magic' });
  });

  it('rejects binary content in a text class', () => {
    expect(validateUploadContent('log', new Uint8Array([0x61, 0x00, 0x62]))).toMatchObject({ ok: false, reason: 'bad-magic' });
    expect(validateUploadContent('log', new Uint8Array([0xff, 0xfe, 0xfd]))).toMatchObject({ ok: false, reason: 'bad-magic' });
  });

  it('re-checks size against the real byte count', () => {
    const tooBig = new Uint8Array(DEFAULT_REQUEST_SIZE_LIMITS.maxJsonSize + 1).fill(0x20);
    expect(validateUploadContent('bundle', tooBig)).toMatchObject({ ok: false, reason: 'too-large' });
  });
});

describe('ingestion gate — rejections are auditable', () => {
  afterEach(() => resetAuditLog());

  it('records declared-stage rejections with the rate-limit class', () => {
    const result = gateDeclaredUploads([{ name: 'evil.exe', size: 10, type: 'application/x-msdownload' }], 'wasm', 'run-1');

    expect(result.ok).toBe(false);
    const entry = getAuditLog().list().find((log) => log.action === 'upload.reject');
    expect(entry?.target).toBe('evil.exe');
    expect(entry?.metadata).toMatchObject({
      stage: 'declared',
      reason: 'extension-not-allowed',
      rateLimitClass: UPLOAD_RATE_LIMIT_CLASS,
      runId: 'run-1',
    });
    expect(getUploadRejectionCounts()).toEqual({ 'extension-not-allowed': 1 });
  });

  const file = { key: 'ut-key-1', name: 'contract.wasm', size: WASM_WITH_EXPORT.byteLength, ufsUrl: 'https://utfs.io/f/ut-key-1' };

  function deps(body: Uint8Array | Response) {
    const persisted: ArtifactRecord[] = [];
    const deleted: string[] = [];
    return {
      persisted,
      deleted,
      deps: {
        fetchObject: async () => (body instanceof Response ? body : new Response(new Uint8Array(body))),
        deleteStoredFile: async (key: string) => {
          deleted.push(key);
        },
        persist: async (record: ArtifactRecord) => {
          persisted.push(record);
        },
        now: () => new Date('2026-01-01T00:00:00.000Z'),
      },
    };
  }

  it('persists a valid WASM upload', async () => {
    const d = deps(WASM_WITH_EXPORT);

    const result = await ingestUploadedArtifact(file, { artifactClass: 'wasm', runId: 'run-1' }, d.deps);

    expect(result).toEqual({ accepted: true, artifactId: 'ut-key-1', url: file.ufsUrl });
    expect(d.persisted).toEqual([
      {
        id: 'ut-key-1',
        name: 'contract.wasm',
        type: 'wasm',
        size: WASM_WITH_EXPORT.byteLength,
        updatedAt: '2026-01-01T00:00:00.000Z',
        runId: 'run-1',
        utKey: 'ut-key-1',
        utUrl: file.ufsUrl,
      },
    ]);
    expect(d.deleted).toEqual([]);
  });

  it('deletes and never persists a stored polyglot, and audits it', async () => {
    const d = deps(concat(EMPTY_WASM, ZIP_HEADER));

    const result = await ingestUploadedArtifact(file, { artifactClass: 'wasm' }, d.deps);

    expect(result).toMatchObject({ accepted: false, code: 'UPLOAD_REJECTED', reason: 'malformed' });
    expect(d.persisted).toEqual([]);
    expect(d.deleted).toEqual(['ut-key-1']);
    expect(getAuditLog().list().at(-1)?.metadata).toMatchObject({ stage: 'content', reason: 'malformed' });
  });

  it('fails closed when the stored object cannot be read', async () => {
    const d = deps(new Response('gone', { status: 404 }));

    const result = await ingestUploadedArtifact(file, { artifactClass: 'wasm' }, d.deps);

    expect(result.accepted).toBe(false);
    expect(d.persisted).toEqual([]);
    expect(d.deleted).toEqual(['ut-key-1']);
  });

  it('stops reading an object that is larger than its class allows', async () => {
    const oversized = new Uint8Array(1_000).fill(0x41);
    const bytes = await readBytesCapped(new Response(oversized), 100);
    expect(bytes.byteLength).toBe(101);
  });
});

describe('toStandardUploadRejection', () => {
  it('re-emits a gate rejection as the standard 422 envelope', async () => {
    const utResponse = Response.json(
      { message: 'nope', error: 'nope', code: 'UPLOAD_REJECTED', reason: 'bad-magic' },
      { status: 400 },
    );

    const res = await toStandardUploadRejection(utResponse);

    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: 'nope', code: 'UPLOAD_REJECTED', message: 'nope' });
  });

  it('passes other responses through untouched', async () => {
    const other = Response.json({ message: 'Invalid input' }, { status: 400 });
    expect(await toStandardUploadRejection(other)).toBe(other);
    const ok = Response.json({ ok: true });
    expect(await toStandardUploadRejection(ok)).toBe(ok);
  });
});
