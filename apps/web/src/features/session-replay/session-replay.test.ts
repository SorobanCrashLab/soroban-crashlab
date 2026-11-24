import { describe, expect, it, vi } from 'vitest';
import { createRecorder, newSessionId, sampledIn, type RecorderEnv } from './capture/recorder';
import { describeElement, maskText, redactUrl, scrubEvent, type ElementLike } from './capture/redaction';
import { createTransport } from './capture/transport';
import type { ReplayEvent, SessionMeta } from './capture/schema';
import { decideCapture, privacySignalActive, readReplayConfig } from './privacy/consent';
import { buildBundle, bugReportMarkdown, parseBundle } from './lib/bundle';
import { buildDemoSessions } from './lib/demo';
import { computeFunnel, FUNNELS, normalizeRoute, topPaths } from './lib/journey';
import { ReplayStore, canView, createShareToken, verifyShareToken, type ReplayViewer } from './lib/server';
import { correlatedRequest, findGaps, formatOffset, markersFor, nextBreakpoint, stateAt, transcript } from './lib/timeline';

const ANCHOR = Date.parse('2026-11-24T12:00:00Z');
const [triage, campaign, investigation] = buildDemoSessions(ANCHOR);

function fakeElement(overrides: Partial<ElementLike> & { attrs?: Record<string, string>; matches?: string[]; value?: string } = {}): ElementLike & { value?: string } {
  const attrs = overrides.attrs ?? {};
  return {
    tagName: 'BUTTON',
    textContent: 'Save',
    ...overrides,
    getAttribute: (name: string) => attrs[name] ?? null,
    closest: (selector: string) => ((overrides.matches ?? []).includes(selector) ? {} : null),
  };
}

