/**
 * Catalog sources for the artifact manager (#2342).
 *
 * - `localArtifactToManaged` maps files from the existing artifact
 *   repository (`/api/artifacts`) into the managed shape, so real uploads
 *   appear in the explorer next to everything else.
 * - `buildDemoCatalog` seeds a deterministic catalog across all three
 *   backends with realistic lineage and integrity states, flagged
 *   `source: 'demo'` so the UI never presents it as stored data.
 */

import type { ArtifactMetadata } from '@/lib/artifact-fs-adapter';
import {
  ARTIFACT_TYPES,
  type ArtifactType,
  type ManagedArtifact,
  type ScanStatus,
  type Sensitivity,
  type SignatureStatus,
  type StorageBackend,
} from './model';

export const DEMO_ANCHOR = Date.parse('2026-11-20T00:00:00Z');
const DAY = 86_400_000;

const CONTENT_TYPES: Record<ArtifactType, string> = {
  bundle: 'application/zip',
  log: 'application/x-ndjson',
  corpus: 'application/octet-stream',
  report: 'text/markdown',
  reproducer: 'application/json',
  trace: 'application/json',
};

const EXTENSIONS: Record<ArtifactType, string> = {
  bundle: 'zip',
  log: 'ndjson',
  corpus: 'bin',
  report: 'md',
  reproducer: 'json',
  trace: 'json',
};

const CAMPAIGNS = ['camp-auth-2026', 'camp-token-fuzz', 'camp-replay-regression'];
const BACKENDS: StorageBackend[] = ['local', 's3', 'minio'];
const BUCKETS: Record<StorageBackend, string> = { local: 'artifacts', s3: 'crashlab-artifacts', minio: 'crashlab-ci' };

