import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

function findRepoRoot(start: string): string {
  let current = start;

  while (current !== path.dirname(current)) {
    if (
      fs.existsSync(path.join(current, 'README.md')) &&
      fs.existsSync(path.join(current, 'MAINTAINER_WAVE_PLAYBOOK.md'))
    ) {
      return current;
    }

    current = path.dirname(current);
  }

  throw new Error('Unable to locate repository root');
}

const runStructureAssertions = () => {
  const componentPath = path.join(__dirname, 'ContributorSLATargets.tsx');
  const pagePath = path.join(__dirname, 'page.tsx');

  assert.ok(fs.existsSync(componentPath), 'ContributorSLATargets.tsx should exist');
  
  const content = fs.readFileSync(componentPath, 'utf-8');
  assert.match(content, /'use client'/, 'Should be a client component');
  assert.match(content, /export default function/, 'Should export default function');
  assert.match(content, /Contributor SLA Targets/, 'Should have section title');
  assert.match(content, /New application received/, 'Should have application target');
  assert.match(content, /PR submitted/, 'Should have PR target');
  assert.match(content, /setInterval/, 'Should implement live timers');

  const pageContent = fs.readFileSync(pagePath, 'utf-8');
  assert.match(pageContent, /import ContributorSLATargets from "\.\/ContributorSLATargets"/, 'Should import component');
  assert.match(pageContent, /<ContributorSLATargets \/>/, 'Should render component');
};

const runAlignmentAssertions = () => {
  const repoRoot = findRepoRoot(process.cwd());
  const playbook = fs.readFileSync(path.join(repoRoot, 'MAINTAINER_WAVE_PLAYBOOK.md'), 'utf-8');
  const component = fs.readFileSync(path.join(__dirname, 'ContributorSLATargets.tsx'), 'utf-8');

  // Verify component matches playbook timers
  assert.match(component, /24 h/, 'Should match 24h timer');
  assert.match(component, /48 h/, 'Should match 48h timer');
  assert.match(component, /Wave lead at 36 h/, 'Should match escalation timer');
  
  // Verify playbook has the table we based this on
  assert.match(playbook, /Contributor SLA targets/, 'Playbook should have SLA targets section');
  assert.match(playbook, /New application received/, 'Playbook should have application event');
};

try {
  runStructureAssertions();
  runAlignmentAssertions();
  console.log('ContributorSLATargets.test.ts: all assertions passed');
} catch (error) {
  console.error('ContributorSLATargets.test.ts: FAILED');
  console.error(error);
  process.exit(1);
}
