/**
 * Upload ingestion gate (#1636).
 *
 * Artifact uploads go straight from the browser to UploadThing storage, so
 * the gate runs in two stages around that transfer:
 *
 *  1. `validateDeclaredUpload` — before any bytes move: the artifact class
 *     must be allowlisted, and the declared name, MIME type and size must fit
 *     that class.
 *  2. `validateUploadContent` — after the bytes land, before the artifact is
 *     persisted: size is re-checked against the real byte count and the
 *     content is sniffed (WASM `\0asm` header and a structural walk; JSON for
 *     bundles and seeds; text classes must be text, not a smuggled binary).
 *
 * Size caps come from the rest of the artifact pipeline, not SDK config
 * fragments: WASM uses the parser's `MAX_MODULE_SIZE`, JSON classes the JSON
 * body limit and text classes the request body limit.
 *
 * Every rejection is recorded (`recordUploadRejection`) in the audit log and
 * counted per reason, tagged with the upload rate-limit class.
 */

import { recordAuditEvent } from './audit/audit-sink';
import { DEFAULT_REQUEST_SIZE_LIMITS } from './request-size-limits';
import { MAX_MODULE_SIZE, parseContractWasm } from './wasm-parse';

export const ARTIFACT_CLASSES = ['wasm', 'bundle', 'seed', 'log', 'trace'] as const;
export type ArtifactClass = (typeof ARTIFACT_CLASSES)[number];

/** Rate-limit class uploads are accounted under (see the rate-limit work). */
export const UPLOAD_RATE_LIMIT_CLASS = 'upload-ingestion';

type ContentKind = 'wasm' | 'json' | 'text';

export interface ArtifactClassRule {
  extensions: readonly string[];
  /** Empty string allows a browser that reports no type at all. */
  mimeTypes: readonly string[];
  maxBytes: number;
  content: ContentKind;
}

const JSON_MIME = ['application/json', 'text/json', 'application/octet-stream', ''];
const TEXT_MIME = ['text/plain', 'application/x-ndjson', 'application/jsonl', 'application/octet-stream', ''];

export const ARTIFACT_CLASS_RULES: Readonly<Record<ArtifactClass, ArtifactClassRule>> = Object.freeze({
  wasm: {
    extensions: ['.wasm'],
    mimeTypes: ['application/wasm', 'application/octet-stream', ''],
    maxBytes: MAX_MODULE_SIZE,
    content: 'wasm',
  },
  bundle: { extensions: ['.json'], mimeTypes: JSON_MIME, maxBytes: DEFAULT_REQUEST_SIZE_LIMITS.maxJsonSize, content: 'json' },
  seed: { extensions: ['.json'], mimeTypes: JSON_MIME, maxBytes: DEFAULT_REQUEST_SIZE_LIMITS.maxJsonSize, content: 'json' },
  log: { extensions: ['.log', '.txt'], mimeTypes: TEXT_MIME, maxBytes: DEFAULT_REQUEST_SIZE_LIMITS.maxBodySize, content: 'text' },
  trace: {
    extensions: ['.jsonl', '.log', '.txt'],
    mimeTypes: TEXT_MIME,
    maxBytes: DEFAULT_REQUEST_SIZE_LIMITS.maxBodySize,
    content: 'text',
  },
});

/** Largest cap of any class; the SDK route limit must not exceed it. */
export const MAX_UPLOAD_BYTES = Math.max(...Object.values(ARTIFACT_CLASS_RULES).map((rule) => rule.maxBytes));
/** The UploadThing route's own size limit, pinned to `MAX_UPLOAD_BYTES` by test. */
export const UPLOADTHING_MAX_FILE_SIZE = '16MB';

export type UploadRejectionReason =
  | 'unknown-class'
  | 'extension-not-allowed'
  | 'mime-not-allowed'
  | 'empty'
  | 'too-large'
  | 'bad-magic'
  | 'polyglot'
  | 'malformed';

export type UploadValidation =
  | { ok: true; artifactClass: ArtifactClass }
  | { ok: false; reason: UploadRejectionReason; message: string };

export interface DeclaredUpload {
  name: string;
  size: number;
  type: string;
}

function extensionOf(name: string): string {
  const base = name.toLowerCase().split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot) : '';
}

function reject(reason: UploadRejectionReason, message: string): UploadValidation {
  return { ok: false, reason, message };
}

export function isArtifactClass(value: unknown): value is ArtifactClass {
  return typeof value === 'string' && (ARTIFACT_CLASSES as readonly string[]).includes(value);
}

/**
 * The class a file is validated as: the declared class when given, otherwise
 * inferred from the extension (first class that allows it).
 */
export function resolveArtifactClass(declared: string | undefined, fileName: string): ArtifactClass | null {
  if (declared !== undefined) return isArtifactClass(declared) ? declared : null;
  const ext = extensionOf(fileName);
  return ARTIFACT_CLASSES.find((cls) => ARTIFACT_CLASS_RULES[cls].extensions.includes(ext)) ?? null;
}

