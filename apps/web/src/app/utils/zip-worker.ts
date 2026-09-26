/**
 * Web Worker entry point for artifact bundling (#1618).
 *
 * The archive is assembled here rather than on the main thread, so a large run
 * export cannot freeze the UI. The worker is self-contained: it imports the
 * in-repo ZIP writer directly (this app ships no archiving dependency, so there
 * is no `jszip` to import inside it) and answers on the same protocol for every
 * request, which is what makes the contract testable in `zip-worker-protocol`.
 *
 * Messages:
 *   in  — `zip:build` (ZipBuildRequest) | `zip:cancel` (ZipCancelRequest)
 *   out — `zip:progress` | `zip:result` (archive posted as a transferable) | `zip:error`
 */

import {
    ZIP_BUILD,
    ZIP_CANCEL,
    handleZipBuildRequest,
    isZipWorkerRequest,
    type ZipBuildRequest,
    type ZipProgressMessage,
    type ZipWorkerResponse,
    type ZipCheckpoint,
} from './zip-worker-protocol';

interface ZipWorkerScope {
    onmessage: ((event: MessageEvent<unknown>) => void) | null;
    postMessage: (message: ZipWorkerResponse, transfer?: Transferable[]) => void;
}

const scope = self as unknown as ZipWorkerScope;

/** Request ids the main thread has asked to stop. */
const cancelledRequests = new Set<string>();

/**
 * Let the worker's event loop turn: without a yield a queued `zip:cancel` could
 * never be delivered while the build handler is running.
 */
const yieldToEventLoop = (): Promise<void> =>
    new Promise((resolve) => {
        setTimeout(resolve, 0);
    });

scope.onmessage = (event: MessageEvent<unknown>) => {
    const request = event.data;
    if (!isZipWorkerRequest(request)) return;

    if (request.type === ZIP_CANCEL) {
        cancelledRequests.add(request.requestId);
        return;
    }

    cancelledRequests.delete(request.requestId);
    void runBuild(request);
};

async function runBuild(request: ZipBuildRequest): Promise<void> {
    const emit = (message: ZipProgressMessage): void => {
        scope.postMessage(message);
    };

    const checkpoint: ZipCheckpoint = async () => {
        await yieldToEventLoop();
        return !cancelledRequests.has(request.requestId);
    };

    const response = await handleZipBuildRequest(request, emit, checkpoint);
    cancelledRequests.delete(request.requestId);

    if (response.type === 'zip:result') {
        // Transfer the bytes: no copy, and the main thread can build the Blob
        // straight from the ArrayBuffer.
        scope.postMessage(response, [response.buffer]);
        return;
    }

    scope.postMessage(response);
}
