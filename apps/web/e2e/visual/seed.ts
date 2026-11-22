import type { Page } from '@playwright/test';

/**
 * Deterministic seed data for the dashboard visual specs.
 *
 * Visual snapshots must not drift because a fixture changed shape or because
 * "now" moved: every timestamp is fixed, every run id is stable, and the
 * numeric columns are rendered from constants. Anything that depends on the
 * clock (relative timestamps) is avoided entirely, and the runs table only
 * renders duration/seed-count columns, both of which are pure functions of
 * this data.
 */

export const VISUAL_RUNS = [
  {
    id: 'run-2001',
    status: 'completed',
    area: 'state',
    severity: 'low',
    duration: 96000,
    seedCount: 10000,
    crashDetail: null,
    cpuInstructions: 10240000,
    memoryBytes: 402653184,
    minResourceFee: 15000,
    queuedAt: '2026-05-31T09:00:00.000Z',
    startedAt: '2026-05-31T09:00:30.000Z',
    finishedAt: '2026-05-31T09:02:06.000Z',
  },
  {
    id: 'run-2002',
    status: 'failed',
    area: 'auth',
    severity: 'critical',
    duration: 240000,
    seedCount: 18200,
    crashDetail: {
      failureCategory: 'authorization',
      signature: 'auth-overflow',
      payload: 'AAAA',
      replayAction: 'soroban test --replay run-2002',
    },
    cpuInstructions: 15200000,
    memoryBytes: 629145600,
    minResourceFee: 22000,
    queuedAt: '2026-05-31T09:05:00.000Z',
    startedAt: '2026-05-31T09:06:00.000Z',
    finishedAt: '2026-05-31T09:10:00.000Z',
  },
  {
    id: 'run-2003',
    status: 'failed',
    area: 'budget',
    severity: 'high',
    duration: 180000,
    seedCount: 15400,
    crashDetail: {
      failureCategory: 'resource',
      signature: 'budget-exhausted',
      payload: 'BBBB',
      replayAction: 'soroban test --replay run-2003',
    },
    cpuInstructions: 18900000,
    memoryBytes: 734003200,
    minResourceFee: 27000,
    queuedAt: '2026-05-31T09:12:00.000Z',
    startedAt: '2026-05-31T09:13:00.000Z',
    finishedAt: '2026-05-31T09:16:00.000Z',
  },
  {
    id: 'run-2004',
    status: 'failed',
    area: 'auth',
    severity: 'critical',
    duration: 210000,
    seedCount: 16900,
    crashDetail: {
      failureCategory: 'authorization',
      signature: 'auth-overflow',
      payload: 'CCCC',
      replayAction: 'soroban test --replay run-2004',
    },
    cpuInstructions: 16100000,
    memoryBytes: 671088640,
    minResourceFee: 23500,
    queuedAt: '2026-05-31T09:20:00.000Z',
    startedAt: '2026-05-31T09:21:00.000Z',
    finishedAt: '2026-05-31T09:24:30.000Z',
  },
  {
    id: 'run-2005',
    status: 'running',
    area: 'budget',
    severity: 'medium',
    duration: 90000,
    seedCount: 9800,
    crashDetail: null,
    cpuInstructions: 8100000,
    memoryBytes: 419430400,
    minResourceFee: 14250,
    queuedAt: '2026-05-31T09:30:00.000Z',
    startedAt: '2026-05-31T09:31:00.000Z',
  },
  {
    id: 'run-2006',
    status: 'queued',
    area: 'state',
    severity: 'low',
    duration: 0,
    seedCount: 0,
    crashDetail: null,
    cpuInstructions: 0,
    memoryBytes: 0,
    minResourceFee: 0,
    queuedAt: '2026-05-31T09:35:00.000Z',
  },
] as const;

/**
 * Fulfills every `/api/runs` request with the deterministic seed payload.
 *
 * The runs list reads a flat `{ runs, total }` envelope while the clustering
 * page reads the nested `{ data: { runs } }` envelope; pass `nested: true` for
 * the cluster view.
 */
export async function mockRuns(page: Page, options: { nested?: boolean } = {}) {
  const body = options.nested
    ? { data: { runs: VISUAL_RUNS } }
    : { runs: VISUAL_RUNS, total: VISUAL_RUNS.length };

  await page.route('**/api/runs*', async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname !== '/api/runs') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

/**
 * Waits for web fonts so text metrics are identical to the blessed baseline.
 * `animations: 'disabled'` in the config handles CSS motion; font swap is the
 * other common source of one-off pixel deltas.
 */
export async function waitForFonts(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}
