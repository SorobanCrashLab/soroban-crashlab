/*
 * governance.ts — #2298
 * Snapshot review records and baseline governance: proposed updates,
 * approvals, history and rollback references (#063/#070).
 */

export type BaselineDecision = 'approve' | 'reject' | 'request-changes';

export interface SnapshotReview {
  id: string;
  changeId: string;
  classification: 'bug' | 'intended' | 'flaky';
  reviewer: string;
  createdAt: string;
}

export interface BaselineProposal {
  id: string;
  baselineId: string;
  rationale: string;
}

export interface BaselineApproval {
  id: string;
  proposalId: string;
  decision: BaselineDecision;
  rationale: string;
  reviewer: string;
  createdAt: string;
}
