/**
 * Tests for the worker-backed bundle builder (#1618).
 *
 * The worker is stood up in-process: a fake `ZipWorkerLike` runs the real
 * `handleZipBuildRequest` from the protocol module and replies with the same
 * messages a browser worker would post. That covers the wiring the hook owns —
 * progress forwarding, cancel, termination, and the main-thread fallback — while
 * leaving the archive bytes to the protocol tests.
 *
 * Both paths are checked for byte-identical output, which is the property the
 * download flow depends on: a bucket without worker support must produce the
 * same file as one with it.
 */

import * as assert from 'node:assert/strict';
import { buildRunBundleFiles } from './artifact-zip';
import { createZipArchive, readZipArchive } from './zip-writer';
import { handleZipBuildRequest, ZIP_BUILD, ZIP_CANCEL, type ZipBuildRequest, type ZipWorkerRequest, type ZipWorkerResponse } from './zip-worker-protocol';
import {
    ZipBundleCancelledError,
    generateRunArtifactZipWithProgress,
    getZipWorkerFactory,
    setZipWorkerFactory,
    type ZipBundleProgress,
    type ZipWorkerEventListener,
    type ZipWorkerLike,
} from './artifact-zip-worker';
import type { FuzzingRun, LedgerStateChange } from '../types';

const GENERATED_AT = new Date(Date.UTC(2026, 2, 1, 8, 0, 0));

const EXPECTED_PATHS = ['README.md', 'fixtures.json', 'manifest.json', 'metadata.json', 'traces.json'];

const mockRun: FuzzingRun = {
    id: 'test-run-001',
    status: 'failed',
    area: 'auth',
    severity: 'high',
    duration: 5000,
    seedCount: 100,
    cpuInstructions: 500000,
    memoryBytes: 2048000,
    minResourceFee: 1500,
    crashDetail: {
        failureCategory: 'panic',
        signature: 'sig-abc123',
        payload: '{"test":"data"}',
        replayAction: 'cargo test -- --nocapture',
    },
    queuedAt: '2024-01-01T00:00:00Z',
    startedAt: '2024-01-01T00:01:00Z',
    finishedAt: '2024-01-01T00:06:00Z',
};

const mockLedgerChanges: LedgerStateChange[] = [
    { id: 'entry-1', entryType: 'ContractData', changeType: 'created', after: '{"key":"value"}' },
];

function expectedArchive(): Uint8Array {
    return createZipArchive(buildRunBundleFiles(mockRun, mockLedgerChanges, { generatedAt: GENERATED_AT }), {
        modifiedAt: GENERATED_AT,
    });
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

type FakeBehaviour = 'succeed' | 'fail' | 'refuse';

/** In-process stand-in for the browser worker, driven by the real protocol handler. */
class FakeZipWorker implements ZipWorkerLike {
    readonly posted: ZipWorkerRequest[] = [];
    terminated = false;

    private readonly listeners = new Map<string, Set<ZipWorkerEventListener>>();
    private readonly cancelledIds = new Set<string>();

    constructor(private readonly behaviour: FakeBehaviour = 'succeed') {}

    postMessage(message: ZipWorkerRequest): void {
        if (this.terminated) throw new Error('FakeZipWorker was terminated');

        this.posted.push(message);

        if (message.type === ZIP_CANCEL) {
            this.cancelledIds.add(message.requestId);
            return;
        }

        if (this.behaviour === 'refuse') {
            throw new Error('worker refuses to start');
        }

        void this.run(message);
    }

    addEventListener(type: 'message' | 'error' | 'messageerror', listener: ZipWorkerEventListener): void {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type)!.add(listener);
    }

    removeEventListener(type: 'message' | 'error' | 'messageerror', listener: ZipWorkerEventListener): void {
        this.listeners.get(type)?.delete(listener);
    }

    terminate(): void {
        // A real terminate() drops pending messages; the fake must too, or a
        // cancelled build would still deliver its result.
        this.terminated = true;
        this.listeners.clear();
    }

    get buildRequests(): ZipBuildRequest[] {
        return this.posted.filter((message): message is ZipBuildRequest => message.type === ZIP_BUILD);
    }

    private emit(message: ZipWorkerResponse): void {
        if (this.terminated) return;
        for (const listener of this.listeners.get('message') ?? []) {
            listener({ data: message });
        }
    }

    private async run(request: ZipBuildRequest): Promise<void> {
        // Let the caller finish subscribing before the first message lands.
        await tick();

        if (this.behaviour === 'fail') {
            this.emit({ type: 'zip:error', requestId: request.requestId, message: 'worker blew up' });
            return;
        }

        const response = await handleZipBuildRequest(
            request,
            (message) => this.emit(message),
            async () => {
                await tick();
                return !this.terminated && !this.cancelledIds.has(request.requestId);
            },
        );

        this.emit(response);
    }
}

