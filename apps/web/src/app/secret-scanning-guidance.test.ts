import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

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

const runAssertions = () => {
  const repoRoot = findRepoRoot(process.cwd());
  const security = readRepoFile(repoRoot, '.github/SECURITY.md');
  const contributing = readRepoFile(repoRoot, 'CONTRIBUTING.md');
  const playbook = readRepoFile(repoRoot, 'MAINTAINER_WAVE_PLAYBOOK.md');
  const readme = readRepoFile(repoRoot, 'README.md');
  const prDescription = readRepoFile(repoRoot, 'PR_DESCRIPTION.md');

  assert.match(security, /## Pre-Commit Secret Scanning Expectations/);
  assert.match(security, /gitleaks/i);
  assert.match(security, /trufflehog/i);
  assert.match(security, /rotate|revoke/i);
  assert.match(security, /git history|rewrite history|amend/i);
  assert.match(security, /private vulnerability reporting|email/i);
  assert.match(security, /false positive/i);

  assert.match(contributing, /## Pre-commit secret scanning/);
  assert.match(contributing, /gitleaks/i);
  assert.match(contributing, /trufflehog/i);
  assert.match(contributing, /Do not push/i);
  assert.match(contributing, /rotate|revoke/i);

  assert.match(playbook, /## Secret scanning expectation for reviews/);
  assert.match(playbook, /\.github\/SECURITY\.md#pre-commit-secret-scanning-expectations/);
  assert.match(playbook, /private channel|private report/i);
  assert.match(playbook, /npm run test:policy/);

  assert.match(readme, /\.github\/SECURITY\.md/);
  assert.match(readme, /secret scanning/i);

  assert.match(prDescription, /Closes #/);
  assert.match(prDescription, /rg -n "TODO\|TBD"/);
  assert.match(prDescription, /npm run test:policy/);
  assert.match(prDescription, /gitleaks|trufflehog/i);
  assert.match(prDescription, /rotate|revoke/i);

  assert.doesNotMatch(
    `${readme}\n${security}\n${contributing}\n${playbook}`,
    /\bTODO\b|\bTBD\b/,
  );
};

runAssertions();
console.log('secret-scanning-guidance.test.ts: all assertions passed');
