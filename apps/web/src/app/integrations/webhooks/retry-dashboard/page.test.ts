import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

const candidatePaths = [
  path.resolve(__dirname, 'page.tsx'),
  path.resolve(process.cwd(), 'src/app/integrations/webhooks/retry-dashboard/page.tsx'),
  path.resolve(process.cwd(), 'apps/web/src/app/integrations/webhooks/retry-dashboard/page.tsx'),
];

const pagePath = candidatePaths.find((p) => fs.existsSync(p));

const runAssertions = (): void => {
  if (!pagePath) {
    throw new Error(`Component page file not found. Checked: ${candidatePaths.join(', ')}`);
  }

  const content = fs.readFileSync(pagePath, 'utf-8');

  assert.ok(
    content.includes('dynamic') && content.includes('WebhookRetryDashboardComponent'),
    'Page should lazy-load WebhookRetryDashboardComponent via next/dynamic'
  );
  assert.ok(
    content.includes('export default function WebhookRetryDashboardPage()'),
    'Page should export a default function WebhookRetryDashboardPage'
  );
  assert.ok(
    content.includes('<WebhookRetryDashboardComponent />'),
    'Page should render WebhookRetryDashboardComponent'
  );

  console.log('integrations/webhooks/retry-dashboard/page.test.ts: all assertions passed');
};

runAssertions();