/** Captures `console.warn` so fallback warnings can be asserted and kept out of the log. */
function captureWarnings(): { warnings: string[]; restore: () => void } {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(' '));
    };
    return { warnings, restore: () => { console.warn = original; } };
}

// ---------------------------------------------------------------------------
// Worker path
// ---------------------------------------------------------------------------

async function testBuildsTheArchiveInTheWorker(): Promise<void> {
    const worker = new FakeZipWorker();
    const progress: ZipBundleProgress[] = [];

    const { warnings, restore } = captureWarnings();
    try {
        const bundle = await generateRunArtifactZipWithProgress(mockRun, mockLedgerChanges, {
            generatedAt: GENERATED_AT,
            onProgress: (step) => progress.push(step),
            workerFactory: () => worker,
        });

        assert.equal(bundle.usedWorker, true);
        assert.equal(warnings.length, 0, 'the worker path must not warn');
        assert.equal(bundle.filename, 'run-test-run-001-artifacts-2026-03-01.zip');
        assert.equal(bundle.blob.type, 'application/zip');

        const bytes = new Uint8Array(await bundle.blob.arrayBuffer());
        assert.deepEqual(
            readZipArchive(bytes).map((entry) => entry.path).sort(),
            EXPECTED_PATHS,
        );
        assert.deepEqual(Array.from(bytes), Array.from(expectedArchive()));
    } finally {
        restore();
    }

    assert.ok(progress.some((step) => step.phase === 'collect'), 'progress is forwarded to the caller');
    assert.equal(progress[progress.length - 1].phase, 'done');
    assert.ok(worker.terminated, 'the worker is terminated once the build settles');
    assert.equal(worker.buildRequests.length, 1);
    assert.equal(worker.buildRequests[0].generatedAt, GENERATED_AT.toISOString());
}

// ---------------------------------------------------------------------------
// Fallback path
// ---------------------------------------------------------------------------

async function testFallsBackWhenNoWorkerIsRegistered(): Promise<void> {
    const { warnings, restore } = captureWarnings();
    try {
        const bundle = await generateRunArtifactZipWithProgress(mockRun, mockLedgerChanges, {
            generatedAt: GENERATED_AT,
            workerFactory: null,
        });

        assert.equal(bundle.usedWorker, false);
        assert.ok(
            warnings.some((warning) => warning.includes('Web Worker unavailable')),
            'the fallback must announce itself',
        );
        assert.deepEqual(new Uint8Array(await bundle.blob.arrayBuffer()), expectedArchive());
    } finally {
        restore();
    }
}

async function testFallsBackWhenTheWorkerCannotBeConstructed(): Promise<void> {
    const { warnings, restore } = captureWarnings();
    try {
        const bundle = await generateRunArtifactZipWithProgress(mockRun, mockLedgerChanges, {
            generatedAt: GENERATED_AT,
            workerFactory: () => {
                throw new Error('workers are blocked by CSP');
            },
        });

        assert.equal(bundle.usedWorker, false);
        assert.ok(warnings.some((warning) => warning.includes('workers are blocked by CSP')));
        assert.deepEqual(new Uint8Array(await bundle.blob.arrayBuffer()), expectedArchive());
    } finally {
        restore();
    }
}