function fakeEnv() {
  const target = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  let clock = 1_000;
  const location = { pathname: '/triage', search: '?q=1&token=abc', origin: 'http://localhost' };
  const history = {
    pushState(_data: unknown, _unused: string, url?: string | URL | null) {
      location.pathname = String(url);
      location.search = '';
    },
    replaceState() {},
  };
  const consoleLike = { warn: vi.fn(), error: vi.fn() };
  const fetchHost = {
    fetch: vi.fn(async () => new Response('{}', { status: 500, headers: { 'x-request-id': 'req_1', traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01' } })),
  };
  const env: RecorderEnv = {
    window: target,
    document: doc,
    history,
    console: consoleLike,
    fetchHost: fetchHost as unknown as { fetch: typeof fetch },
    location,
    viewport: () => ({ width: 800, height: 600 }),
    scroll: () => ({ x: 0, y: 120 }),
    now: () => clock,
  };
  const dispatch = (type: string, props: Record<string, unknown> = {}) => {
    const event = new Event(type);
    for (const [key, value] of Object.entries(props)) Object.defineProperty(event, key, { value });
    target.dispatchEvent(event);
  };
  return { env, target, history, consoleLike, fetchHost, dispatch, advance: (ms: number) => (clock += ms) };
}

describe('redaction', () => {
  it('masks secrets, PII and sensitive URL parts', () => {
    expect(maskText('mail me at dev@example.com with Bearer abcdefghijklmnop')).toBe('mail me at [email] with Bearer [REDACTED]');
    expect(maskText(`seed S${'A'.repeat(55)}`)).toBe('seed [stellar-secret]');
    expect(maskText('card 4111 1111 1111 1111')).toBe('card [number]');
    expect(redactUrl('/runs?id=1&token=abc#frag')).toBe('/runs?id=1&token=[REDACTED]');
    expect(redactUrl('https://rpc.example.com/x?api_key=1')).toBe('https://rpc.example.com/x?api_key=[REDACTED]');
  });

  it('never labels denied elements and only allow-lists explicit fields', () => {
    expect(describeElement(fakeElement({ textContent: 'Assign to me', attrs: { 'data-testid': 'assign' } }))).toMatchObject({
      tag: 'button',
      label: 'Assign to me',
      testId: 'assign',
      selector: 'button[data-testid="assign"]',
    });
    expect(describeElement(fakeElement({ tagName: 'INPUT', type: 'password', attrs: { name: 'pw' } })).label).toBe('•••');
    expect(describeElement(fakeElement({ matches: ['[data-sensitive]'], textContent: 'GBALANCE' })).label).toBe('•••');
  });

  it('re-scrubs events idempotently on the server', () => {
    const event: ReplayEvent = { type: 'console', t: 1, level: 'error', message: 'password=hunter2 for a@b.co' };
    const once = scrubEvent(event);
    expect(once).toEqual({ ...event, message: 'password=[REDACTED] for [email]' });
    expect(scrubEvent(once)).toEqual(once);
  });
});

describe('recorder', () => {
  it('records structured events and restores every patched global on stop', async () => {
    const { env, history, consoleLike, fetchHost, dispatch, advance } = fakeEnv();
    const originalPush = history.pushState;
    const originalFetch = fetchHost.fetch;
    const originalError = consoleLike.error;
    const recorder = createRecorder(env, { throttleMs: 0 });
    dispatch('click');
    expect(recorder.events()).toHaveLength(0); // nothing before start()

    recorder.start();
    advance(100);
    dispatch('click', { target: fakeElement({ textContent: 'Assign' }), clientX: 10, clientY: 20 });
    dispatch('change', { target: fakeElement({ tagName: 'INPUT', value: 'secret value', attrs: { name: 'note' } }) });
    dispatch('change', { target: fakeElement({ tagName: 'INPUT', value: 'open', attrs: { name: 'filter' }, matches: ['[data-replay-allow]'] }) });
    history.pushState(null, '', '/runs/run-1');
    advance(50);
    await env.fetchHost!.fetch('/api/triage/assign?token=x', { method: 'post' });
    env.console!.error('boom', new Error('kaput'));
    dispatch('error', { error: new Error('Unhandled thing') });
    dispatch('scroll');
    recorder.mark('repro step');

    const types = recorder.events().map((event) => event.type);
    expect(types).toEqual(['navigation', 'resize', 'click', 'input', 'input', 'navigation', 'network', 'console', 'error', 'scroll', 'mark']);
    const [first, , click, masked, allowed, nav, network] = recorder.events();
    expect(first).toMatchObject({ route: '/triage?q=1&token=[REDACTED]', kind: 'load' });
    expect(click).toMatchObject({ t: 100, x: 10, y: 20, target: { label: 'Assign' } });
    expect(masked).toMatchObject({ valueLength: 12 });
    expect(masked).not.toHaveProperty('value');
    expect(allowed).toMatchObject({ value: 'open' });
    expect(nav).toMatchObject({ route: '/runs/run-1', from: '/triage?q=1&token=[REDACTED]', kind: 'push' });
    expect(network).toMatchObject({ method: 'POST', status: 500, ok: false, requestId: 'req_1', traceId: '4bf92f3577b34da6a3ce929d0e0e4736', url: '/api/triage/assign?token=[REDACTED]' });
    expect(originalError).toHaveBeenCalled();

    recorder.stop();
    expect(history.pushState).toBe(originalPush);
    expect(env.fetchHost!.fetch).toBe(originalFetch);
    expect(env.console!.error).toBe(originalError);
    dispatch('click', { target: fakeElement() });
    expect(recorder.events()).toHaveLength(11);
  });

  it('skips ignored endpoints, throttles scroll and bounds the buffer', async () => {
    const { env, dispatch } = fakeEnv();
    const recorder = createRecorder(env, { ignoreUrls: ['/api/session-replay'], maxEvents: 4, throttleMs: 1_000 });
    recorder.start();
    await env.fetchHost!.fetch('/api/session-replay', { method: 'POST' });
    dispatch('scroll');
    dispatch('scroll');
    dispatch('click', { target: fakeElement() });
    dispatch('click', { target: fakeElement() });
    expect(recorder.events().map((event) => event.type)).toEqual(['navigation', 'resize', 'scroll', 'click']);
    expect(recorder.droppedEvents()).toBe(1);
    expect(recorder.drain()).toHaveLength(4);
    expect(recorder.drain()).toHaveLength(0);
  });

  it('generates session ids only from the CSPRNG (CodeQL js/insecure-randomness)', () => {
    const mathRandom = vi.spyOn(Math, 'random');
    const ids = new Set(Array.from({ length: 200 }, () => newSessionId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^rs-[0-9a-f]{32}$/);
    expect(mathRandom).not.toHaveBeenCalled();
    mathRandom.mockRestore();
    const fixed = { getRandomValues: <T extends ArrayBufferView | null>(array: T) => { new Uint8Array((array as unknown as Uint8Array).buffer).fill(0xab); return array; } };
    expect(newSessionId(fixed as Pick<Crypto, 'getRandomValues'>)).toBe(`rs-${'ab'.repeat(16)}`);
    expect(() => newSessionId({} as Pick<Crypto, 'getRandomValues'>)).toThrow(/cryptographic/);
  });

  it('samples deterministically by session id', () => {
    expect(sampledIn('rs-abc', 0.5)).toBe(sampledIn('rs-abc', 0.5));
    expect(sampledIn('x', 1)).toBe(true);
    expect(sampledIn('x', 0)).toBe(false);
    const hits = Array.from({ length: 1_000 }, (_, index) => sampledIn(`rs-${index}`, 0.2)).filter(Boolean).length;
    expect(hits).toBeGreaterThan(120);
    expect(hits).toBeLessThan(280);
  });
});

describe('transport', () => {
  const meta: SessionMeta = {
    id: 'rs-12345678',
    startedAt: '2026-11-24T12:00:00Z',
    userAgent: 'Chrome',
    viewport: { width: 1, height: 1 },
    entryRoute: '/',
    environment: 'test',
    release: null,
    consent: 'granted',
    sampleRate: 1,
  };
  const event = (t: number): ReplayEvent => ({ type: 'mark', t, label: `m${t}` });
  const immediate = (callback: () => void) => {
    callback();
    return 0;
  };

  it('batches, retries with backoff and requeues on failure', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(new Response(null, { status: 202 }));
    const transport = createTransport(meta, { fetch: fetchMock, setTimeout: immediate, clearTimeout: () => undefined }, { maxBatch: 2, maxRetries: 2 });
    transport.enqueue([event(1), event(2), event(3)]);
    // attempt 1 fails, the retry delivers batch 1, then the remainder goes as batch 2
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]!.body)));
    expect(bodies[1]).toMatchObject({ kind: 'ingest', seq: 1, events: [event(1), event(2)] });
    expect(bodies[2]).toMatchObject({ seq: 2, events: [event(3)] });
    expect(transport.pending()).toBe(0);

    const failing = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 400 }));
    const rejected = createTransport(meta, { fetch: failing, setTimeout: () => 0, clearTimeout: () => undefined }, { maxBatch: 10, maxQueue: 3 });
    rejected.enqueue([event(1), event(2), event(3), event(4)]);
    expect(rejected.dropped()).toBe(1);
    expect(await rejected.flush()).toBe(false);
    expect(failing).toHaveBeenCalledTimes(1); // 4xx is not retried
    expect(rejected.pending()).toBe(3);
  });

  it('flushes the remainder with sendBeacon on page hide', () => {
    const beacon = vi.fn(() => true);
    const transport = createTransport(meta, { fetch: vi.fn(), sendBeacon: beacon, setTimeout: () => 0, clearTimeout: () => undefined }, { maxBatch: 2 });
    transport.enqueue([event(1)]);
    transport.flushOnHide();
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(transport.pending()).toBe(0);
  });
});

