/**
 * Shared in-memory artifact store for Next.js API routes.
 * Production should replace this module with a filesystem or Rust-backed adapter.
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
}

const globalForArtifacts = globalThis as unknown as {
  crashlabArtifactStore?: Map<string, StoredArtifact>;
};

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