/** Stage 1: metadata only, before the upload is allowed to start. */
export function validateDeclaredUpload(file: DeclaredUpload, declaredClass?: string): UploadValidation {
  const artifactClass = resolveArtifactClass(declaredClass, file.name);
  if (!artifactClass) {
    return reject(
      'unknown-class',
      declaredClass
        ? `Artifact type "${declaredClass}" is not accepted. Allowed: ${ARTIFACT_CLASSES.join(', ')}.`
        : `Cannot infer an artifact type from "${file.name}".`,
    );
  }

  const rule = ARTIFACT_CLASS_RULES[artifactClass];
  const ext = extensionOf(file.name);
  if (!rule.extensions.includes(ext)) {
    return reject(
      'extension-not-allowed',
      `A ${artifactClass} artifact must be ${rule.extensions.join(' or ')}; got "${ext || 'no extension'}".`,
    );
  }

  const mime = file.type.split(';')[0].trim().toLowerCase();
  if (!rule.mimeTypes.includes(mime)) {
    return reject('mime-not-allowed', `MIME type "${file.type}" is not accepted for a ${artifactClass} artifact.`);
  }

  return checkSize(artifactClass, file.size);
}

function checkSize(artifactClass: ArtifactClass, size: number): UploadValidation {
  if (size <= 0) return reject('empty', 'The uploaded file is empty.');
  const { maxBytes } = ARTIFACT_CLASS_RULES[artifactClass];
  if (size > maxBytes) {
    return reject('too-large', `A ${artifactClass} artifact may be at most ${maxBytes} bytes; got ${size}.`);
  }
  return { ok: true, artifactClass };
}

const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d];

/** Leading signatures of binary formats that must never pass as text/JSON. */
const BINARY_SIGNATURES: ReadonlyArray<{ name: string; bytes: readonly number[] }> = [
  { name: 'WebAssembly', bytes: WASM_MAGIC },
  { name: 'ZIP', bytes: [0x50, 0x4b, 0x03, 0x04] },
  { name: 'PDF', bytes: [0x25, 0x50, 0x44, 0x46] },
  { name: 'ELF', bytes: [0x7f, 0x45, 0x4c, 0x46] },
  { name: 'PE/DOS', bytes: [0x4d, 0x5a] },
  { name: 'PNG', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { name: 'GIF', bytes: [0x47, 0x49, 0x46, 0x38] },
  { name: 'gzip', bytes: [0x1f, 0x8b] },
];

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.length <= bytes.length && prefix.every((value, index) => bytes[index] === value);
}

function binarySignature(bytes: Uint8Array): string | null {
  return BINARY_SIGNATURES.find((signature) => startsWith(bytes, signature.bytes))?.name ?? null;
}

function decodeText(bytes: Uint8Array): string | null {
  if (bytes.includes(0x00)) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Stage 2: the real bytes, before the artifact is persisted. */
export function validateUploadContent(artifactClass: ArtifactClass, bytes: Uint8Array): UploadValidation {
  const size = checkSize(artifactClass, bytes.byteLength);
  if (!size.ok) return size;

  const { content } = ARTIFACT_CLASS_RULES[artifactClass];

  if (content === 'wasm') {
    if (!startsWith(bytes, WASM_MAGIC)) {
      return reject('bad-magic', 'Not a WebAssembly module: missing the \\0asm header.');
    }
    try {
      // Walks every section, so a valid header glued onto other content (a
      // polyglot) fails here rather than reaching preview or replay.
      parseContractWasm(bytes);
    } catch (error) {
      return reject('malformed', `Malformed WebAssembly module: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { ok: true, artifactClass };
  }

  const signature = binarySignature(bytes);
  if (signature) {
    return reject('polyglot', `A ${artifactClass} artifact must be text, but the file starts with a ${signature} signature.`);
  }
  const text = decodeText(bytes);
  if (text === null) {
    return reject('bad-magic', `A ${artifactClass} artifact must be UTF-8 text without NUL bytes.`);
  }

  if (content === 'json') {
    const trimmed = text.replace(/^﻿/, '').trimStart();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      return reject('bad-magic', `A ${artifactClass} artifact must be a JSON document.`);
    }
    try {
      JSON.parse(trimmed);
    } catch (error) {
      return reject('malformed', `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { ok: true, artifactClass };
}

// ─── Rejection accounting ───────────────────────────────────────────────

export interface UploadRejectionRecord {
  stage: 'declared' | 'content';
  reason: UploadRejectionReason;
  fileName: string;
  size: number;
  artifactClass: string;
  runId?: string | null;
}

const rejectionCounts = new Map<UploadRejectionReason, number>();

/** Audits the rejection and counts it; never throws (audit sink contract). */
export function recordUploadRejection(record: UploadRejectionRecord): void {
  rejectionCounts.set(record.reason, (rejectionCounts.get(record.reason) ?? 0) + 1);
  recordAuditEvent({
    action: 'upload.reject',
    target: record.fileName,
    metadata: { ...record, rateLimitClass: UPLOAD_RATE_LIMIT_CLASS },
  });
}

export function getUploadRejectionCounts(): Partial<Record<UploadRejectionReason, number>> {
  return Object.fromEntries(rejectionCounts);
}

/** Reset between tests. */
export function resetUploadRejectionCounts(): void {
  rejectionCounts.clear();
}
