/**
 * Artifact Storage & Provenance Manager model (#2342).
 *
 * One record shape for artifacts on every backend (local filesystem, S3,
 * MinIO), carrying integrity (#023), provenance, lineage and governance
 * state. Wire types are shared by the API routes and the client so a rename
 * fails at compile time on both sides.
 */

export const STORAGE_BACKENDS = ['local', 's3', 'minio'] as const;
export type StorageBackend = (typeof STORAGE_BACKENDS)[number];

export const ARTIFACT_TYPES = ['bundle', 'log', 'corpus', 'report', 'reproducer', 'trace'] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export type Sensitivity = 'public' | 'internal' | 'restricted';
export type ScanStatus = 'clean' | 'suspicious' | 'infected' | 'pending' | 'error';
export type SignatureStatus = 'verified' | 'unsigned' | 'invalid' | 'expired';
export type LineageRelation = 'derived-from' | 'minimized-from' | 'reproduces' | 'summarizes';

/** Where a record came from: real storage, or the seeded demo catalog. */
export type CatalogSource = 'storage' | 'demo';

export interface ManagedArtifact {
  id: string;
  name: string;
  backend: StorageBackend;
  bucket: string;
  key: string;
  type: ArtifactType;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  createdBy: { kind: 'user' | 'system'; id: string };
  campaignId: string | null;
  runId: string | null;
  crashId: string | null;
  reportId: string | null;
  tags: string[];
  sensitivity: Sensitivity;
  checksums: { sha256: string | null };
  /** Result of the last re-hash against stored bytes; null when never verified. */
  checksumMatches: boolean | null;
  checksumVerifiedAt: string | null;
  signature: { status: SignatureStatus; keyId: string | null; signedAt: string | null };
  scan: { status: ScanStatus; engine: string | null; scannedAt: string | null; findings: string[] };
  quarantine: { active: boolean; reason: string | null; since: string | null };
  provenance: {
    builder: string;
    slsaLevel: 0 | 1 | 2 | 3;
    sourceCommit: string | null;
    attestationUrl: string | null;
    sbomUrl: string | null;
  };
  /** Retention class; defaults to the artifact type. */
  retentionClass: ArtifactType;
  /** Parents of this artifact. */
  lineage: Array<{ artifactId: string; relation: LineageRelation }>;
  source: CatalogSource;
  /** Set when non-maintainer metadata was masked. */
  redacted?: boolean;
}

export interface BackendStatus {
  backend: StorageBackend;
  label: string;
  configured: boolean;
  health: 'ok' | 'degraded' | 'unavailable';
  detail: string;
  artifactCount: number;
  bytes: number;
}

export interface RetentionPolicy {
  artifactType: ArtifactType;
  maxAgeDays: number;
  action: 'delete' | 'archive';
  /** Newest N per campaign are always kept, whatever their age. */
  keepMinimum: number;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string;
}

export type HoldKind = 'legal' | 'compliance' | 'investigation';

export interface HoldScope {
  artifactIds?: string[];
  campaignId?: string;
  runId?: string;
}

export interface LegalHold {
  id: string;
  name: string;
  kind: HoldKind;
  reason: string;
  scope: HoldScope;
  createdBy: string;
  createdAt: string;
  expiresAt: string | null;
  releasedAt: string | null;
  releasedBy: string | null;
  releaseJustification: string | null;
}

export type DeletionStatus = 'pending' | 'approved' | 'rejected' | 'executed';

export interface DeletionRequest {
  id: string;
  artifactIds: string[];
  reason: string;
  source: 'retention' | 'manual';
  requestedBy: string;
  requestedAt: string;
  status: DeletionStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface ArtifactAuditRecord {
  sequence: number;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
}

export function isArtifactType(value: unknown): value is ArtifactType {
  return typeof value === 'string' && (ARTIFACT_TYPES as readonly string[]).includes(value);
}

export function isBackend(value: unknown): value is StorageBackend {
  return typeof value === 'string' && (STORAGE_BACKENDS as readonly string[]).includes(value);
}
