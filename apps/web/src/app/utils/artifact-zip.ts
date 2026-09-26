/**
 * Downloadable run artifact bundle (#1120).
 *
 * Packages a run's metadata, crash traces and ledger fixtures into a real ZIP
 * archive with a manifest describing every file it contains, so the download
 * can be opened by any unzip tool and its contents verified offline.
 *
 * The previous implementation emitted a MIME-multipart document under a `.zip`
 * filename, which no archive tool could open; `zip-writer` now produces a
 * spec-conforming archive without adding a dependency.
 */

import type { FuzzingRun, LedgerStateChange } from '../types';
import { collectRunArtifacts } from './artifact-collection';
import { createZipArchive, crc32, type ZipEntry } from './zip-writer';

/** Bumped when the bundle layout changes in a way consumers must notice. */
export const BUNDLE_VERSION = '1.0';

/** One file recorded in the manifest, with enough detail to verify it. */
export interface BundleManifestFile {
    /** Path within the archive. */
    path: string;
    /** Byte length of the file's UTF-8 encoding. */
    bytes: number;
    /** CRC-32 of the file contents, lower-case hex, matching the ZIP header. */
    crc32: string;
    contentType: string;
    /** What the file holds, for whoever opens the bundle months later. */
    description: string;
}

/** `manifest.json` — the index of the bundle. */
export interface BundleManifest {
    version: string;
    generatedAt: string;
    runId: string;
    run: {
        status: string;
        area: string;
        severity: string;
        durationMs: number;
        seedCount: number;
    };
    counts: {
        traces: number;
        fixtures: number;
    };
    /** Every other file in the archive; the manifest does not list itself. */
    files: BundleManifestFile[];
}

export interface BuildBundleOptions {
    /**
     * Timestamp recorded in the manifest and in `metadata.downloadedAt`.
     * Defaults to now; pass a fixed date to get byte-identical output for the
     * same run, which is what makes the worker and main-thread paths
     * interchangeable.
     */
    generatedAt?: Date;
}

/** Describes each payload file, keeping the manifest self-documenting. */
const FILE_DESCRIPTIONS: Record<string, string> = {
    'metadata.json': 'Run identity, status and resource measurements.',
    'traces.json': 'Crash traces captured for the run, including replay commands.',
    'fixtures.json': 'Ledger state changes the run produced (before/after entries).',
    'README.md': 'How to read this bundle.',
};

function describeFile(path: string, content: string): BundleManifestFile {
    const bytes = new TextEncoder().encode(content);
    return {
        path,
        bytes: bytes.length,
        crc32: crc32(bytes).toString(16).padStart(8, '0'),
        contentType: path.endsWith('.md') ? 'text/markdown' : 'application/json',
        description: FILE_DESCRIPTIONS[path] ?? '',
    };
}

function buildReadme(run: FuzzingRun, generatedAt: Date): string {
    return [
        `# Artifact bundle — ${run.id}`,
        '',
        `Generated ${generatedAt.toISOString()} by Soroban CrashLab (bundle format v${BUNDLE_VERSION}).`,
        '',
        '## Contents',
        '',
        '- `manifest.json` — index of this bundle, with a CRC-32 and byte count per file.',
        '- `metadata.json` — run identity, status and resource measurements.',
        '- `traces.json` — crash traces, including the command to replay each failure.',
        '- `fixtures.json` — ledger entries the run created, updated or deleted.',
        '',
        '## Verifying',
        '',
        'Each `crc32` in the manifest matches the CRC recorded in the ZIP entry header,',
        'so `unzip -t` and the manifest agree on the contents.',
        '',
    ].join('\n');
}

/**
 * Builds every file in a run's bundle, manifest included.
 *
 * Exported separately from {@link generateRunArtifactZip} so the bundle layout
 * can be asserted without going through a Blob.
 */
export function buildRunBundleFiles(
    run: FuzzingRun,
    ledgerChanges?: LedgerStateChange[],
    options: BuildBundleOptions = {},
): ZipEntry[] {
    const generatedAt = options.generatedAt ?? new Date();
    const artifacts = collectRunArtifacts(run, ledgerChanges, { downloadedAt: generatedAt });

    const payloads: ZipEntry[] = [
        { path: 'metadata.json', content: JSON.stringify(artifacts.metadata, null, 2) },
        { path: 'traces.json', content: JSON.stringify(artifacts.traces, null, 2) },
        { path: 'fixtures.json', content: JSON.stringify(artifacts.fixtures, null, 2) },
        { path: 'README.md', content: buildReadme(run, generatedAt) },
    ];

    const manifest: BundleManifest = {
        version: BUNDLE_VERSION,
        generatedAt: generatedAt.toISOString(),
        runId: run.id,
        run: {
            status: run.status,
            area: run.area,
            severity: run.severity,
            durationMs: run.duration,
            seedCount: run.seedCount,
        },
        counts: {
            traces: artifacts.traces.length,
            fixtures: artifacts.fixtures.length,
        },
        files: payloads.map((file) => describeFile(file.path, file.content)),
    };

    // The manifest leads so `unzip -l` shows the index first.
    return [{ path: 'manifest.json', content: JSON.stringify(manifest, null, 2) }, ...payloads];
}

/** Filename for the downloaded archive, dated so repeat downloads stay distinct. */
export function buildRunArtifactZipFilename(runId: string, generatedAt: Date = new Date()): string {
    return `run-${runId}-artifacts-${generatedAt.toISOString().slice(0, 10)}.zip`;
}

/**
 * Produces the downloadable archive for a run.
 *
 * Async so callers can keep their loading state while the archive is built, and
 * so the signature survives a future move to a compressed writer.
 *
 * Builds on the calling thread: prefer {@link generateRunArtifactZipWithProgress}
 * from `artifact-zip-worker`, which hands the work to a Web Worker with a
 * fallback to this path for environments without one.
 */
export async function generateRunArtifactZip(
    run: FuzzingRun,
    ledgerChanges?: LedgerStateChange[],
): Promise<Blob> {
    const generatedAt = new Date();
    const files = buildRunBundleFiles(run, ledgerChanges, { generatedAt });
    const archive = createZipArchive(files, { modifiedAt: generatedAt });

    return new Blob([archive as BlobPart], { type: 'application/zip' });
}
