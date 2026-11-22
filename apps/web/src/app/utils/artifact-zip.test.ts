/**
 * Tests for the downloadable run artifact bundle (#1120).
 *
 * The archive is read back with our own `readZipArchive`, so these assertions
 * only pass if `createZipArchive` produced a structurally valid ZIP with
 * matching CRCs. The previous version of this file depended on `jszip`, which
 * is not a dependency of this app, so it could never run.
 */

import * as assert from 'node:assert/strict';
import {
    BUNDLE_VERSION,
    buildRunArtifactZipFilename,
    buildRunBundleFiles,
    generateRunArtifactZip,
    type BundleManifest,
} from './artifact-zip';
import { crc32, readZipArchive } from './zip-writer';
import type { FuzzingRun, LedgerStateChange } from '../types';

const GENERATED_AT = new Date(Date.UTC(2026, 2, 1, 8, 0, 0));

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
    {
        id: 'entry-2',
        entryType: 'Account',
        changeType: 'updated',
        before: '{"balance":"1000"}',
        after: '{"balance":"900"}',
    },
];

function filesByPath(run: FuzzingRun, changes?: LedgerStateChange[]): Map<string, string> {
    const entries = buildRunBundleFiles(run, changes, { generatedAt: GENERATED_AT });
    return new Map(entries.map((entry) => [entry.path, entry.content]));
}

function hexCrc(content: string): string {
    return crc32(new TextEncoder().encode(content)).toString(16).padStart(8, '0');
}

function readManifest(files: Map<string, string>): BundleManifest {
    const raw = files.get('manifest.json');
    assert.ok(raw, 'manifest.json is missing from the bundle');
    return JSON.parse(raw) as BundleManifest;
}

// ---------------------------------------------------------------------------
// Bundle layout
// ---------------------------------------------------------------------------

function testBundleContainsExpectedFiles(): void {
    const files = filesByPath(mockRun, mockLedgerChanges);
    for (const expected of ['manifest.json', 'metadata.json', 'traces.json', 'fixtures.json', 'README.md']) {
        assert.ok(files.has(expected), `Missing expected file: ${expected}`);
    }
}

function testManifestIsListedFirst(): void {
    const entries = buildRunBundleFiles(mockRun, mockLedgerChanges, { generatedAt: GENERATED_AT });
    assert.equal(entries[0].path, 'manifest.json');
}

function testMetadataCarriesRunData(): void {
    const metadata = JSON.parse(filesByPath(mockRun, mockLedgerChanges).get('metadata.json')!);
    assert.equal(metadata.id, mockRun.id);
    assert.equal(metadata.status, mockRun.status);
    assert.equal(metadata.cpuInstructions, mockRun.cpuInstructions);
}

function testTracesCarryCrashDetail(): void {
    const traces = JSON.parse(filesByPath(mockRun, mockLedgerChanges).get('traces.json')!);
    assert.equal(traces.length, 1);
    assert.equal(traces[0].signature, 'sig-abc123');
    assert.equal(traces[0].replayAction, 'cargo test -- --nocapture');
}

function testFixturesCarryLedgerChanges(): void {
    const fixtures = JSON.parse(filesByPath(mockRun, mockLedgerChanges).get('fixtures.json')!);
    assert.equal(fixtures.length, mockLedgerChanges.length);
    assert.equal(fixtures[0].id, 'entry-1');
}

function testWorksWithoutLedgerChanges(): void {
    assert.deepEqual(JSON.parse(filesByPath(mockRun).get('fixtures.json')!), []);
}

