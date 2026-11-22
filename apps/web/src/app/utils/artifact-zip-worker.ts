/**
 * Worker-backed artifact bundle generation (#1618).
 *
 * `generateRunArtifactZipWithProgress` is the API the download button uses: it
 * runs the bundling in a Web Worker, streams progress for the progress bar and
 * accepts an `AbortSignal` for cancel. When no worker can be created — SSR, a
 * browser without worker support, or a worker that fails to load — it falls
 * back to the previous main-thread path with a warning, so an export never
 * silently stops working.
 *
 * The worker factory is injected rather than constructed here on purpose: the
 * `new Worker(new URL('./zip-worker.ts', import.meta.url))` form is bundler
 * specific and carries `import.meta`, which would keep this module out of the
 * CommonJS test compile. `zip-worker-factory.ts` holds the real one.
 */

import type { FuzzingRun, LedgerStateChange } from '../types';
import { buildRunArtifactZipFilename, buildRunBundleFiles } from './artifact-zip';
import { createZipArchive } from './zip-writer';
import {
    ZIP_BUILD,
    ZIP_CANCEL,
    type ZipPhase,
    type ZipWorkerRequest,
    type ZipWorkerResponse,
} from './zip-worker-protocol';

/** The slice of `Worker` this module needs, so tests can pass a stand-in. */
export interface ZipWorkerLike {
    postMessage(message: ZipWorkerRequest, transfer?: Transferable[]): void;
    addEventListener(type: 'message' | 'error' | 'messageerror', listener: ZipWorkerEventListener): void;
    removeEventListener(type: 'message' | 'error' | 'messageerror', listener: ZipWorkerEventListener): void;
    terminate(): void;
}

export type ZipWorkerEventListener = (event: { data?: ZipWorkerResponse; message?: string }) => void;

export type ZipWorkerFactory = () => ZipWorkerLike;

export interface ZipBundleProgress {
    phase: ZipPhase;
    completed: number;
    total: number;
    currentFile?: string;
}

export interface ZipBundleOptions {
    /** Called for every progress message the worker streams. */
    onProgress?: (progress: ZipBundleProgress) => void;
    /** Aborting cancels the build and terminates the worker. */
    signal?: AbortSignal;
    /** Fixed timestamp, so a retry is byte-identical. Defaults to now. */
    generatedAt?: Date;
    /** Overrides the registered factory; pass `null` to force the fallback. */
    workerFactory?: ZipWorkerFactory | null;
}

export interface ZipBundle {
    blob: Blob;
    filename: string;
    /** False when the archive had to be built on the main thread. */
    usedWorker: boolean;
}

/** Thrown when the caller aborts; the download button treats it as "no-op", not a failure. */
export class ZipBundleCancelledError extends Error {
    constructor() {
        super('Artifact bundle build was cancelled');
        this.name = 'ZipBundleCancelledError';
    }
}

let registeredFactory: ZipWorkerFactory | null = null;
let requestCounter = 0;

/** Registers the browser worker factory; pass `null` to unregister (e.g. on unmount). */
export function setZipWorkerFactory(factory: ZipWorkerFactory | null): void {
    registeredFactory = factory;
}

export function getZipWorkerFactory(): ZipWorkerFactory | null {
    return registeredFactory;
}

/**
 * Builds the downloadable archive for a run, preferring a Web Worker.
 *
 * @throws {ZipBundleCancelledError} when `options.signal` aborts.
 */
export async function generateRunArtifactZipWithProgress(
    run: FuzzingRun,
    ledgerChanges?: LedgerStateChange[],
    options: ZipBundleOptions = {},
): Promise<ZipBundle> {
    const factory = options.workerFactory === undefined ? registeredFactory : options.workerFactory;

    if (typeof factory !== 'function') {
        return buildOnMainThread(run, ledgerChanges, options, 'no Web Worker support');
    }

    try {
        return await buildInWorker(run, ledgerChanges, options, factory);
    } catch (error) {
        if (error instanceof ZipBundleCancelledError) throw error;

        const reason = error instanceof Error ? error.message : String(error);
        return buildOnMainThread(run, ledgerChanges, options, reason);
    }
}

