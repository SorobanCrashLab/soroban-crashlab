export type DependencyUpdateSurface = 'web' | 'core';

export type DependencyUpdateKind = 'direct_version_bump' | 'lockfile_only';

export type DependencyUpdateGap =
  | 'missing_surface_scope'
  | 'missing_changelog_review'
  | 'missing_rollback_plan'
  | 'missing_validation_checklist'
  | 'missing_validation_output_summary'
  | 'transitive_scope_unreviewed';

export interface DependencyUpdateTimeline {
  reviewWithinHours?: number;
  escalationWithinHours?: number;
  acknowledgementWithinHours?: number;
  initialTriageWithinBusinessDays?: number;
  planWithinDays?: number;
}

export interface DependencyUpdateContext {
  surfaces: DependencyUpdateSurface[];
  updateKind: DependencyUpdateKind;
  changelogReviewed: boolean;
  rollbackPlanDocumented: boolean;
  validationChecklistIncluded: boolean;
  validationOutputSummarized: boolean;
  transitiveChangesReviewed?: boolean;
  securityResponse?: boolean;
}

export interface DependencyUpdateDecision {
  allowed: boolean;
  status: 'ready_for_review' | 'blocked';
  gaps: DependencyUpdateGap[];
  validationCommands: string[];
  requiredActions: string[];
  timeline: DependencyUpdateTimeline;
}

export const dependencyUpdateTimelines = {
  standardReview: {
    reviewWithinHours: 24,
    escalationWithinHours: 36,
  },
  securityResponse: {
    acknowledgementWithinHours: 48,
    initialTriageWithinBusinessDays: 5,
    planWithinDays: 14,
  },
} as const;

const validationCommandsBySurface: Record<DependencyUpdateSurface, string[]> = {
  web: ['npm run test:policy', 'npm run test', 'npm run lint', 'npm run build'],
  core: ['cargo test --all-targets'],
};

export function getDependencyUpdateValidationCommands(
  surfaces: DependencyUpdateSurface[],
): string[] {
  return Array.from(
    new Set(surfaces.flatMap((surface) => validationCommandsBySurface[surface])),
  );
}

export function identifyDependencyUpdateGaps(
  context: DependencyUpdateContext,
): DependencyUpdateGap[] {
  const gaps = new Set<DependencyUpdateGap>();

  if (context.surfaces.length === 0) {
    gaps.add('missing_surface_scope');
  }

  if (!context.changelogReviewed) {
    gaps.add('missing_changelog_review');
  }

  if (!context.rollbackPlanDocumented) {
    gaps.add('missing_rollback_plan');
  }

  if (!context.validationChecklistIncluded) {
    gaps.add('missing_validation_checklist');
  }

  if (!context.validationOutputSummarized) {
    gaps.add('missing_validation_output_summary');
  }

  if (context.updateKind === 'lockfile_only' && !context.transitiveChangesReviewed) {
    gaps.add('transitive_scope_unreviewed');
  }

  return Array.from(gaps);
}

export function evaluateDependencyUpdatePolicy(
  context: DependencyUpdateContext,
): DependencyUpdateDecision {
  const gaps = identifyDependencyUpdateGaps(context);
  const validationCommands = getDependencyUpdateValidationCommands(context.surfaces);
  const timeline = context.securityResponse
    ? dependencyUpdateTimelines.securityResponse
    : dependencyUpdateTimelines.standardReview;

  if (gaps.length === 0) {
    return {
      allowed: true,
      status: 'ready_for_review',
      gaps,
      validationCommands,
      requiredActions: [
        'Keep the changelog or release-notes summary in the PR description.',
        'Keep the rollback trigger and revert path visible in the PR description.',
        'Run the affected post-update validation checklist and summarize the command output.',
      ],
      timeline,
    };
  }

  return {
    allowed: false,
    status: 'blocked',
    gaps,
    validationCommands,
    requiredActions: [
      'Do not merge until changelog review, rollback notes, and validation evidence are complete.',
      'If the update is lockfile-only, identify the transitive packages and review the upstream release notes before approval.',
      'Escalate within the documented review window when the dependency scope or rollback path is still unclear.',
    ],
    timeline,
  };
}
