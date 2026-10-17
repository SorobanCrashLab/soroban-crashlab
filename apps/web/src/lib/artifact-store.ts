/**
 * Shared in-memory artifact store for Next.js API routes.
 * Production should replace this module with a filesystem or Rust-backed adapter.
 * Issue #1843: Added content checksumming for corruption detection
 */
import { createHash } from "crypto";
 *
 * Tenant-scoped (#1894): every artifact lives under
 * `org/<org>/project/<project>/artifacts/<id>`, and every accessor takes the
 * caller's `TenantScope`. There is no unscoped accessor.
 */
import { ScopedRepository, createMapBackend } from './tenancy/scoped-repository';
import type { TenantScope } from './tenancy/tenant-scope';

export interface StoredArtifact {
  id: string;
  name: string;
  createdAt: string;
  sizeBytes: number;
  buffer: Buffer;
  checksum: string; // SHA-256 hash of content
}

export interface ArtifactCorruptionError extends Error {
  code: "ARTIFACT_CORRUPT";
  artifactId: string;
  expectedChecksum: string;
  actualChecksum: string;
}

const globalForArtifacts = globalThis as unknown as {
  crashlabArtifactStore?: Map<string, StoredArtifact>;
};

export const artifactStore: Map<string, StoredArtifact> =
  globalForArtifacts.crashlabArtifactStore ?? new Map<string, StoredArtifact>();
const artifactBackend: Map<string, StoredArtifact> =
  globalForArtifacts.crashlabArtifactStore ??
  new Map<string, StoredArtifact>();

if (process.env.NODE_ENV !== "production") {
  globalForArtifacts.crashlabArtifactStore = artifactBackend;
}

const artifacts = new ScopedRepository<Omit<StoredArtifact, "id">>({
  collection: "art",
  backend: createMapBackend(artifactBackend),
});

export function putArtifact(
  scope: TenantScope,
  artifact: { name: string; buffer: Buffer; createdAt?: string },
): StoredArtifact {
  return artifacts.create(scope, {
    name: artifact.name,
    buffer: artifact.buffer,
    sizeBytes: artifact.buffer.byteLength,
    createdAt: artifact.createdAt ?? new Date().toISOString(),
  });
}

export function getArtifact(scope: TenantScope, id: string): StoredArtifact | null {
  return artifacts.get(scope, id);
}

export function deleteArtifact(scope: TenantScope, id: string): boolean {
  return artifacts.delete(scope, id);
}

export function listArtifactMetadata(scope: TenantScope): Array<{
  id: string;
  name: string;
  createdAt: string;
  sizeBytes: number;
}> {
  return artifacts
    .list(scope)
    .map(({ id, name, createdAt, sizeBytes }) => ({
      id,
      name,
      createdAt,
      sizeBytes,
    }))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

/**
 * Compute SHA-256 checksum of artifact content
 */
export function computeChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Verify artifact integrity by comparing stored checksum with computed checksum
 */
export function verifyArtifactIntegrity(artifact: StoredArtifact): boolean {
  const actualChecksum = computeChecksum(artifact.buffer);
  return actualChecksum === artifact.checksum;
}

/**
 * Read artifact with integrity verification
 * Throws ArtifactCorruptionError if checksum mismatch detected
 */
export function getArtifactWithVerification(id: string): StoredArtifact {
  const artifact = artifactStore.get(id);

  if (!artifact) {
    throw new Error(`Artifact ${id} not found`);
  }

  const actualChecksum = computeChecksum(artifact.buffer);

  if (actualChecksum !== artifact.checksum) {
    const error = new Error(
      `Artifact ${id} corruption detected: checksum mismatch`,
    ) as ArtifactCorruptionError;
    error.code = "ARTIFACT_CORRUPT";
    error.artifactId = id;
    error.expectedChecksum = artifact.checksum;
    error.actualChecksum = actualChecksum;

    // Quarantine corrupted artifact
    console.error(
      `[artifact-store] Corruption detected for ${id}, quarantining`,
    );
    artifactStore.delete(id);

    throw error;
  }

  return artifact;
}

/**
 * Store artifact with automatic checksumming
 */
export function storeArtifact(
  id: string,
  name: string,
  buffer: Buffer,
): StoredArtifact {
  const checksum = computeChecksum(buffer);
  const artifact: StoredArtifact = {
    id,
    name,
    createdAt: new Date().toISOString(),
    sizeBytes: buffer.length,
    buffer,
    checksum,
  };

  artifactStore.set(id, artifact);
  console.log(
    `[artifact-store] Stored ${id} with checksum ${checksum.slice(0, 8)}...`,
  );

  return artifact;
}

/**
 * Sweep all artifacts and verify integrity
 * Returns report of corrupted artifacts
 */
export interface IntegrityReport {
  total: number;
  verified: number;
  corrupted: string[];
}

export function sweepArtifactIntegrity(sample?: boolean): IntegrityReport {
  const artifacts = Array.from(artifactStore.values());
  const toCheck = sample
    ? artifacts.filter((_, idx) => idx % 10 === 0) // Sample 10%
    : artifacts;

  const report: IntegrityReport = {
    total: toCheck.length,
    verified: 0,
    corrupted: [],
  };

  for (const artifact of toCheck) {
    if (verifyArtifactIntegrity(artifact)) {
      report.verified++;
    } else {
      report.corrupted.push(artifact.id);
      // Quarantine corrupted artifact
      artifactStore.delete(artifact.id);
    }
  }

  return report;
}
