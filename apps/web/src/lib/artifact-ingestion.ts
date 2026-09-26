/**
 * Artifact ingestion for the UploadThing route (#1636).
 *
 * The SDK-agnostic half of the ingestion gate: the declared-metadata check
 * run in `.middleware()`, the content check run in `.onUploadComplete()`
 * before anything is written to the artifact store, and the mapping of gate
 * rejections onto the standard 422 envelope.
 */

import { NextResponse } from 'next/server';
import { ERROR_CODES } from './error-codes';
import { httpCall } from './http-call';
import {
  ARTIFACT_CLASS_RULES,
  recordUploadRejection,
  validateDeclaredUpload,
  validateUploadContent,
  type ArtifactClass,
  type DeclaredUpload,
  type UploadRejectionReason,
  type UploadValidation,
} from './upload-validation';

export const UPLOAD_REJECTED_CODE = ERROR_CODES.UPLOAD_REJECTED.code;

/** Stage 1: every declared file must pass; the first failure is recorded. */
export function gateDeclaredUploads(
  files: readonly DeclaredUpload[],
  declaredClass: string | undefined,
  runId?: string,
): UploadValidation {
  let accepted: UploadValidation | null = null;
  for (const file of files) {
    const result = validateDeclaredUpload(file, declaredClass);
    if (!result.ok) {
      recordUploadRejection({
        stage: 'declared',
        reason: result.reason,
        fileName: file.name,
        size: file.size,
        artifactClass: declaredClass ?? 'inferred',
        runId,
      });
      return result;
    }
    accepted ??= result;
  }
  return accepted ?? { ok: false, reason: 'empty', message: 'No file was provided.' };
}

/**
 * Reads at most `maxBytes + 1` bytes, so an object larger than its declared
 * size is detected without buffering all of it.
 */
export async function readBytesCapped(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array(await response.arrayBuffer()).slice(0, maxBytes + 1);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      break;
    }
  }
  const out = new Uint8Array(Math.min(total, maxBytes + 1));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, out.byteLength - offset);
    out.set(chunk.subarray(0, take), offset);
    offset += take;
    if (offset >= out.byteLength) break;
  }
  return out;
}

export interface UploadedFileRef {
  key: string;
  name: string;
  size: number;
  ufsUrl: string;
}

export interface ArtifactRecord {
  id: string;
  name: string;
  type: ArtifactClass;
  size: number;
  updatedAt: string;
  runId: string | null;
  utKey: string;
  utUrl: string;
}

export interface IngestionDeps {
  /** Fetches the stored object. Defaults to `httpCall` under the outbound policy. */
  fetchObject?: (url: string) => Promise<Response>;
  /** Removes a rejected object from storage so junk never accumulates. */
  deleteStoredFile: (key: string) => Promise<void>;
  /** Writes the artifact record. Only called for content that passed. */
  persist: (record: ArtifactRecord) => Promise<void>;
  now?: () => Date;
}

export type IngestionResult =
  | { accepted: true; artifactId: string; url: string }
  | { accepted: false; code: typeof UPLOAD_REJECTED_CODE; reason: UploadRejectionReason; message: string };

/** Stage 2: sniff the stored bytes, then persist or delete. */
export async function ingestUploadedArtifact(
  file: UploadedFileRef,
  metadata: { artifactClass: ArtifactClass; runId?: string | null },
  deps: IngestionDeps,
): Promise<IngestionResult> {
  const fetchObject = deps.fetchObject ?? ((url: string) => httpCall('uploadthing', url, { method: 'GET' }));
  const { maxBytes } = ARTIFACT_CLASS_RULES[metadata.artifactClass];

  let verdict: UploadValidation;
  try {
    const response = await fetchObject(file.ufsUrl);
    verdict = response.ok
      ? validateUploadContent(metadata.artifactClass, await readBytesCapped(response, maxBytes))
      : { ok: false, reason: 'malformed', message: `Stored object could not be read (HTTP ${response.status}).` };
  } catch (error) {
    verdict = {
      ok: false,
      reason: 'malformed',
      message: `Stored object could not be read: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!verdict.ok) {
    recordUploadRejection({
      stage: 'content',
      reason: verdict.reason,
      fileName: file.name,
      size: file.size,
      artifactClass: metadata.artifactClass,
      runId: metadata.runId ?? null,
    });
    // Fail closed: an unverifiable object is removed, never persisted.
    await deps.deleteStoredFile(file.key).catch(() => undefined);
    return { accepted: false, code: UPLOAD_REJECTED_CODE, reason: verdict.reason, message: verdict.message };
  }

  await deps.persist({
    id: file.key,
    name: file.name,
    type: metadata.artifactClass,
    size: file.size,
    updatedAt: (deps.now?.() ?? new Date()).toISOString(),
    runId: metadata.runId ?? null,
    utKey: file.key,
    utUrl: file.ufsUrl,
  });
  return { accepted: true, artifactId: file.key, url: file.ufsUrl };
}

/**
 * UploadThing reports middleware errors as 400s in its own shape. A gate
 * rejection is re-emitted as the standard 422 envelope (`{ error, code }`);
 * `message` is kept so the UploadThing client still shows the reason.
 */
export async function toStandardUploadRejection(response: Response): Promise<Response> {
  if (response.status !== 400) return response;
  const body = (await response.clone().json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || body.code !== UPLOAD_REJECTED_CODE) return response;
  return NextResponse.json(body, { status: ERROR_CODES.UPLOAD_REJECTED.httpStatus, headers: response.headers });
}