/** Previous behaviour: assemble the archive synchronously on the calling thread. */
async function buildOnMainThread(
    run: FuzzingRun,
    ledgerChanges: LedgerStateChange[] | undefined,
    options: ZipBundleOptions,
    reason: string,
): Promise<ZipBundle> {
    console.warn(
        `[artifact-zip] Web Worker unavailable (${reason}); building the archive on the main thread. ` +
            'Large runs can block the UI while this runs.',
    );

    const generatedAt = options.generatedAt ?? new Date();
    const files = buildRunBundleFiles(run, ledgerChanges, { generatedAt });
    const archive = createZipArchive(files, { modifiedAt: generatedAt });
    const blob = new Blob([archive as BlobPart], { type: 'application/zip' });

    options.onProgress?.({ phase: 'done', completed: files.length, total: files.length });

    return { blob, filename: buildRunArtifactZipFilename(run.id, generatedAt), usedWorker: false };
}

function buildInWorker(
    run: FuzzingRun,
    ledgerChanges: LedgerStateChange[] | undefined,
    options: ZipBundleOptions,
    factory: ZipWorkerFactory,
): Promise<ZipBundle> {
    const generatedAt = options.generatedAt ?? new Date();
    const requestId = `zip-${(requestCounter += 1)}-${Date.now()}`;

    return new Promise<ZipBundle>((resolve, reject) => {
        let worker: ZipWorkerLike;
        try {
            worker = factory();
        } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
            return;
        }

        let settled = false;
        let buildPosted = false;

        const finish = (settle: () => void): void => {
            if (settled) return;
            settled = true;
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', onError);
            options.signal?.removeEventListener('abort', onAbort);
            // Always terminate: whether the build finished, failed or was
            // cancelled, the worker must not keep burning CPU.
            worker.terminate();
            settle();
        };

        const onMessage: ZipWorkerEventListener = (event) => {
            const data = event.data;
            if (!data || data.requestId !== requestId) return;

            if (data.type === 'zip:progress') {
                options.onProgress?.({
                    phase: data.phase,
                    completed: data.completed,
                    total: data.total,
                    currentFile: data.currentFile,
                });
                return;
            }

            if (data.type === 'zip:result') {
                finish(() =>
                    resolve({
                        blob: new Blob([data.buffer], { type: 'application/zip' }),
                        filename: data.filename,
                        usedWorker: true,
                    }),
                );
                return;
            }

            if (data.cancelled) {
                finish(() => reject(new ZipBundleCancelledError()));
                return;
            }

            finish(() => reject(new Error(data.message)));
        };

        const onError: ZipWorkerEventListener = (event) => {
            finish(() => reject(new Error(event.message || 'Artifact zip worker failed to load')));
        };

        const onAbort = (): void => {
            // Ask the worker to stop at its next checkpoint, then terminate, so
            // the CPU is freed even if it is in the middle of the archive pass.
            // A build that was never posted has nothing to cancel.
            if (buildPosted) {
                try {
                    worker.postMessage({ type: ZIP_CANCEL, requestId });
                } catch {
                    // The worker may already be gone; terminating below is what matters.
                }
            }
            finish(() => reject(new ZipBundleCancelledError()));
        };

        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);

        // Check before subscribing: an already-aborted signal will not fire
        // `abort` again, so the build must not start at all.
        if (options.signal?.aborted) {
            onAbort();
            return;
        }
        options.signal?.addEventListener('abort', onAbort, { once: true });

        buildPosted = true;
        try {
            worker.postMessage({
                type: ZIP_BUILD,
                requestId,
                run,
                ledgerChanges,
                generatedAt: generatedAt.toISOString(),
            });
        } catch (error) {
            buildPosted = false;
            finish(() => reject(error instanceof Error ? error : new Error(String(error))));
        }
    });
}