describe('consent and capture decision', () => {
  const base = { config: { enabled: true, sampleRate: 1 }, consent: 'granted' as const, developerMode: false, route: '/triage', sampled: true };
  it('requires enablement, explicit consent, no privacy signal, an allowed route and sampling', () => {
    expect(decideCapture(base)).toEqual({ record: true, mode: 'sampled' });
    expect(decideCapture({ ...base, config: { enabled: false, sampleRate: 1 } })).toEqual({ record: false, reason: 'disabled' });
    expect(decideCapture({ ...base, consent: 'unset' })).toEqual({ record: false, reason: 'no-consent' });
    expect(decideCapture({ ...base, signals: { globalPrivacyControl: true } })).toEqual({ record: false, reason: 'privacy-signal' });
    expect(decideCapture({ ...base, route: '/support/session-replay/x' })).toEqual({ record: false, reason: 'excluded-route' });
    expect(decideCapture({ ...base, sampled: false })).toEqual({ record: false, reason: 'not-sampled' });
    expect(decideCapture({ ...base, config: { enabled: false, sampleRate: 0 }, developerMode: true, sampled: false })).toEqual({ record: true, mode: 'developer' });
    expect(decideCapture({ ...base, developerMode: true, consent: 'denied' }).record).toBe(false);
  });

  it('reads config defensively', () => {
    expect(readReplayConfig({})).toEqual({ enabled: false, sampleRate: 0.1 });
    expect(readReplayConfig({ enabled: 'on', sampleRate: '7' })).toEqual({ enabled: true, sampleRate: 1 });
    expect(privacySignalActive({ doNotTrack: '1' })).toBe(true);
    expect(privacySignalActive({})).toBe(false);
  });
});

