/**
 * Server-only state and helpers for the artifact manager routes (#2342).
 *
 * The catalog merges real files from the artifact repository with the
 * deterministic demo catalog. Governance state (policies, holds, deletion
 * queue, tags) lives in a process-local store behind a narrow interface, in
 * the same style as `reports-store`, so a persistent adapter can replace it
 * without touching the handlers. Every governance mutation is also written to
 * the append-only audit log (#1431).
 */

import { createHash, randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { recordAuditEvent, type AuditAction } from '@/lib/audit';
import { checkRbacPermission, describePrincipal } from '@/lib/rbac';
import { selectArtifactRepository } from '@/lib/storage/artifact-repository';
import { readS3Config } from '@/lib/storage/env-config';
import { presignUrl, toAmzDate } from '@/lib/storage/sigv4';
import { logger } from '@/lib/logger';
import { buildDemoCatalog, localArtifactToManaged } from './catalog';
import { DEFAULT_POLICIES } from './governance';
import { assessIntegrity } from './integrity';
import type {
  ArtifactAuditRecord,
  BackendStatus,
  DeletionRequest,
  LegalHold,
  ManagedArtifact,
  RetentionPolicy,
  StorageBackend,
} from './model';
import { permissionsForRole, projectArtifact, type ArtifactPermissions, type ArtifactRole } from './permissions';

export interface ArtifactViewer {
  role: ArtifactRole;
  subject: string;
  permissions: ArtifactPermissions;
}

export type ArtifactAuthorization = { ok: true; viewer: ArtifactViewer } | { ok: false; response: NextResponse };

export async function authorizeArtifactRequest(request: NextRequest): Promise<ArtifactAuthorization> {
  const denial = await checkRbacPermission(request);
  if (denial) return { ok: false, response: denial };
  const { principal, role } = await describePrincipal(request);
  const artifactRole: ArtifactRole = !principal.authenticated ? 'anonymous' : role === 'maintainer' ? 'maintainer' : 'analyst';
  return { ok: true, viewer: { role: artifactRole, subject: principal.subject, permissions: permissionsForRole(artifactRole) } };
}

class ArtifactManagerStore {
  private readonly demo = new Map(buildDemoCatalog().map((artifact) => [artifact.id, artifact]));
  /** Tag/class overrides for real artifacts, keyed by managed id. */
  private readonly overrides = new Map<string, Pick<ManagedArtifact, 'tags' | 'retentionClass'>>();
  /** Verification results for real artifacts. */
  private readonly verified = new Map<string, Pick<ManagedArtifact, 'checksums' | 'checksumMatches' | 'checksumVerifiedAt'>>();
  policies: RetentionPolicy[] = DEFAULT_POLICIES.map((policy) => ({ ...policy }));
  holds: LegalHold[] = [
    {
      id: 'hold-seed-1',
      name: 'INC-2041 investigation',
      kind: 'investigation',
      reason: 'Preserve replay regression artifacts while INC-2041 is open.',
      scope: { campaignId: 'camp-replay-regression' },
      createdBy: 'github:oncall',
      createdAt: '2026-11-10T09:00:00.000Z',
      expiresAt: null,
      releasedAt: null,
      releasedBy: null,
      releaseJustification: null,
    },
  ];
  deletions: DeletionRequest[] = [];
  readonly audit: ArtifactAuditRecord[] = [];

  async catalog(): Promise<ManagedArtifact[]> {
    let local: ManagedArtifact[] = [];
    try {
      local = (await selectArtifactRepository().list()).map((metadata) => {
        const managed = localArtifactToManaged(metadata);
        return { ...managed, ...this.overrides.get(managed.id), ...this.verified.get(managed.id) };
      });
    } catch (error) {
      logger.warn('artifact manager: local repository unavailable', { error: (error as Error).message });
    }
    const deleted = new Set(this.deletions.filter((request) => request.status === 'executed').flatMap((request) => request.artifactIds));
    return [...local, ...this.demo.values()].filter((artifact) => !deleted.has(artifact.id));
  }

  async get(id: string): Promise<ManagedArtifact | null> {
    return (await this.catalog()).find((artifact) => artifact.id === id) ?? null;
  }

  update(artifact: ManagedArtifact): void {
    if (artifact.source === 'demo') this.demo.set(artifact.id, artifact);
    else this.overrides.set(artifact.id, { tags: artifact.tags, retentionClass: artifact.retentionClass });
  }

  /** Re-hash stored bytes of a real artifact (#023 checksum verification). */
  async verifyLocal(artifact: ManagedArtifact): Promise<ManagedArtifact> {
    if (artifact.source !== 'storage' || artifact.backend !== 'local') return artifact;
    const stored = await selectArtifactRepository().get(artifact.key);
    if (!stored) return artifact;
    const digest = createHash('sha256').update(stored.buffer).digest('hex');
    const previous = this.verified.get(artifact.id)?.checksums.sha256 ?? null;
    const result = {
      checksums: { sha256: previous ?? digest },
      checksumMatches: previous === null ? true : previous === digest,
      checksumVerifiedAt: new Date().toISOString(),
    };
    this.verified.set(artifact.id, result);
    return { ...artifact, ...result };
  }

  record(actor: string, action: string, target: string, detail: string, auditAction?: AuditAction, metadata?: Record<string, unknown>): void {
    this.audit.unshift({ sequence: this.audit.length + 1, at: new Date().toISOString(), actor, action, target, detail });
    if (this.audit.length > 500) this.audit.length = 500;
    if (auditAction) recordAuditEvent({ action: auditAction, target, actor, metadata: { detail, ...metadata } });
  }
}

let store: ArtifactManagerStore | null = null;

export function getArtifactStore(): ArtifactManagerStore {
  store ??= new ArtifactManagerStore();
  return store;
}

/** Test seam. */
export function resetArtifactStore(): void {
  store = null;
}

export function newId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export function projectCatalog(catalog: readonly ManagedArtifact[], role: ArtifactRole): ManagedArtifact[] {
  return catalog.flatMap((artifact) => {
    const projected = projectArtifact(artifact, role);
    return projected ? [projected] : [];
  });
}

/**
 * True only when the endpoint's *hostname* is `amazonaws.com` or a subdomain
 * of it. A substring test would also accept `amazonaws.com.evil.example`.
 */
export function isAwsEndpoint(endpoint: string): boolean {
  try {
    const host = new URL(endpoint).hostname.toLowerCase();
    return host === 'amazonaws.com' || host.endsWith('.amazonaws.com');
  } catch {
    return false;
  }
}

export function backendStatuses(catalog: readonly ManagedArtifact[], env: Record<string, string | undefined> = process.env): BackendStatus[] {
  const s3 = readS3Config(env);
  const isAws = s3.enabled && isAwsEndpoint(s3.config.endpoint);
  const configured: Record<StorageBackend, boolean> = {
    local: true,
    s3: s3.enabled && isAws,
    minio: s3.enabled && !isAws,
  };
  const labels: Record<StorageBackend, string> = { local: 'Local filesystem', s3: 'Amazon S3', minio: 'MinIO (S3-compatible)' };
  return (['local', 's3', 'minio'] as const).map((backend) => {
    const items = catalog.filter((artifact) => artifact.backend === backend);
    const failing = items.filter((artifact) => assessIntegrity(artifact).level === 'blocked').length;
    const ratio = items.length > 0 ? failing / items.length : 0;
    const health: BackendStatus['health'] = !configured[backend] ? 'unavailable' : ratio > 0.05 ? 'degraded' : 'ok';
    const detail = !configured[backend]
      ? s3.enabled
        ? `Not the configured object store; entries shown are demo catalog records.`
        : `Not configured (${'missing' in s3 && s3.missing ? s3.missing.join(', ') : 'set CRASHLAB_STORAGE_DRIVER=s3'}); entries shown are demo catalog records.`
      : ratio > 0.05
        ? `${failing} of ${items.length} artifacts fail integrity checks.`
        : 'Healthy.';
    return {
      backend,
      label: labels[backend],
      configured: configured[backend],
      health,
      detail,
      artifactCount: items.length,
      bytes: items.reduce((sum, artifact) => sum + artifact.sizeBytes, 0),
    };
  });
}

export const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Time-bounded download link. Object-store artifacts get a SigV4 presigned
 * URL (the secret never leaves the server); local artifacts go through the
 * existing `/api/artifacts/[id]` route.
 */
export function downloadLink(
  artifact: ManagedArtifact,
  now: Date = new Date(),
  env: Record<string, string | undefined> = process.env,
): { href: string; method: 'proxy' | 'presigned'; expiresAt: string | null } | null {
  if (artifact.source !== 'storage') return null;
  if (artifact.backend === 'local') {
    return { href: `/api/artifacts/${encodeURIComponent(artifact.key)}`, method: 'proxy', expiresAt: null };
  }
  const s3 = readS3Config(env);
  if (!s3.enabled) return null;
  const href = presignUrl(
    {
      method: 'GET',
      endpoint: s3.config.endpoint,
      path: `/${encodeURIComponent(s3.config.bucket)}/${artifact.key.split('/').map(encodeURIComponent).join('/')}`,
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
      query: { 'response-content-disposition': `attachment; filename="${artifact.name.replace(/["\\]/g, '_')}"` },
    },
    s3.config.credentials,
    { amzDate: toAmzDate(now), region: s3.config.region, service: 's3' },
  );
  return { href, method: 'presigned', expiresAt: new Date(now.getTime() + SIGNED_URL_TTL_SECONDS * 1000).toISOString() };
}

export function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
