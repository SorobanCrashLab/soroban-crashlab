/**
 * Deterministic demo sessions (#2341), flagged `source: 'demo'`. They hold
 * no real user data and exercise every panel: a failing triage flow, a
 * campaign setup, and a slow run investigation with poor vitals.
 */

import { REPLAY_SCHEMA_VERSION, type ReplayEvent, type ReplaySession } from '../capture/schema';

const el = (tag: string, label: string, testId?: string) => ({
  tag,
  label,
  selector: testId ? `${tag}[data-testid="${testId}"]` : tag,
  ...(testId ? { testId } : {}),
});

function session(id: string, startedAt: string, entryRoute: string, events: ReplayEvent[], extra: Partial<ReplaySession> = {}): ReplaySession {
  return {
    version: REPLAY_SCHEMA_VERSION,
    id,
    startedAt,
    userAgent: 'Chrome',
    viewport: { width: 1440, height: 900 },
    entryRoute,
    environment: 'preview',
    release: 'soroban-crashlab-web@0.1.0+demo',
    consent: 'granted',
    sampleRate: 1,
    durationMs: events[events.length - 1]?.t ?? 0,
    events,
    droppedEvents: 0,
    issueLinks: [],
    incidentIds: [],
    source: 'demo',
    ...extra,
  };
}

export function buildDemoSessions(anchor: number): ReplaySession[] {
  const iso = (minutesAgo: number) => new Date(anchor - minutesAgo * 60_000).toISOString();
  return [
    session(
      'demo-triage-failure',
      iso(42),
      '/triage',
      [
        { type: 'navigation', t: 0, route: '/triage', from: null, kind: 'load' },
        { type: 'resize', t: 0, width: 1440, height: 900 },
        { type: 'flag', t: 5, flags: ['advancedFilters'] },
        { type: 'vital', t: 900, name: 'LCP', value: 1_850 },
        { type: 'network', t: 1_200, id: 'req-1', method: 'GET', url: '/api/triage?status=open', status: 200, ok: true, durationMs: 310, requestId: 'req_7f3a91', traceId: null },
        { type: 'input', t: 3_400, target: el('input', 'Filter signatures', 'triage-search'), valueLength: 9 },
        { type: 'state', t: 3_500, key: 'triage.filter', summary: 'status=open area=auth' },
        { type: 'click', t: 5_100, target: el('a', 'run-1012 · auth overflow', 'triage-row'), x: 412, y: 318 },
        { type: 'navigation', t: 5_150, route: '/runs/run-1012', from: '/triage', kind: 'push' },
        { type: 'network', t: 5_700, id: 'req-2', method: 'GET', url: '/api/runs/run-1012', status: 200, ok: true, durationMs: 420, requestId: 'req_7f3a92', traceId: '4bf92f3577b34da6a3ce929d0e0e4736' },
        { type: 'scroll', t: 7_200, x: 0, y: 640 },
        { type: 'click', t: 9_800, target: el('button', 'Assign to me', 'assign-button'), x: 1180, y: 212 },
        { type: 'network', t: 10_450, id: 'req-3', method: 'POST', url: '/api/triage/assign', status: 500, ok: false, durationMs: 610, requestId: 'req_7f3a93', traceId: '0af7651916cd43dd8448eb211c80319c' },
        { type: 'console', t: 10_470, level: 'error', message: 'Assignment failed: upstream returned 500' },
        { type: 'error', t: 10_480, source: 'unhandledrejection', message: 'TypeError: Cannot read properties of undefined (reading "assignee")', stack: 'TypeError: Cannot read properties of undefined\n    at AssignButton.onSuccess (assign-button.tsx:41:18)' },
        { type: 'click', t: 13_200, target: el('button', 'Assign to me', 'assign-button'), x: 1180, y: 212 },
        { type: 'network', t: 13_900, id: 'req-4', method: 'POST', url: '/api/triage/assign', status: 500, ok: false, durationMs: 690, requestId: 'req_7f3a94', traceId: null },
        { type: 'mark', t: 15_000, label: 'User gave up after second retry' },
      ],
      { incidentIds: ['INC-2041'] },
    ),
    session('demo-campaign-setup', iso(180), '/campaigns/new', [
      { type: 'navigation', t: 0, route: '/campaigns/new', from: null, kind: 'load' },
      { type: 'resize', t: 0, width: 1280, height: 800 },
      { type: 'input', t: 2_100, target: el('input', 'Campaign name', 'campaign-name'), valueLength: 18, value: 'token fuzz nightly' },
      { type: 'input', t: 4_300, target: el('input', 'RPC endpoint', 'rpc-url'), valueLength: 42 },
      { type: 'click', t: 6_900, target: el('button', 'Next', 'wizard-next'), x: 1040, y: 690 },
      { type: 'click', t: 9_400, target: el('button', 'Create campaign', 'wizard-submit'), x: 1040, y: 690 },
      { type: 'network', t: 10_100, id: 'req-1', method: 'POST', url: '/api/campaigns', status: 201, ok: true, durationMs: 540, requestId: 'req_c01', traceId: null },
      { type: 'navigation', t: 10_200, route: '/campaigns/camp-token-fuzz', from: '/campaigns/new', kind: 'push' },
      { type: 'vital', t: 11_000, name: 'CLS', value: 0.04 },
    ]),
    session('demo-run-investigation', iso(600), '/runs', [
      { type: 'navigation', t: 0, route: '/runs', from: null, kind: 'load' },
      { type: 'resize', t: 0, width: 1024, height: 768 },
      { type: 'network', t: 4_200, id: 'req-1', method: 'GET', url: '/api/runs?limit=50', status: 200, ok: true, durationMs: 3_900, requestId: 'req_r01', traceId: null },
      { type: 'vital', t: 4_500, name: 'LCP', value: 4_350 },
      { type: 'vital', t: 4_600, name: 'CLS', value: 0.27 },
      { type: 'click', t: 6_000, target: el('a', 'run-1003', 'run-row'), x: 220, y: 400 },
      { type: 'navigation', t: 6_050, route: '/runs/run-1003', from: '/runs', kind: 'push' },
      { type: 'visibility', t: 9_000, state: 'hidden' },
      { type: 'visibility', t: 41_000, state: 'visible' },
      { type: 'click', t: 43_500, target: el('a', 'View logs', 'run-logs-link'), x: 880, y: 140 },
      { type: 'navigation', t: 43_550, route: '/logs?q=run_id%3Arun-1003', from: '/runs/run-1003', kind: 'push' },
      { type: 'network', t: 44_300, id: 'req-2', method: 'GET', url: '/api/logs/search?q=run_id%3Arun-1003&token=[REDACTED]', status: 200, ok: true, durationMs: 610, requestId: 'req_r02', traceId: null },
    ]),
  ];
}