describe('player model', () => {
  it('reconstructs state at an offset', () => {
    const state = stateAt(triage, 10_460);
    expect(state.route).toBe('/runs/run-1012');
    expect(state.scrollY).toBe(640);
    expect(state.network.map((event) => event.status)).toEqual([200, 200, 500]);
    expect(state.errors).toHaveLength(0);
    expect(state.flags).toEqual(['advancedFilters']);
    expect(state.state['triage.filter']).toBe('status=open area=auth');
    expect(stateAt(triage, 13_500).inFlight.map((event) => event.id)).toEqual(['req-4']);
    expect(stateAt(triage, 10_480).errors).toHaveLength(2);
  });

  it('derives markers, breakpoints, gaps and correlations', () => {
    const markers = markersFor(triage);
    const errors = markers.filter((marker) => marker.severity === 'error');
    expect(errors.map((marker) => marker.kind)).toEqual(['network', 'console', 'error', 'network']);
    expect(nextBreakpoint(markers, 0, new Set(['error']))?.t).toBe(10_480);
    expect(nextBreakpoint(markers, 10_480, new Set(['error']))).toBeNull();
    expect(findGaps(investigation)).toEqual([{ start: 9_000, end: 41_000 }]);
    expect(stateAt(investigation, 20_000, findGaps(investigation)).inGap).toBe(true);
    expect(correlatedRequest(triage, 10_480)?.requestId).toBe('req_7f3a93');
    expect(markersFor(investigation).filter((marker) => marker.kind === 'vital')).toHaveLength(2);
  });

  it('produces a transcript of key events', () => {
    const lines = transcript(triage).map((entry) => entry.text);
    expect(lines[0]).toBe('00:00 Loaded /triage');
    expect(lines).toContain('00:10 POST /api/triage/assign → 500 in 610 ms (request req_7f3a93)');
    expect(lines.some((line) => line.includes('GET /api/triage?status=open'))).toBe(false);
    expect(formatOffset(65_000)).toBe('01:05');
  });
});

