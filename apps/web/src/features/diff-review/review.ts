/*
 * Review workflow for the Unified Diff Review Workbench (#1880).
 *
 * Pure functions over a `ChangeSet`: counting approvals, evaluating policy
 * gates, building the impact summary and applying review mutations. Keeping the
 * mechanics here (rather than in the component) means the same rules drive the
 * UI, and a future CI or API surface can reuse them unchanged.
 */

import type {
  Approval,
  ArtifactChange,
  ArtifactStatusFilter,
  ChangeSet,
  CommentSeverity,
  DiffArtifactKind,
  DiffSummary,
  ImpactHotspot,
  ImpactSummary,
  PolicyGate,
  PolicyGateResult,
  RenderedDiff,
  ReviewComment,
  ReviewState,
  RiskBand,
  Reviewer,
} from './types';

/** Change count in one artifact above which it becomes an impact hotspot. */
export const HOTSPOT_THRESHOLD = 3;

const KIND_WEIGHT: Record<DiffArtifactKind, number> = {
  text: 1,
  structured: 1.2,
  snapshot: 1.5,
  semantic: 1.4,
};

/** Policy gates evaluated before a change set may be approved. */
export const DEFAULT_POLICY_GATES: PolicyGate[] = [
  {
    id: 'gate-blocking-comments',
    label: 'Blocking comments resolved',
    description: 'Every blocking review comment must be resolved before approval.',
    severity: 'blocking',
  },
  {
    id: 'gate-approvals',
    label: 'Required approvals collected',
    description: 'The change set needs the configured number of approving reviews.',
    severity: 'blocking',
  },
  {
    id: 'gate-ci',
    label: 'CI checks green',
    description: 'The latest CI run for this change set must be passing.',
    severity: 'blocking',
  },
  {
    id: 'gate-risk',
    label: 'High-risk artifacts double-reviewed',
    description: 'Change sets in the high risk band need two approving reviews.',
    severity: 'advisory',
  },
];

export function emptySummary(): DiffSummary {
  return { added: 0, removed: 0, modified: 0, unchanged: 0, total: 0 };
}

/** Sums per-artifact summaries into one change-set summary. */
export function combineSummaries(summaries: readonly DiffSummary[]): DiffSummary {
  const total = emptySummary();
  for (const summary of summaries) {
    total.added += summary.added;
    total.removed += summary.removed;
    total.modified += summary.modified;
    total.unchanged += summary.unchanged;
    total.total += summary.total;
  }
  return total;
}

/** Latest decision per reviewer, plus the configured requirement. */
export function countApprovals(changeSet: ChangeSet): {
  approved: number;
  changesRequested: number;
  required: number;
} {
  const latest = new Map<string, Approval>();
  for (const approval of changeSet.approvals) latest.set(approval.reviewerId, approval);

  let approved = 0;
  let changesRequested = 0;
  for (const approval of latest.values()) {
    if (approval.decision === 'approved') approved += 1;
    else changesRequested += 1;
  }
  return { approved, changesRequested, required: changeSet.requiredApprovals };
}

export function commentsForArtifact(comments: readonly ReviewComment[], artifactId: string): ReviewComment[] {
  return comments.filter((comment) => comment.artifactId === artifactId);
}

/** Indexes an artifact's comments by anchor for inline rendering. */
export function commentsByAnchor(
  comments: readonly ReviewComment[],
  artifactId: string,
): Map<string, ReviewComment[]> {
  const byAnchor = new Map<string, ReviewComment[]>();
  for (const comment of comments) {
    if (comment.artifactId !== artifactId) continue;
    const bucket = byAnchor.get(comment.anchor);
    if (bucket) bucket.push(comment);
    else byAnchor.set(comment.anchor, [comment]);
  }
  return byAnchor;
}

export function unresolvedBlockingComments(changeSet: ChangeSet): ReviewComment[] {
  return changeSet.comments.filter((comment) => !comment.resolved && comment.severity === 'blocking');
}

export function openComments(changeSet: ChangeSet): ReviewComment[] {
  return changeSet.comments.filter((comment) => !comment.resolved);
}