function testPassingRunHasNoTraces(): void {
    const passing: FuzzingRun = { ...mockRun, status: 'completed', crashDetail: null };
    assert.deepEqual(JSON.parse(filesByPath(passing).get('traces.json')!), []);
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

function testManifestStructure(): void {
    const manifest = readManifest(filesByPath(mockRun, mockLedgerChanges));
    assert.equal(manifest.version, BUNDLE_VERSION);
    assert.equal(manifest.runId, mockRun.id);
    assert.equal(manifest.generatedAt, GENERATED_AT.toISOString());
    assert.ok(Array.isArray(manifest.files));
    assert.ok(manifest.files.length >= 3);
    assert.deepEqual(manifest.counts, { traces: 1, fixtures: 2 });
    assert.equal(manifest.run.status, 'failed');
    assert.equal(manifest.run.seedCount, 100);
}

function testManifestDoesNotListItself(): void {
    const manifest = readManifest(filesByPath(mockRun, mockLedgerChanges));
    assert.ok(!manifest.files.some((file) => file.path === 'manifest.json'));
}

function testManifestChecksumsMatchFileContents(): void {
    const files = filesByPath(mockRun, mockLedgerChanges);

    for (const entry of readManifest(files).files) {
        const content = files.get(entry.path);
        assert.ok(content !== undefined, `Manifest lists a file not in the bundle: ${entry.path}`);
        assert.equal(
            entry.bytes,
            new TextEncoder().encode(content).length,
            `byte count mismatch for ${entry.path}`,
        );
        assert.equal(entry.crc32, hexCrc(content), `crc mismatch for ${entry.path}`);
    }
}

function testManifestDescribesEveryFile(): void {
    for (const entry of readManifest(filesByPath(mockRun)).files) {
        assert.ok(entry.description.length > 0, `${entry.path} has no description`);
        assert.ok(entry.contentType.length > 0, `${entry.path} has no content type`);
    }
}

// ---------------------------------------------------------------------------
// Archive
// ---------------------------------------------------------------------------

async function testGeneratesAZipBlob(): Promise<void> {
    const blob = await generateRunArtifactZip(mockRun, mockLedgerChanges);
    assert.ok(blob instanceof Blob);
    assert.equal(blob.type, 'application/zip');
    assert.ok(blob.size > 0);
}

async function testArchiveIsAReadableZip(): Promise<void> {
    const blob = await generateRunArtifactZip(mockRun, mockLedgerChanges);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // "PK\x03\x04": the local file header signature every unzip tool looks for.
    assert.deepEqual([...bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);

    // readZipArchive verifies each entry's CRC against its header while parsing.
    const paths = readZipArchive(bytes).map((entry) => entry.path);
    assert.deepEqual(paths.sort(), [
        'README.md',
        'fixtures.json',
        'manifest.json',
        'metadata.json',
        'traces.json',
    ]);
}

async function testArchiveContentsMatchTheManifest(): Promise<void> {
    const blob = await generateRunArtifactZip(mockRun, mockLedgerChanges);
    const entries = readZipArchive(new Uint8Array(await blob.arrayBuffer()));
    const byPath = new Map(entries.map((entry) => [entry.path, entry.content]));
    const manifest = JSON.parse(byPath.get('manifest.json')!) as BundleManifest;

    for (const file of manifest.files) {
        const content = byPath.get(file.path);
        assert.ok(content !== undefined, `Archive is missing ${file.path}`);
        assert.equal(hexCrc(content), file.crc32);
    }
}

// ---------------------------------------------------------------------------
// Filename
// ---------------------------------------------------------------------------

function testFilenameIncludesRunIdAndDate(): void {
    assert.equal(
        buildRunArtifactZipFilename('run-1017', GENERATED_AT),
        'run-run-1017-artifacts-2026-03-01.zip',
    );
}

// ---------------------------------------------------------------------------
// Run all
// ---------------------------------------------------------------------------

async function runAllTests(): Promise<void> {
    testBundleContainsExpectedFiles();
    testManifestIsListedFirst();
    testMetadataCarriesRunData();
    testTracesCarryCrashDetail();
    testFixturesCarryLedgerChanges();
    testWorksWithoutLedgerChanges();
    testPassingRunHasNoTraces();

    testManifestStructure();
    testManifestDoesNotListItself();
    testManifestChecksumsMatchFileContents();
    testManifestDescribesEveryFile();

    await testGeneratesAZipBlob();
    await testArchiveIsAReadableZip();
    await testArchiveContentsMatchTheManifest();

    testFilenameIncludesRunIdAndDate();

    console.log('artifact-zip.test.ts: all assertions passed');
}

runAllTests().catch((error) => {
    console.error(error);
    process.exit(1);
});
