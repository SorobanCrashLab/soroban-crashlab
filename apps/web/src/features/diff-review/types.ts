/*
 * Unified Diff Review Workbench — shared model (#1880).
 *
 * Review in CrashLab spans configs, blueprints, snapshots, traces, state and
 * reports. Historically every artifact had its own viewer, so navigation,
 * comments and approvals never lined up. These types describe one vocabulary
 * shared by every renderer and by the review workflow:
 *
 *   ArtifactDescriptor → what is being compared (kind picks the renderer)
 *   DiffRow / DiffHunk   → the renderer's output, one row per change
 *   ChangeSet            → the multi-artifact review unit
 *   ReviewComment        → an inline comment anchored to a row
 *   Approval / PolicyGate→ the decision mechanics and their gates
 *
 * Everything here is plain data so the model stays testable and serialisable.
 */

/** Which pluggable renderer handles an artifact. */
export type DiffArtifactKind = 'text' | 'structured' | 'snapshot' | 'semantic';

/** Classification of a single diff row. */
export type DiffChangeKind = 'added' | 'removed' | 'modified' | 'unchanged';

/** Coarse risk band derived from the impact summary. */
export type RiskBand = 'low' | 'medium' | 'high';

/** Role a reviewer plays on a change set. */
export type ReviewerRole = 'author' | 'reviewer' | 'approver';

/** Lifecycle of a review. */
export type ReviewState = 'draft' | 'in_review' | 'changes_requested' | 'approved';

/** External artifacts a change set links to. */
export type ChangeSetLinkKind = 'ci' | 'incident' | 'release' | 'canvas' | 'report';

/** How strongly a comment blocks approval. */
export type CommentSeverity = 'blocking' | 'advisory';

/** Filter used to narrow the artifact navigator. */
export type ArtifactStatusFilter = 'all' | 'changed' | 'commented' | 'unresolved';

/** CI status surfaced into the policy gates. */
export type CiStatus = 'passing' | 'failing' | 'pending';

/** Stable identity and renderer routing for one diffable artifact. */
export interface ArtifactDescriptor {
  id: string;
  label: string;
  /** Repository-relative path shown in the navigator. */
  path: string;
  kind: DiffArtifactKind;
  /** Human format hint, e.g. `toml`, `json`, `png`, `trace`. */
  format: string;
}

/** A single artifact's before/after pair inside a change set. */
export interface ArtifactChange {
  descriptor: ArtifactDescriptor;
  /** Previous revision as text, or null when the artifact is new. */
  before: string | null;
  /** New revision as text, or null when the artifact is deleted. */
  after: string | null;
  /** Team or handle accountable for the change. */
  owner: string;
}

/** A link out to a CI run, incident, release, canvas or report. */
export interface ChangeSetLink {
  id: string;
  kind: ChangeSetLinkKind;
  label: string;
  href: string;
}

/** One renderable row of a diff. Renderers produce these, the UI consumes them. */
export interface DiffRow {
  id: string;
  change: DiffChangeKind;
  /** Old-side text, empty for additions. */
  left: string;
  /** New-side text, empty for removals. */
  right: string;
  /** 1-based old-side line number, null when not applicable. */
  leftLine: number | null;
  /** 1-based new-side line number, null when not applicable. */
  rightLine: number | null;
  /** Nesting depth for structured rows. */
  depth: number;
  /** Group heading, e.g. a contract id or top-level JSON key. */
  group: string | null;
  /** Stable anchor inline comments attach to. */
  anchor: string;
  /** Optional annotation, e.g. a numeric delta. */
  note: string | null;
}

/** A contiguous group of related rows. */
export interface DiffHunk {
  id: string;
  header: string;
  rows: DiffRow[];
}

/** Aggregate counts for one artifact or a whole change set. */
export interface DiffSummary {
  added: number;
  removed: number;
  modified: number;
  unchanged: number;
  total: number;
}

/** Output of a renderer for one artifact. */
export interface RenderedDiff {
  artifactId: string;
  kind: DiffArtifactKind;
  /** Label of the renderer that produced this output. */
  rendererLabel: string;
  hunks: DiffHunk[];
  summary: DiffSummary;
  /** True when both revisions carry no comparable content. */
  isEmpty: boolean;
  /** Non-fatal problems, e.g. a truncated file or an unconvertible value. */
  notices: string[];
}

/** Input handed to a pluggable renderer. */
export interface DiffRenderInput {
  descriptor: ArtifactDescriptor;
  before: string | null;
  after: string | null;
  /** Context rows to keep around each change group. */
  context: number;
}

/** A pluggable renderer. Registering one per kind is what makes diffs uniform. */
export interface DiffRenderer {
  kind: DiffArtifactKind;
  label: string;
  description: string;
  render(input: DiffRenderInput): RenderedDiff;
}

/** An inline review comment anchored to a diff row. */
export interface ReviewComment {
  id: string;
  artifactId: string;
  anchor: string;
  author: string;
  body: string;
  severity: CommentSeverity;
  /** Suspected replacement, surfaced as a suggestion when present. */
  suggestion: string | null;
  createdAt: string;
  resolved: boolean;
}

/** A person who can comment on or approve a change set. */
export interface Reviewer {
  id: string;
  name: string;
  role: ReviewerRole;
}

/** A recorded review decision. */
export interface Approval {
  reviewerId: string;
  decision: 'approved' | 'changes_requested';
  note: string | null;
  at: string;
}

/** A policy rule evaluated before a change set can be approved. */
export interface PolicyGate {
  id: string;
  label: string;
  description: string;
  severity: CommentSeverity;
}

/** The outcome of evaluating one policy gate. */
export interface PolicyGateResult {
  gateId: string;
  label: string;
  severity: CommentSeverity;
  passed: boolean;
  detail: string;
}

/** An artifact that dominates the impact summary. */
export interface ImpactHotspot {
  artifactId: string;
  label: string;
  weight: number;
  reason: string;
}

/** Change-set-wide impact numbers used by filters and gates. */
export interface ImpactSummary {
  filesChanged: number;
  additions: number;
  deletions: number;
  modifications: number;
  byKind: Record<DiffArtifactKind, number>;
  riskScore: number;
  riskBand: RiskBand;
  hotspots: ImpactHotspot[];
}

/** The multi-artifact review unit shown by the workbench. */
export interface ChangeSet {
  id: string;
  title: string;
  description: string;
  author: string;
  createdAt: string;
  links: ChangeSetLink[];
  artifacts: ArtifactChange[];
  reviewers: Reviewer[];
  comments: ReviewComment[];
  approvals: Approval[];
  state: ReviewState;
  requiredApprovals: number;
  ciStatus: CiStatus;
}
