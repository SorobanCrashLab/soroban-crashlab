import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const appRoot = path.resolve(__dirname);
const candidateComponentPaths = [
  path.resolve(appRoot, 'page.tsx'),
  path.resolve(process.cwd(), 'src/app/integrations/page.tsx'),
];

const componentPath = candidateComponentPaths.find((candidatePath) =>
  fs.existsSync(candidatePath),
);

const runAssertions = (): void => {
  if (!componentPath) {
    throw new Error(
      `Component file not found. Checked: ${candidateComponentPaths.join(', ')}`,
    );
  }

  const content = fs.readFileSync(componentPath, 'utf-8');

  assert.ok(
    content.includes("'use client'"),
    'Page should be a client component',
  );
  assert.ok(
    content.includes('export default function IntegrationsHub()'),
    'Page should export a default IntegrationsHub component',
  );
  assert.ok(
    content.includes('INTEGRATIONS'),
    'Page should define INTEGRATIONS array',
  );
  assert.ok(
    content.includes('type Integration ='),
    'Page should define Integration type',
  );
  assert.ok(
    content.includes('Integrations Hub'),
    'Page should render an Integrations Hub heading',
  );
  assert.ok(
    content.includes('/integrations/artifacts'),
    'Page should link to artifacts integration',
  );
  assert.ok(
    content.includes('Ready to Use'),
    'Page should have a Ready to Use section',
  );
  assert.ok(
    content.includes('Coming Soon'),
    'Page should have a Coming Soon section',
  );
  assert.ok(
    content.includes('availableIntegrations'),
    'Page should filter available integrations',
  );
  assert.ok(
    content.includes('comingSoonIntegrations'),
    'Page should filter coming soon integrations',
  );
  assert.ok(
    content.includes('Tailwind'),
    false,
    'Page should use Tailwind CSS classes',
  );
  assert.ok(
    content.includes('dark:'),
    'Page should support dark mode',
  );

  console.log('integrations/page.test.ts: all assertions passed');
};

runAssertions();
