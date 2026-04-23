import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  conflictPolicyTimelines,
  evaluateMaintainerConflictDecision,
  identifyConflictReasons,
  normalizeMaintainerHandle,
} from './maintainer-conflict-policy';

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
  const allowed = evaluateMaintainerConflictDecision({
    decision: 'pr_review',
    maintainer: '@reviewer',
    pullRequestAuthor: '@contributor',
  });

  assert.equal(allowed.allowed, true);
  assert.equal(allowed.status, 'allowed');
  assert.deepEqual(allowed.reasons, []);
  assert.equal(allowed.timeline.decisionWithinHours, 24);

  const selfReview = evaluateMaintainerConflictDecision({
    decision: 'pr_review',
    maintainer: '@Reviewer',
    pullRequestAuthor: 'reviewer',
  });

  assert.equal(selfReview.allowed, false);
  assert.equal(selfReview.status, 'recusal_required');
  assert.deepEqual(selfReview.reasons, ['self_review']);
  assert.match(selfReview.requiredActions.join(' '), /unconflicted maintainer/);
  assert.match(selfReview.requiredActions.join(' '), /Do not approve/);

  const disclosedRelationship = evaluateMaintainerConflictDecision({
    decision: 'issue_assignment',
    maintainer: '@triage-maintainer',
    issueAuthor: '@new-contributor',
    disclosedConflictReasons: ['declared_relationship'],
  });

  assert.equal(disclosedRelationship.allowed, false);
  assert.deepEqual(disclosedRelationship.reasons, ['declared_relationship']);
  assert.equal(disclosedRelationship.timeline.escalationWithinHours, 36);

  const securityReporter = evaluateMaintainerConflictDecision({
    decision: 'security_triage',
    maintainer: '@Maintainer',
    securityReporter: 'maintainer',
  });

  assert.equal(securityReporter.allowed, false);
  assert.deepEqual(securityReporter.reasons, ['security_reporter']);
  assert.equal(securityReporter.timeline.acknowledgementWithinHours, 48);
  assert.equal(securityReporter.timeline.initialTriageWithinBusinessDays, 5);
  assert.match(securityReporter.requiredActions.join(' '), /private security thread/);

  assert.equal(normalizeMaintainerHandle('  @@Alice  '), 'alice');
  assert.deepEqual(
    identifyConflictReasons({
      decision: 'merge_decision',
      maintainer: 'ALICE',
      pullRequestAuthor: '@alice',
    }),
    ['self_review'],
  );
};

const runDocumentationAssertions = () => {
  const repoRoot = findRepoRoot(process.cwd());
  const readme = readRepoFile(repoRoot, 'README.md');
  const contributing = readRepoFile(repoRoot, 'CONTRIBUTING.md');
  const playbook = readRepoFile(repoRoot, 'MAINTAINER_WAVE_PLAYBOOK.md');
  const security = readRepoFile(repoRoot, '.github/SECURITY.md');
  const prDescription = readRepoFile(repoRoot, 'PR_DESCRIPTION.md');

  assert.match(security, /## Maintainer Conflicts of Interest/);
  assert.match(security, /unconflicted maintainer/i);
  assert.match(security, /48 hours/);
  assert.match(security, /5 business days/);
  assert.match(security, /14 days/);

  assert.match(playbook, /\.github\/SECURITY\.md#maintainer-conflicts-of-interest/);
  assert.match(playbook, /Conflict-of-interest handling/);
  assert.match(playbook, /issue assignment/i);
  assert.match(playbook, /PR review/i);
  assert.match(playbook, /npm run test:policy/);

  assert.match(contributing, /conflict of interest/i);
  assert.match(contributing, /private vulnerability/i);

  assert.match(readme, /\.github\/SECURITY\.md/);
  assert.doesNotMatch(
    `${readme}\n${contributing}\n${playbook}\n${security}`,
    /\bTODO\b|\bTBD\b/,
  );

  assert.match(prDescription, /Closes #/);
  assert.match(prDescription, /rg -n "TODO\|TBD"/);
  assert.match(prDescription, /npm run test:policy/);
};

const runTimelineAlignmentAssertions = () => {
  assert.equal(conflictPolicyTimelines.issue_assignment.decisionWithinHours, 24);
  assert.equal(conflictPolicyTimelines.pr_review.decisionWithinHours, 24);
  assert.equal(conflictPolicyTimelines.security_triage.acknowledgementWithinHours, 48);
  assert.equal(
    conflictPolicyTimelines.security_triage.initialTriageWithinBusinessDays,
    5,
  );
  assert.equal(conflictPolicyTimelines.security_triage.planWithinDays, 14);
};

runPolicyAssertions();
runDocumentationAssertions();
runTimelineAlignmentAssertions();

console.log('maintainer-conflict-policy.test.ts: all assertions passed');