function bandFor(score: number): RiskBand {
  if (score < 30) return 'low';
  if (score < 60) return 'medium';
  return 'high';
}

/** Builds the change-set impact summary from the rendered diffs. */
export function buildImpactSummary(changeSet: ChangeSet, diffs: readonly RenderedDiff[]): ImpactSummary {
  const byKind: Record<DiffArtifactKind, number> = { text: 0, structured: 0, snapshot: 0, semantic: 0 };
  let additions = 0;
  let deletions = 0;
  let modifications = 0;
  const hotspots: ImpactHotspot[] = [];

  for (const diff of diffs) {
    const artifact = changeSet.artifacts.find((entry) => entry.descriptor.id === diff.artifactId);
    const kind = artifact ? artifact.descriptor.kind : diff.kind;
    byKind[kind] += 1;
    additions += diff.summary.added;
    deletions += diff.summary.removed;
    modifications += diff.summary.modified;

    const changed = diff.summary.added + diff.summary.removed + diff.summary.modified;
    if (changed >= HOTSPOT_THRESHOLD) {
      hotspots.push({
        artifactId: diff.artifactId,
        label: artifact ? artifact.descriptor.path : diff.artifactId,
        weight: changed * KIND_WEIGHT[kind],
        reason: `${changed} changed ${changed === 1 ? 'entry' : 'entries'} in a ${kind} artifact.`,
      });
    }
  }

  hotspots.sort((a, b) => b.weight - a.weight);
  const topHotspots = hotspots.slice(0, 3);

  const blocking = unresolvedBlockingComments(changeSet).length;
  const rawScore = additions + deletions + modifications * 1.5 + topHotspots.length * 6 + blocking * 10;
  const riskScore = Math.max(0, Math.min(100, Math.round(rawScore)));

  return {
    filesChanged: diffs.length,
    additions,
    deletions,
    modifications,
    byKind,
    riskScore,
    riskBand: bandFor(riskScore),
    hotspots: topHotspots,
  };
}

/** Evaluates every policy gate against the current change set. */
export function evaluatePolicyGates(
  changeSet: ChangeSet,
  impact?: ImpactSummary,
): PolicyGateResult[] {
  const blocking = unresolvedBlockingComments(changeSet).length;
  const approvals = countApprovals(changeSet);
  const highRisk = impact ? impact.riskBand === 'high' : false;

  return DEFAULT_POLICY_GATES.map((gate) => {
    let passed = true;
    let detail = '';
    switch (gate.id) {
      case 'gate-blocking-comments':
        passed = blocking === 0;
        detail = passed ? 'No blocking comments open.' : `${blocking} blocking comment(s) still open.`;
        break;
      case 'gate-approvals':
        passed = approvals.approved >= approvals.required;
        detail = `${approvals.approved} of ${approvals.required} required approvals collected.`;
        break;
      case 'gate-ci':
        passed = changeSet.ciStatus === 'passing';
        detail = `CI is ${changeSet.ciStatus}.`;
        break;
      case 'gate-risk':
        passed = !highRisk || approvals.approved >= 2;
        detail = highRisk
          ? `High risk change set needs 2 approvals, ${approvals.approved} collected.`
          : 'No high-risk artifacts were detected.';
        break;
      default:
        detail = 'No rule configured.';
        break;
    }
    return { gateId: gate.id, label: gate.label, severity: gate.severity, passed, detail };
  });
}

/** Whether the acting reviewer may record an approval right now. */
export function canApprove(changeSet: ChangeSet): { allowed: boolean; reason: string } {
  if (changeSet.state === 'approved') {
    return { allowed: false, reason: 'This change set is already approved.' };
  }
  const blocking = unresolvedBlockingComments(changeSet).length;
  if (blocking > 0) {
    return { allowed: false, reason: `${blocking} blocking comment(s) must be resolved first.` };
  }
  return { allowed: true, reason: 'Ready for a review decision.' };
}