async function testFallsBackWhenTheWorkerErrors(): Promise<void> {
    const worker = new FakeZipWorker('fail');

    const { warnings, restore } = captureWarnings();
    try {
        const bundle = await generateRunArtifactZipWithProgress(mockRun, mockLedgerChanges, {
            generatedAt: GENERATED_AT,
            workerFactory: () => worker,
        });

        assert.equal(bundle.usedWorker, false);
        assert.ok(warnings.some((warning) => warning.includes('worker blew up')));
        // The user still gets a usable file rather than an error.
        assert.deepEqual(new Uint8Array(await bundle.blob.arrayBuffer()), expectedArchive());
    } finally {
        restore();
    }

    assert.ok(worker.terminated, 'a failed build must not leave the worker running');
}

async function testFallsBackWhenTheBuildCannotBePosted(): Promise<void> {
    const worker = new FakeZipWorker('refuse');

    const { warnings, restore } = captureWarnings();
    try {
        const bundle = await generateRunArtifactZipWithProgress(mockRun, mockLedgerChanges, {
            generatedAt: GENERATED_AT,
            workerFactory: () => worker,
        });

        assert.equal(bundle.usedWorker, false);
        assert.ok(warnings.some((warning) => warning.includes('worker refuses to start')));
    } finally {
        restore();
    }
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

async function testAbortCancelsTheBuildAndTerminatesTheWorker(): Promise<void> {
    const worker = new FakeZipWorker();
    const controller = new AbortController();

    const promise = generateRunArtifactZipWithProgress(mockRun, mockLedgerChanges, {
        generatedAt: GENERATED_AT,
        signal: controller.signal,
        // Abort as soon as the build proves it started.
        onProgress: () => controller.abort(),
        workerFactory: () => worker,
    });

    await assert.rejects(promise, (error: unknown) => {
        assert.ok(error instanceof ZipBundleCancelledError, `expected a cancel, got ${String(error)}`);
        return true;
    });

    assert.ok(worker.terminated, 'cancel must terminate the worker, not just ignore it');
    assert.ok(
        worker.posted.some((message) => message.type === ZIP_CANCEL),
        'cancel is announced to the worker so it can stop early',
    );
}

async function testAlreadyAbortedSignalNeverStartsABuild(): Promise<void> {
    const worker = new FakeZipWorker();
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
        generateRunArtifactZipWithProgress(mockRun, mockLedgerChanges, {
            generatedAt: GENERATED_AT,
            signal: controller.signal,
            workerFactory: () => worker,
        }),
        (error: unknown) => {
            assert.ok(error instanceof ZipBundleCancelledError);
            return true;
        },
    );

    assert.equal(worker.buildRequests.length, 0, 'an aborted signal must not post a build');
    assert.ok(worker.terminated);
}

// ---------------------------------------------------------------------------
// Factory registry
// ---------------------------------------------------------------------------

async function testFactoryRegistryRoundTrips(): Promise<void> {
    const factory = (): ZipWorkerLike => new FakeZipWorker();

    const previous = getZipWorkerFactory();
    try {
        setZipWorkerFactory(factory);
        assert.equal(getZipWorkerFactory(), factory, 'a registered factory is what the hook uses');

        setZipWorkerFactory(null);
        assert.equal(getZipWorkerFactory(), null);
    } finally {
        setZipWorkerFactory(previous);
    }
}

// ---------------------------------------------------------------------------
// Run all
// ---------------------------------------------------------------------------

async function runAllTests(): Promise<void> {
    await testBuildsTheArchiveInTheWorker();

    await testFallsBackWhenNoWorkerIsRegistered();
    await testFallsBackWhenTheWorkerCannotBeConstructed();
    await testFallsBackWhenTheWorkerErrors();
    await testFallsBackWhenTheBuildCannotBePosted();

    await testAbortCancelsTheBuildAndTerminatesTheWorker();
    await testAlreadyAbortedSignalNeverStartsABuild();

    await testFactoryRegistryRoundTrips();

    console.log('artifact-zip-worker.test.ts: all assertions passed');
}

runAllTests().catch((error) => {
    console.error(error);
    process.exit(1);
});
