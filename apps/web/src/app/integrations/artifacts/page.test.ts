import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const appRoot = path.resolve(__dirname);
const candidateComponentPaths = [
  path.resolve(appRoot, 'page.tsx'),
  path.resolve(process.cwd(), 'src/app/integrations/artifacts/page.tsx'),
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
    content.includes("dynamic(() => import('../../integrate-storage-backend-integration-for-artifacts')"),
    'Page should lazy-load the ArtifactStorageIntegration wrapper component via next/dynamic',
  );
  assert.ok(
    content.includes('export default function ArtifactStorageIntegrationPage()'),
    'Page should export a default page component',
  );
  assert.ok(
    content.includes('<ArtifactStorageIntegration />'),
    'Page should render the ArtifactStorageIntegration component',
  );

  console.log('integrations/artifacts/page.test.ts: all assertions passed');
};

runAssertions();
