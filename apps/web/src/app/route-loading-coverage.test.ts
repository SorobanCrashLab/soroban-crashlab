import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const routeFiles = [
  'analytics/chart-builder',
  'analytics/environment-matrix',
  'campaign-cost-estimator',
  'dashboard',
  'integrations',
  'integrations/artifacts',
  'integrations/replay-e2e',
  'integrations/smtp',
  'integrations/webhooks/dead-letter-queue',
  'integrations/webhooks/retry-dashboard',
  'maintainer',
  'maintainer/audit-log',
  'runs/[id]/sequence',
  'settings',
  'settings/api',
  'settings/config-bundle',
  'start',
  'wasm-ingestion',
  '__fatal__',
];

describe('route loading coverage', () => {
  it.each(routeFiles)('exposes a loading skeleton for %s', (route) => {
    const loadingPath = path.join(process.cwd(), 'src/app', route, 'loading.tsx');
    expect(fs.existsSync(loadingPath)).toBe(true);
  });
});
