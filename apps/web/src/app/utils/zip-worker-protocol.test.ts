/**
 * Contract tests for the artifact-bundling worker protocol (#1618).
 *
 * `handleZipBuildRequest` is the worker's whole contract — the same function the
 * worker entry calls — so these assertions cover progress reporting, cancel
 * checkpoints and failure reporting without a browser. The archive it returns is
 * read back with our own `readZipArchive`, and compared byte-for-byte with the
 * main-thread `createZipArchive` output so both paths stay interchangeable.
 */

import * as assert from 'node:assert/strict';
import { buildRunArtifactZipFilename, buildRunBundleFiles } from './artifact-zip';
import { createZipArchive, readZipArchive } from './zip-writer';
import {
    ZIP_BUILD,
    ZIP_CANCEL,
    handleZipBuildRequest,
    isZipWorkerRequest,
    type ZipBuildRequest,
    type ZipErrorMessage,
    type ZipProgressMessage,
    type ZipResultMessage,
    type ZipWorkerResponse,
} from './zip-worker-protocol';
import type { FuzzingRun, LedgerStateChange } from '../types';

const GENERATED_AT = new Date(Date.UTC(2026, 2, 1, 8, 0, 0));

/** Files every bundle carries; the count is what the worker reports as `total`. */
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
    { id: 'entry-2', entryType: 'Account', changeType: 'updated', before: '{"balance":"1000"}', after: '{"balance":"900"}' },
];

function makeRequest(overrides: Partial<ZipBuildRequest> = {}): ZipBuildRequest {
    return {
        type: ZIP_BUILD,
        requestId: 'req-1',
        run: mockRun,
        ledgerChanges: mockLedgerChanges,
        generatedAt: GENERATED_AT.toISOString(),
        ...overrides,
    };
}

function expectResult(response: ZipWorkerResponse): ZipResultMessage {
    assert.equal(response.type, 'zip:result', `expected a result, got ${JSON.stringify(response)}`);
    return response as ZipResultMessage;
}

function expectError(response: ZipWorkerResponse): ZipErrorMessage {
    assert.equal(response.type, 'zip:error', `expected an error, got ${response.type}`);
    return response as ZipErrorMessage;
}

function bytesOf(response: ZipResultMessage): Uint8Array {
    return new Uint8Array(response.buffer);
}

