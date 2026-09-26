/**
 * Message protocol for the artifact-bundling Web Worker (#1618).
 *
 * Building a bundle walks every artifact, UTF-8 encodes it, CRC-32s it and
 * assembles the ZIP. For runs with hundreds of logs/wasm artifacts that is a
 * multi-second synchronous task, which is what froze the page mid-export.
 *
 * This module holds the message shapes plus the pure build handler, so the
 * worker contract can be exercised without a browser: the handler takes its
 * progress sink and its cancellation check as arguments instead of reaching for
 * `self` or `postMessage`.
 */

import type { FuzzingRun, LedgerStateChange } from '../types';
import { buildRunArtifactZipFilename, buildRunBundleFiles } from './artifact-zip';
import { createZipArchive } from './zip-writer';

/** Build a bundle and return the archive bytes. */
export const ZIP_BUILD = 'zip:build' as const;
/** Ask a running build to stop at the next checkpoint. */
export const ZIP_CANCEL = 'zip:cancel' as const;

export interface ZipBuildRequest {
    type: typeof ZIP_BUILD;
    requestId: string;
    run: FuzzingRun;
    ledgerChanges?: LedgerStateChange[];
    /**
     * ISO-8601 timestamp stamped on the archive. Passed in rather than read in
     * the worker so a retry (worker, then fallback) is byte-identical.
     */
    generatedAt: string;
}

export interface ZipCancelRequest {
    type: typeof ZIP_CANCEL;
    requestId: string;
}

export type ZipWorkerRequest = ZipBuildRequest | ZipCancelRequest;

/** `collect` walks the artifacts, `archive` assembles the ZIP, `done` is the last event. */
export type ZipPhase = 'collect' | 'archive' | 'done';

export interface ZipProgressMessage {
    type: 'zip:progress';
    requestId: string;
    phase: ZipPhase;
    completed: number;
    total: number;
    currentFile?: string;
}

export interface ZipResultMessage {
    type: 'zip:result';
    requestId: string;
    filename: string;
    byteLength: number;
    /** Exact-size archive bytes, posted as a transferable instead of a copy. */
    buffer: ArrayBuffer;
}

export interface ZipErrorMessage {
    type: 'zip:error';
    requestId: string;
    message: string;
    cancelled?: boolean;
}

export type ZipWorkerResponse = ZipProgressMessage | ZipResultMessage | ZipErrorMessage;

export type ZipProgressEmitter = (message: ZipProgressMessage) => void;

/** Resolves `true` when another phase may run, `false` once cancelled. */
export type ZipCheckpoint = () => boolean | Promise<boolean>;

const alwaysContinue: ZipCheckpoint = () => true;

/** Narrows an untrusted `message` event payload to a request we understand. */
export function isZipWorkerRequest(value: unknown): value is ZipWorkerRequest {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as { type?: unknown; requestId?: unknown };
    if (typeof candidate.requestId !== 'string' || candidate.requestId.length === 0) return false;
    return candidate.type === ZIP_BUILD || candidate.type === ZIP_CANCEL;
}

/**
 * Builds the archive for one request.
 *
 * Never throws: a failure comes back as a {@link ZipErrorMessage} so the worker
 * can post it without an error handler in the way. `checkpoint` is awaited
 * between phases, which is the worker's chance to observe a queued cancel —
 * without a yield the cancel message could not be processed at all.
 */
export async function handleZipBuildRequest(
    request: ZipBuildRequest,
    emit: ZipProgressEmitter = () => {},
    checkpoint: ZipCheckpoint = alwaysContinue,
): Promise<ZipResultMessage | ZipErrorMessage> {
    const { requestId } = request;
    const failed = (message: string, cancelled = false): ZipErrorMessage => ({
        type: 'zip:error',
        requestId,
        message,
        cancelled,
    });

    try {
        const generatedAt = new Date(request.generatedAt);
        if (Number.isNaN(generatedAt.getTime())) {
            return failed(`Invalid generatedAt timestamp: ${request.generatedAt}`);
        }

        const files = buildRunBundleFiles(request.run, request.ledgerChanges, { generatedAt });
        const total = files.length;

        for (let index = 0; index < total; index += 1) {
            // Checked for every file, not every N: the bundle has a handful of
            // files, and a cancel that only lands after the whole collection
            // would still feel unresponsive on a large run.
            if (!(await checkpoint())) {
                return failed('Bundle build cancelled while collecting artifacts', true);
            }

            emit({
                type: 'zip:progress',
                requestId,
                phase: 'collect',
                completed: index + 1,
                total,
                currentFile: files[index].path,
            });
        }

        // The archive pass is the long synchronous stretch; check right before
        // it so a cancel does not pay for it.
        if (!(await checkpoint())) {
            return failed('Bundle build cancelled before assembling the archive', true);
        }

        const archive = createZipArchive(files, { modifiedAt: generatedAt });

        emit({ type: 'zip:progress', requestId, phase: 'archive', completed: total, total });

        if (!(await checkpoint())) {
            return failed('Bundle build cancelled after assembling the archive', true);
        }

        // Copy into a fresh, exact-size buffer: the archive is a view over one
        // allocation, and only an owned ArrayBuffer can be transferred.
        const copy = new Uint8Array(archive);
        const buffer = copy.buffer as ArrayBuffer;

        emit({ type: 'zip:progress', requestId, phase: 'done', completed: total, total });

        return {
            type: 'zip:result',
            requestId,
            filename: buildRunArtifactZipFilename(request.run.id, generatedAt),
            byteLength: buffer.byteLength,
            buffer,
        };
    } catch (error) {
        return failed(error instanceof Error ? error.message : String(error));
    }
}