function hash(index: number, salt: number): number {
  let value = (index ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function fakeSha(index: number): string {
  let out = '';
  for (let part = 0; part < 8; part += 1) out += hash(index, 0x51a + part).toString(16).padStart(8, '0');
  return out;
}

/**
 * Each "chain" is one investigation: corpus → bundle → reproducer → report,
 * plus a log and a trace from the same run. Chains rotate across backends
 * and campaigns so every filter combination has results.
 */
export function buildDemoCatalog(chains = 30): ManagedArtifact[] {
  const out: ManagedArtifact[] = [];
  for (let chain = 0; chain < chains; chain += 1) {
    const runId = `run-${1000 + (chain % 25)}`;
    const campaignId = CAMPAIGNS[chain % CAMPAIGNS.length];
    const crashId = chain % 3 === 0 ? null : `crash-${runId}`;
    const reportId = `report-${chain + 1}`;
    const baseAge = (chain * 9) % 400; // days before the anchor: spans >1 year
    const ids: Partial<Record<ArtifactType, string>> = {};
    const order: ArtifactType[] = ['corpus', 'bundle', 'reproducer', 'report', 'log', 'trace'];
    order.forEach((type, step) => {
      const index = chain * ARTIFACT_TYPES.length + step;
      const backend = BACKENDS[(chain + step) % BACKENDS.length];
      const id = `art-${String(index + 1).padStart(4, '0')}`;
      ids[type] = id;
      const roll = hash(index, 0xa11) % 100;
      const scan: ScanStatus =
        roll < 2 ? 'infected' : roll < 6 ? 'suspicious' : roll < 9 ? 'pending' : roll < 10 ? 'error' : 'clean';
      const sigRoll = hash(index, 0x5161) % 100;
      const signature: SignatureStatus =
        type === 'log' ? 'unsigned' : sigRoll < 4 ? 'invalid' : sigRoll < 8 ? 'expired' : sigRoll < 20 ? 'unsigned' : 'verified';
      const checksumRoll = hash(index, 0xc5) % 100;
      const sensitivity: Sensitivity =
        type === 'reproducer' && chain % 5 === 0 ? 'restricted' : type === 'report' && chain % 4 === 0 ? 'public' : 'internal';
      const createdAt = new Date(DEMO_ANCHOR - (baseAge + step * 0.25) * DAY).toISOString();
      const parents: ManagedArtifact['lineage'] =
        type === 'bundle' && ids.corpus
          ? [{ artifactId: ids.corpus, relation: 'derived-from' }]
          : type === 'reproducer' && ids.bundle
            ? [{ artifactId: ids.bundle, relation: 'minimized-from' }]
            : type === 'report' && ids.reproducer
              ? [
                  { artifactId: ids.reproducer, relation: 'summarizes' },
                  ...(ids.bundle ? [{ artifactId: ids.bundle, relation: 'summarizes' as const }] : []),
                ]
              : type === 'trace' && ids.reproducer
                ? [{ artifactId: ids.reproducer, relation: 'reproduces' }]
                : [];
      const slsa = (hash(index, 0x515a) % 4) as 0 | 1 | 2 | 3;
      out.push({
        id,
        name: `${type}-${runId}-${chain + 1}.${EXTENSIONS[type]}`,
        backend,
        bucket: BUCKETS[backend],
        key: `${campaignId}/${runId}/${type}/${id}.${EXTENSIONS[type]}`,
        type,
        contentType: CONTENT_TYPES[type],
        sizeBytes: 1_024 * (1 + (hash(index, 0x5e) % (type === 'corpus' ? 90_000 : 4_000))),
        createdAt,
        createdBy: type === 'report' ? { kind: 'user', id: `github:maintainer-${chain % 4}` } : { kind: 'system', id: 'crashlab-runner' },
        campaignId,
        runId,
        crashId: type === 'corpus' ? null : crashId,
        reportId: type === 'report' ? reportId : null,
        tags: [
          ...(chain % 2 === 0 ? ['nightly'] : ['pr']),
          ...(crashId ? ['crash'] : []),
          ...(type === 'reproducer' ? ['golden'] : []),
        ],
        sensitivity,
        checksums: { sha256: checksumRoll < 3 ? null : fakeSha(index) },
        checksumMatches: checksumRoll < 3 ? null : checksumRoll < 5 ? false : checksumRoll < 70 ? true : null,
        checksumVerifiedAt: checksumRoll >= 5 && checksumRoll < 70 ? createdAt : null,
        signature: {
          status: signature,
          keyId: signature === 'unsigned' ? null : `crashlab-signing-${2024 + (chain % 3)}`,
          signedAt: signature === 'unsigned' ? null : createdAt,
        },
        scan: {
          status: scan,
          engine: scan === 'pending' ? null : 'clamav+yara',
          scannedAt: scan === 'pending' ? null : createdAt,
          findings: scan === 'infected' ? ['YARA:Suspicious_WASM_Loader'] : scan === 'suspicious' ? ['heuristic:high-entropy-section'] : [],
        },
        quarantine:
          scan === 'infected'
            ? { active: true, reason: 'Malware scan reported an infection.', since: createdAt }
            : { active: false, reason: null, since: null },
        provenance: {
          builder: backend === 'local' ? 'local-runner' : 'github-actions',
          slsaLevel: slsa,
          sourceCommit: fakeSha(index).slice(0, 12),
          attestationUrl: slsa >= 2 ? `https://github.com/SorobanCrashLab/soroban-crashlab/attestations/${id}` : null,
          sbomUrl: type === 'bundle' ? `https://github.com/SorobanCrashLab/soroban-crashlab/sbom/${id}.spdx.json` : null,
        },
        retentionClass: type,
        lineage: parents,
        source: 'demo',
      });
    });
  }
  return out;
}

const LOCAL_TYPES: Array<[RegExp, ArtifactType]> = [
  [/\.(zip|tar|tgz|gz)$/i, 'bundle'],
  [/\.(ndjson|log|txt)$/i, 'log'],
  [/\.(md|pdf|html)$/i, 'report'],
  [/repro|\.json$/i, 'reproducer'],
];

const LOCAL_CONTENT: Array<[RegExp, string]> = [
  [/\.json$/i, 'application/json'],
  [/\.ndjson$/i, 'application/x-ndjson'],
  [/\.(log|txt)$/i, 'text/plain'],
  [/\.md$/i, 'text/markdown'],
  [/\.html?$/i, 'text/html'],
  [/\.zip$/i, 'application/zip'],
];

/** Real files from the artifact repository. Integrity is unknown until verified. */
export function localArtifactToManaged(metadata: ArtifactMetadata): ManagedArtifact {
  const type = LOCAL_TYPES.find(([pattern]) => pattern.test(metadata.name))?.[1] ?? 'corpus';
  return {
    id: `local:${metadata.id}`,
    name: metadata.name,
    backend: 'local',
    bucket: 'artifacts',
    key: metadata.id,
    type,
    contentType: LOCAL_CONTENT.find(([pattern]) => pattern.test(metadata.name))?.[1] ?? 'application/octet-stream',
    sizeBytes: metadata.sizeBytes,
    createdAt: metadata.createdAt,
    createdBy: { kind: 'user', id: 'upload' },
    campaignId: null,
    runId: null,
    crashId: null,
    reportId: null,
    tags: ['uploaded'],
    sensitivity: 'internal',
    checksums: { sha256: null },
    checksumMatches: null,
    checksumVerifiedAt: null,
    signature: { status: 'unsigned', keyId: null, signedAt: null },
    scan: { status: 'pending', engine: null, scannedAt: null, findings: [] },
    quarantine: { active: false, reason: null, since: null },
    provenance: { builder: 'manual-upload', slsaLevel: 0, sourceCommit: null, attestationUrl: null, sbomUrl: null },
    retentionClass: type,
    lineage: [],
    source: 'storage',
  };
}