function archivePaths(bytes: Uint8Array): string[] {
    return readZipArchive(bytes)
        .map((entry) => entry.path)
        .sort();
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

async function testEmitsProgressForEveryFileThenDone(): Promise<void> {
    const progress: ZipProgressMessage[] = [];
    const response = expectResult(await handleZipBuildRequest(makeRequest(), (m) => progress.push(m)));

    const collect = progress.filter((message) => message.phase === 'collect');
    assert.equal(collect.length, EXPECTED_PATHS.length, 'one collect event per bundle file');
    assert.deepEqual(
        collect.map((message) => message.completed),
        [1, 2, 3, 4, 5],
        'completion counts advance one file at a time',
    );
    assert.ok(collect.every((message) => message.total === EXPECTED_PATHS.length));
    assert.ok(collect.every((message) => typeof message.currentFile === 'string' && message.currentFile.length > 0));
    assert.ok(progress.some((message) => message.phase === 'archive'), 'archive phase is reported');
    assert.equal(progress[progress.length - 1].phase, 'done');
    assert.ok(progress.every((message) => message.requestId === response.requestId));
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

async function testResultIsAReadableZip(): Promise<void> {
    const response = expectResult(await handleZipBuildRequest(makeRequest()));
    const bytes = bytesOf(response);

    // "PK\x03\x04": the local file header signature every unzip tool looks for.
    assert.deepEqual([...bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);
    assert.deepEqual(archivePaths(bytes), EXPECTED_PATHS);
    assert.equal(response.byteLength, bytes.length, 'byteLength matches the transferred buffer');
    assert.equal(response.filename, buildRunArtifactZipFilename(mockRun.id, GENERATED_AT));
}

async function testWorkerOutputMatchesTheMainThreadArchive(): Promise<void> {
    const response = expectResult(await handleZipBuildRequest(makeRequest()));

    const direct = createZipArchive(
        buildRunBundleFiles(mockRun, mockLedgerChanges, { generatedAt: GENERATED_AT }),
        { modifiedAt: GENERATED_AT },
    );

    assert.deepEqual(
        Array.from(bytesOf(response)),
        Array.from(direct),
        'worker and main-thread archives must be byte-identical for the same fixture set',
    );
}

async function testResultBufferIsExactlySized(): Promise<void> {
    const response = expectResult(await handleZipBuildRequest(makeRequest()));
    assert.equal(response.buffer.byteLength, response.byteLength, 'no slack left in the transferred buffer');
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

async function testCancelBeforeAnyFileIsCollected(): Promise<void> {
    const progress: ZipProgressMessage[] = [];
    const response = expectError(
        await handleZipBuildRequest(makeRequest(), (m) => progress.push(m), () => false),
    );

    assert.equal(response.cancelled, true);
    assert.match(response.message, /cancelled while collecting/);
    assert.equal(progress.length, 0, 'a cancel before the first file emits no progress');
}

async function testCancelAfterCollectionStopsBeforeArchiving(): Promise<void> {
    const progress: ZipProgressMessage[] = [];
    let checkpoints = 0;

    const response = expectError(
        await handleZipBuildRequest(
            makeRequest(),
            (m) => progress.push(m),
            () => {
                checkpoints += 1;
                // One checkpoint per collected file, then refuse the archive pass.
                return checkpoints <= EXPECTED_PATHS.length;
            },
        ),
    );

    assert.equal(response.cancelled, true);
    assert.match(response.message, /before assembling the archive/);
    assert.equal(progress.filter((message) => message.phase === 'archive').length, 0);
}

async function testCancelledResponseCarriesNoArchive(): Promise<void> {
    const response = expectError(await handleZipBuildRequest(makeRequest(), undefined, () => false));
    assert.ok(!('buffer' in response), 'a cancelled build must not hand back archive bytes');
}

// ---------------------------------------------------------------------------
// Failure reporting
// ---------------------------------------------------------------------------

async function testInvalidTimestampIsReportedAsAnError(): Promise<void> {
    const response = expectError(
        await handleZipBuildRequest(makeRequest({ generatedAt: 'not-a-timestamp' })),
    );

    assert.equal(response.cancelled, false);
    assert.match(response.message, /Invalid generatedAt timestamp/);
    assert.equal(response.requestId, 'req-1');
}

async function testHandlerNeverThrows(): Promise<void> {
    // A malformed run reaches the catch block rather than escaping the handler,
    // which is what lets the worker stay alive for the next request.
    const missingRun = undefined as unknown as FuzzingRun;
    const response = expectError(await handleZipBuildRequest(makeRequest({ run: missingRun })));
    assert.ok(response.message.length > 0);
    assert.equal(response.cancelled, false);
}

// ---------------------------------------------------------------------------
// Request guard
// ---------------------------------------------------------------------------

function testRequestGuardAcceptsOnlyKnownMessages(): void {
    assert.equal(isZipWorkerRequest({ type: ZIP_BUILD, requestId: 'a' }), true);
    assert.equal(isZipWorkerRequest({ type: ZIP_CANCEL, requestId: 'a' }), true);

    const rejected: unknown[] = [
        null,
        undefined,
        'zip:build',
        42,
        {},
        { type: ZIP_BUILD },
        { type: ZIP_CANCEL, requestId: '' },
        { type: 'zip:nope', requestId: 'a' },
    ];

    for (const value of rejected) {
        assert.equal(isZipWorkerRequest(value), false, `should reject ${JSON.stringify(value) ?? String(value)}`);
    }
}

// ---------------------------------------------------------------------------
// Run all
// ---------------------------------------------------------------------------

async function runAllTests(): Promise<void> {
    await testEmitsProgressForEveryFileThenDone();

    await testResultIsAReadableZip();
    await testWorkerOutputMatchesTheMainThreadArchive();
    await testResultBufferIsExactlySized();

    await testCancelBeforeAnyFileIsCollected();
    await testCancelAfterCollectionStopsBeforeArchiving();
    await testCancelledResponseCarriesNoArchive();

    await testInvalidTimestampIsReportedAsAnError();
    await testHandlerNeverThrows();

    testRequestGuardAcceptsOnlyKnownMessages();

    console.log('zip-worker-protocol.test.ts: all assertions passed');
}

runAllTests().catch((error) => {
    console.error(error);
    process.exit(1);
});
