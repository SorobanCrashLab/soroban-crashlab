/**
 * Cross-artifact correlation model (#2304).
 */

export type ArtifactType = 'run' | 'trace' | 'log' | 'state_diff' | 'artifact' | 'reproducer' | 'issue' | 'incident';

export const ARTIFACT_TYPES: ArtifactType[] = ['run', 'trace', 'log', 'state_diff', 'artifact', 'reproducer', 'issue', 'incident'];

export interface CorrelationArtifact {
  id: string;
  type: ArtifactType;
  title: string;
  /** Epoch ms the artifact was produced. */
  timestamp: number;
  workspace: string;
  /** Metadata used for automatic correlation. All optional. */
  runId?: string;
  traceId?: string;
  signature?: string;
  commit?: string;
  env?: string;
  contentHash?: string;
  /** Restricted artifacts are redacted for viewers without access. */
  restricted?: boolean;
}

export type SignalKind = 'run_id' | 'trace_id' | 'content_hash' | 'signature' | 'commit_env' | 'time_proximity';

export interface Signal {
  kind: SignalKind;
  /** Contribution in 0..1 before noisy-OR combination. */
  weight: number;
  /** Human-readable explanation. */
  reason: string;
}

export type LinkStatus = 'suggested' | 'confirmed' | 'rejected';

export interface CorrelationLink {
  id: string;
  from: string;
  to: string;
  source: 'manual' | 'suggested';
  status: LinkStatus;
  confidence: number;
  rationale: string[];
  /** Signal kinds that produced a suggestion (used by the feedback loop). */
  signals: SignalKind[];
  createdBy: string;
  createdAt: string;
}

export interface AuditEntry {
  at: string;
  actor: string;
  action: 'link_created' | 'link_confirmed' | 'link_rejected' | 'link_removed' | 'set_created' | 'set_updated';
  linkId?: string;
  setId?: string;
}

export interface InvestigationSet {
  id: string;
  name: string;
  artifactIds: string[];
  linkIds: string[];
  tags: string[];
  createdBy: string;
  createdAt: string;
}

/** Stable pair key independent of direction. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
