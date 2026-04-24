import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  dependencyUpdateTimelines,
  evaluateDependencyUpdatePolicy,
  getDependencyUpdateValidationCommands,
} from './dependency-update-policy';

function findRepoRoot(start: string): string {
  let current = start;

  while (current !== path.dirname(current)) {
    if (
      fs.existsSync(path.join(current, 'README.md')) &&
      fs.existsSync(path.join(current, '.github', 'SECURITY.md'))
    ) {
      return current;
    }

    current = path.dirname(current);
  }

  throw new Error('Unable to locate repository root');
}

function readRepoFile(repoRoot: string, filePath: string): string {
  return fs.readFileSync(path.join(repoRoot, filePath), 'utf-8');
}

const runPolicyAssertions = () => {
  const allowed = evaluateDependencyUpdatePolicy({
    surfaces: ['web'],
    updateKind: 'direct_version_bump',
    changelogReviewed: true,
    rollbackPlanDocumented: true,
    validationChecklistIncluded: true,
    validationOutputSummarized: true,
  });

  assert.equal(allowed.allowed, true);
  assert.equal(allowed.status, 'ready_for_review');
  assert.deepEqual(allowed.gaps, []);
  assert.deepEqual(allowed.validationCommands, [
    'npm run test:policy',
    'npm run test',
    'npm run lint',
    'npm run build',
  ]);
  assert.equal(allowed.timeline.reviewWithinHours, 24);
  assert.match(allowed.requiredActions.join(' '), /rollback trigger/i);

  const blockedLockfileOnly = evaluateDependencyUpdatePolicy({
    surfaces: ['web'],
    updateKind: 'lockfile_only',
    changelogReviewed: true,
    rollbackPlanDocumented: true,
    validationChecklistIncluded: true,
    validationOutputSummarized: true,
    transitiveChangesReviewed: false,
  });

  assert.equal(blockedLockfileOnly.allowed, false);
  assert.equal(blockedLockfileOnly.status, 'blocked');
  assert.deepEqual(blockedLockfileOnly.gaps, ['transitive_scope_unreviewed']);
  assert.match(
    blockedLockfileOnly.requiredActions.join(' '),
    /identify the transitive packages/i,
  );

  const securityResponse = evaluateDependencyUpdatePolicy({
    surfaces: ['core'],
    updateKind: 'direct_version_bump',
    changelogReviewed: true,
    rollbackPlanDocumented: true,
    validationChecklistIncluded: true,
    validationOutputSummarized: true,
    securityResponse: true,
  });

  assert.equal(securityResponse.timeline.acknowledgementWithinHours, 48);
  assert.equal(securityResponse.timeline.initialTriageWithinBusinessDays, 5);
  assert.equal(securityResponse.timeline.planWithinDays, 14);

  assert.deepEqual(getDependencyUpdateValidationCommands(['core', 'web']), [
    'cargo test --all-targets',
    'npm run test:policy',
    'npm run test',
    'npm run lint',
    'npm run build',
  ]);
};

const runDocumentationAssertions = () => {
  const repoRoot = findRepoRoot(process.cwd());
  const readme = readRepoFile(repoRoot, 'README.md');
  const contributing = readRepoFile(repoRoot, 'CONTRIBUTING.md');
  const playbook = readRepoFile(repoRoot, 'MAINTAINER_WAVE_PLAYBOOK.md');
  const security = readRepoFile(repoRoot, '.github/SECURITY.md');
  const prDescription = readRepoFile(repoRoot, 'PR_DESCRIPTION.md');

  assert.match(security, /## Dependency Update Review and Rollback/);
  assert.match(security, /changelog|release notes/i);
  assert.match(security, /rollback/i);
  assert.match(security, /24 hours/);
  assert.match(security, /36 hours/);
  assert.match(security, /48 hours/);

  assert.match(contributing, /## Dependency update guidance/);
  assert.match(contributing, /changelog|release notes/i);
  assert.match(contributing, /rollback/i);
  assert.match(contributing, /validation checklist/i);

  assert.match(playbook, /## Dependency update review and rollback policy/);
  assert.match(playbook, /\.github\/SECURITY\.md#dependency-update-review-and-rollback/);
  assert.match(playbook, /CHANGELOG\.md/);
  assert.match(playbook, /npm run test:policy/);

  assert.match(readme, /\.github\/SECURITY\.md/);
  assert.match(readme, /dependency update/i);
  assert.doesNotMatch(
    `${readme}\n${contributing}\n${playbook}\n${security}`,
    /\bTODO\b|\bTBD\b/,
  );

  assert.match(prDescription, /Closes #/);
  assert.match(prDescription, /npm run test:policy/);
  assert.match(prDescription, /npm run test/);
  assert.match(prDescription, /npm run lint/);
  assert.match(prDescription, /npm run build/);
  assert.match(prDescription, /changelog/i);
  assert.match(prDescription, /rollback/i);
};

const runTimelineAssertions = () => {
  assert.equal(dependencyUpdateTimelines.standardReview.reviewWithinHours, 24);
  assert.equal(dependencyUpdateTimelines.standardReview.escalationWithinHours, 36);
  assert.equal(
    dependencyUpdateTimelines.securityResponse.acknowledgementWithinHours,
    48,
  );
  assert.equal(
    dependencyUpdateTimelines.securityResponse.initialTriageWithinBusinessDays,
    5,
  );
  assert.equal(dependencyUpdateTimelines.securityResponse.planWithinDays, 14);
};

runPolicyAssertions();
runDocumentationAssertions();
runTimelineAssertions();

console.log('dependency-update-policy.test.ts: all assertions passed');