describe('journeys', () => {
  it('normalizes routes and computes ordered funnels and paths', () => {
    expect(normalizeRoute('/runs/run-1012?tab=logs')).toBe('/runs/:id');
    expect(normalizeRoute('/campaigns/camp-auth-2026')).toBe('/campaigns/:id');
    expect(normalizeRoute('/campaigns/new')).toBe('/campaigns/new');
    const sessions = [triage, campaign, investigation];
    const triageFunnel = computeFunnel(sessions, FUNNELS[0]);
    expect(triageFunnel.steps.map((step) => step.sessions)).toEqual([1, 1, 1]);
    const setup = computeFunnel(sessions, FUNNELS[1]);
    expect(setup).toMatchObject({ entered: 1, completed: 1 });
    const runs = computeFunnel(sessions, FUNNELS[2]);
    expect(runs.steps.map((step) => step.sessions)).toEqual([1, 1, 1]);
    expect(topPaths(sessions)[0].sessions).toBe(1);
  });
});

describe('bundles', () => {
  it('round-trips, detects tampering and renders a bug report', () => {
    const bundle = buildBundle(triage, new Date(ANCHOR));
    const parsed = parseBundle(JSON.stringify(bundle));
    expect(parsed.ok && parsed.checksumValid).toBe(true);
    const tampered = JSON.parse(JSON.stringify(bundle));
    tampered.session.durationMs = 1;
    const reparsed = parseBundle(JSON.stringify(tampered));
    expect(reparsed.ok && reparsed.checksumValid).toBe(false);
    expect(parseBundle('{"schema":"other"}').ok).toBe(false);
    const markdown = bugReportMarkdown(triage, '/support/session-replay/demo-triage-failure');
    expect(markdown).toContain('request `req_7f3a93`');
    expect(markdown).toContain('[logs](/logs?q=%22req_7f3a93%22)');
  });
});

describe('server store and sharing', () => {
  const viewer = (role: ReplayViewer['role']): ReplayViewer => ({ role, subject: role, canViewCaptured: role !== 'anonymous', canShare: role === 'maintainer' });
  const meta: SessionMeta = {
    id: 'rs-capture-1',
    startedAt: new Date(ANCHOR).toISOString(),
    userAgent: 'Chrome',
    viewport: { width: 1, height: 1 },
    entryRoute: '/',
    environment: 'test',
    release: null,
    consent: 'granted',
    sampleRate: 1,
  };

  it('ingests idempotently, re-scrubs and enforces retention', () => {
    let now = ANCHOR;
    const store = new ReplayStore(() => now);
    expect(store.list(false).every((summary) => summary.source === 'demo')).toBe(true);
    expect(store.ingest(meta, 1, [{ type: 'console', t: 5, level: 'error', message: 'token=abc123456789' }], 0)).toEqual({ accepted: 1, duplicate: false });
    expect(store.ingest(meta, 1, [{ type: 'mark', t: 6, label: 'dup' }], 0).duplicate).toBe(true);
    const stored = store.get(meta.id)!;
    expect(stored.events[0]).toMatchObject({ message: 'token=[REDACTED]' });
    expect(store.list(false).some((summary) => summary.id === meta.id)).toBe(false);
    expect(store.list(true).some((summary) => summary.id === meta.id)).toBe(true);
    now += 15 * 86_400_000;
    expect(store.get(meta.id)).toBeNull();
    expect(store.get('demo-triage-failure')).not.toBeNull();
  });

  it('issues time-bounded share tokens bound to one session', () => {
    const now = ANCHOR;
    const { token, expiresAt } = createShareToken('rs-capture-1', 60, now);
    expect(Date.parse(expiresAt) - now).toBe(3_600_000);
    expect(verifyShareToken('rs-capture-1', token, now)).toBe(true);
    expect(verifyShareToken('rs-other', token, now)).toBe(false);
    expect(verifyShareToken('rs-capture-1', token, now + 3_600_001)).toBe(false);
    expect(verifyShareToken('rs-capture-1', `${token}x`, now)).toBe(false);
    const captured = { id: 'rs-capture-1', source: 'captured' as const };
    expect(canView(viewer('anonymous'), captured, null)).toBeNull();
    expect(canView(viewer('analyst'), captured, null)).toBe('role');
    expect(canView(viewer('anonymous'), { id: 'demo', source: 'demo' }, null)).toBe('demo');
  });
});
