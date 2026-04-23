export type MaintainerDecisionKind =
  | 'issue_assignment'
  | 'pr_review'
  | 'security_triage'
  | 'merge_decision';

export type ConflictReason =
  | 'self_assignment'
  | 'self_review'
  | 'security_reporter'
  | 'declared_relationship'
  | 'financial_or_sponsor_interest'
  | 'employer_or_client_interest'
  | 'prior_private_involvement'
  | 'missing_maintainer';

export interface MaintainerDecisionContext {
  decision: MaintainerDecisionKind;
  maintainer: string;
  issueAuthor?: string;
  issueAssignee?: string;
  pullRequestAuthor?: string;
  securityReporter?: string;
  disclosedConflictReasons?: ConflictReason[];
  isSecuritySensitive?: boolean;
}

export interface ConflictTimeline {
  decisionWithinHours?: number;
  escalationWithinHours?: number;
  acknowledgementWithinHours?: number;
  initialTriageWithinBusinessDays?: number;
  planWithinDays?: number;
}

export interface MaintainerConflictDecision {
  allowed: boolean;
  status: 'allowed' | 'recusal_required';
  reasons: ConflictReason[];
  requiredActions: string[];
  timeline: ConflictTimeline;
}

export const conflictPolicyTimelines = {
  issue_assignment: {
    decisionWithinHours: 24,
    escalationWithinHours: 36,
  },
  pr_review: {
    decisionWithinHours: 24,
    escalationWithinHours: 36,
  },
  merge_decision: {
    decisionWithinHours: 24,
    escalationWithinHours: 36,
  },
  security_triage: {
    acknowledgementWithinHours: 48,
    initialTriageWithinBusinessDays: 5,
    planWithinDays: 14,
  },
} as const satisfies Record<MaintainerDecisionKind, ConflictTimeline>;

const selfReviewDecisions = new Set<MaintainerDecisionKind>([
  'pr_review',
  'merge_decision',
]);

export function normalizeMaintainerHandle(handle: string | undefined): string | undefined {
  const normalized = handle?.trim().replace(/^@+/, '').toLowerCase();
  return normalized ? normalized : undefined;
}

function sameHandle(left: string | undefined, right: string | undefined): boolean {
  const normalizedLeft = normalizeMaintainerHandle(left);
  const normalizedRight = normalizeMaintainerHandle(right);

  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

export function identifyConflictReasons(
  context: MaintainerDecisionContext,
): ConflictReason[] {
  const reasons = new Set<ConflictReason>(context.disclosedConflictReasons ?? []);
  const maintainer = normalizeMaintainerHandle(context.maintainer);

  if (!maintainer) {
    reasons.add('missing_maintainer');
  }

  if (
    context.decision === 'issue_assignment' &&
    (sameHandle(maintainer, context.issueAuthor) ||
      sameHandle(maintainer, context.issueAssignee))
  ) {
    reasons.add('self_assignment');
  }

  if (
    selfReviewDecisions.has(context.decision) &&
    sameHandle(maintainer, context.pullRequestAuthor)
  ) {
    reasons.add('self_review');
  }

  if (
    context.decision === 'security_triage' &&
    sameHandle(maintainer, context.securityReporter)
  ) {
    reasons.add('security_reporter');
  }

  return Array.from(reasons);
}

export function evaluateMaintainerConflictDecision(
  context: MaintainerDecisionContext,
): MaintainerConflictDecision {
  const reasons = identifyConflictReasons(context);
  const isSecuritySensitive =
    context.isSecuritySensitive || context.decision === 'security_triage';

  if (reasons.length === 0) {
    return {
      allowed: true,
      status: 'allowed',
      reasons,
      requiredActions: [
        'Proceed under the standard Wave SLA and record the decision evidence in the issue or PR.',
      ],
      timeline: conflictPolicyTimelines[context.decision],
    };
  }

  return {
    allowed: false,
    status: 'recusal_required',
    reasons,
    requiredActions: [
      isSecuritySensitive
        ? 'Record the recusal only in the private security thread or maintainer channel.'
        : 'Post a concise conflict disclosure on the public issue or PR.',
      'Assign an unconflicted maintainer before assignment, review, merge, severity, or disclosure decisions continue.',
      'Do not approve, merge, assign, close, or award resolution credit for the conflicted item.',
    ],
    timeline: conflictPolicyTimelines[context.decision],
  };
}
