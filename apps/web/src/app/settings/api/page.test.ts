import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const appRoot = path.resolve(__dirname);
const candidateComponentPaths = [
  path.resolve(appRoot, 'page.tsx'),
  path.resolve(process.cwd(), 'src/app/settings/api/page.tsx'),
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
    content.includes("import('../../../components/ApiConfigForm')") ||
      content.includes("import ApiConfigForm from '../../../components/ApiConfigForm'"),
    'Page should load the ApiConfigForm component',
  );
  assert.ok(
    content.includes('export default function ApiSettingsPage()'),
    'Page should export a default page component',
  );
  assert.ok(
    content.includes('<ApiConfigForm'),
    'Page should render the ApiConfigForm component',
  );

  console.log('settings/api/page.test.ts: all assertions passed');
};

runAssertions();
