import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const appRoot = path.resolve(__dirname);
const candidateComponentPaths = [
  path.resolve(appRoot, 'page.tsx'),
  path.resolve(process.cwd(), 'src/app/settings/network/page.tsx'),
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
    content.includes("import('../../../components/NetworkConfigForm')") ||
      content.includes("import NetworkConfigForm from '../../../components/NetworkConfigForm'"),
    'Page should load the NetworkConfigForm component',
  );
  assert.ok(
    content.includes('export default function NetworkSettingsPage()'),
    'Page should export a default page component',
  );
  assert.ok(
    content.includes('<NetworkConfigForm'),
    'Page should render the NetworkConfigForm component',
  );

  console.log('settings/network/page.test.ts: all assertions passed');
};

runAssertions();