/** Derives the review state from the current comments and approvals. */
export function deriveReviewState(changeSet: ChangeSet): ReviewState {
  const approvals = countApprovals(changeSet);
  if (unresolvedBlockingComments(changeSet).length > 0 || approvals.changesRequested > 0) {
    return 'changes_requested';
  }
  if (approvals.approved >= approvals.required) return 'approved';
  if (changeSet.state === 'draft') return 'draft';
  return 'in_review';
}

/** Returns a copy of the change set with its state re-derived. */
export function withDerivedState(changeSet: ChangeSet): ChangeSet {
  return { ...changeSet, state: deriveReviewState(changeSet) };
}

/** Appends a comment, promoting a draft to an active review. */
export function appendComment(changeSet: ChangeSet, comment: ReviewComment): ChangeSet {
  const base = changeSet.state === 'draft' ? { ...changeSet, state: 'in_review' as ReviewState } : changeSet;
  return withDerivedState({ ...base, comments: [...base.comments, comment] });
}

/** Toggles a comment's resolved flag and re-derives the review state. */
export function setCommentResolved(changeSet: ChangeSet, commentId: string, resolved: boolean): ChangeSet {
  const comments = changeSet.comments.map((comment) =>
    comment.id === commentId ? { ...comment, resolved } : comment,
  );
  return withDerivedState({ ...changeSet, comments });
}

/** Records (or replaces) one reviewer's decision and re-derives the state. */
export function recordApproval(changeSet: ChangeSet, approval: Approval): ChangeSet {
  const approvals = [
    ...changeSet.approvals.filter((existing) => existing.reviewerId !== approval.reviewerId),
    approval,
  ];
  return withDerivedState({ ...changeSet, approvals });
}

/** Narrows the artifact navigator by kind and review status. */
export function filterArtifacts(
  changeSet: ChangeSet,
  diffsById: ReadonlyMap<string, RenderedDiff>,
  filter: { kind: DiffArtifactKind | 'all'; status: ArtifactStatusFilter },
): ArtifactChange[] {
  return changeSet.artifacts.filter((artifact) => {
    if (filter.kind !== 'all' && artifact.descriptor.kind !== filter.kind) return false;
    const artifactComments = commentsForArtifact(changeSet.comments, artifact.descriptor.id);
    switch (filter.status) {
      case 'changed': {
        const diff = diffsById.get(artifact.descriptor.id);
        if (!diff) return false;
        return diff.summary.added + diff.summary.removed + diff.summary.modified > 0;
      }
      case 'commented':
        return artifactComments.length > 0;
      case 'unresolved':
        return artifactComments.some((comment) => !comment.resolved);
      default:
        return true;
    }
  });
}

/** Header counters for the review panel. */
export function summarizeReview(changeSet: ChangeSet): {
  total: number;
  open: number;
  resolved: number;
  blockingOpen: number;
} {
  const total = changeSet.comments.length;
  const open = openComments(changeSet).length;
  return {
    total,
    open,
    resolved: total - open,
    blockingOpen: unresolvedBlockingComments(changeSet).length,
  };
}

export function reviewerById(changeSet: ChangeSet, reviewerId: string): Reviewer | null {
  return changeSet.reviewers.find((reviewer) => reviewer.id === reviewerId) ?? null;
}

const STATE_LABELS: Record<ReviewState, string> = {
  draft: 'Draft',
  in_review: 'In review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
};

export function formatReviewState(state: ReviewState): string {
  return STATE_LABELS[state];
}

export function reviewStateTone(state: ReviewState): string {
  switch (state) {
    case 'approved':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300';
    case 'changes_requested':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
    case 'in_review':
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300';
    default:
      return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
  }
}

export function severityTone(severity: CommentSeverity): string {
  return severity === 'blocking'
    ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
    : 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300';
}

export function riskBandTone(band: RiskBand): string {
  switch (band) {
    case 'high':
      return 'text-rose-600 dark:text-rose-400';
    case 'medium':
      return 'text-amber-600 dark:text-amber-400';
    default:
      return 'text-emerald-600 dark:text-emerald-400';
  }
}
