import { describe, expect, it } from 'vitest';
import {
  buildSlackBaseString,
  signSlackRequest,
  SLACK_TIMESTAMP_TOLERANCE_SECONDS,
  verifySlackRequest,
} from './slack-signature';
import {
  buildTriageMessageBlocks,
  decodeActionId,
  encodeActionId,
  type CrashSummary,
} from './slack-blocks';
import {
  applyTriageAction,
  createInMemoryTriageStore,
  createMockInteractivity,
  encodeInteractivityBody,
  handleInteractivityRequest,
  parseInteractivityBody,
} from './slack-interactivity';

/**
 * Published example from Slack's "Verifying requests from Slack" docs. Pinning
 * it proves the basestring layout and digest match Slack's, not just our own.
 */
const SLACK_DOC_VECTOR = {
  secret: '8f742231b10e8888abcd99yyyzzz85a5',
  timestamp: '1531420618',
  body:
    'token=xyzz0WbapA4vBCDEFasx0q6G&team_id=T1DC2JH3J&team_domain=testteamnow' +
    '&channel_id=G8PSS9T3V&channel_name=foobar&user_id=U2CERLKJA&user_name=roadrunner' +
    '&command=%2Fwebhook-collect&text=&response_url=https%3A%2F%2Fhooks.slack.com%2Fcommands' +
    '%2FT1DC2JH3J%2F397700885554%2F96rGlfmibIGlgcZRskXaIFfN' +
    '&trigger_id=398738663015.47445629121.803a0bc887a14d10d2c447fce8b6703c',
  signature: 'v0=a2114d57b48eac39b9ad189dd8316235a7b4a8d21a10bd27519666489c69b503',
};

const crash: CrashSummary = {
  runId: 'run-42',
  clusterId: 'cluster-7',
  title: 'Arithmetic overflow in transfer()',
  severity: 'critical',
  area: 'token',
  failureCount: 12,
  dashboardUrl: 'https://crashlab.example/runs/run-42',
};

const SECRET = 'test-signing-secret';

describe('signature verification', () => {
  it('reproduces the signature from the Slack docs vector', () => {
    expect(buildSlackBaseString(SLACK_DOC_VECTOR.timestamp, SLACK_DOC_VECTOR.body)).toBe(
      `v0:${SLACK_DOC_VECTOR.timestamp}:${SLACK_DOC_VECTOR.body}`,
    );
    expect(
      signSlackRequest(SLACK_DOC_VECTOR.secret, SLACK_DOC_VECTOR.timestamp, SLACK_DOC_VECTOR.body),
    ).toBe(SLACK_DOC_VECTOR.signature);
  });

  it('accepts the docs vector when the clock is near its timestamp', () => {
    expect(
      verifySlackRequest({
        secret: SLACK_DOC_VECTOR.secret,
        signature: SLACK_DOC_VECTOR.signature,
        timestamp: SLACK_DOC_VECTOR.timestamp,
        body: SLACK_DOC_VECTOR.body,
        nowSeconds: Number(SLACK_DOC_VECTOR.timestamp) + 10,
      }),
    ).toEqual({ ok: true });
  });

  it('rejects a tampered body', () => {
    expect(
      verifySlackRequest({
        secret: SLACK_DOC_VECTOR.secret,
        signature: SLACK_DOC_VECTOR.signature,
        timestamp: SLACK_DOC_VECTOR.timestamp,
        body: `${SLACK_DOC_VECTOR.body}&evil=1`,
        nowSeconds: Number(SLACK_DOC_VECTOR.timestamp),
      }),
    ).toEqual({ ok: false, reason: 'bad-signature' });
  });

  it('rejects a replay older than the 5 minute window', () => {
    expect(SLACK_TIMESTAMP_TOLERANCE_SECONDS).toBe(300);
    const base = Number(SLACK_DOC_VECTOR.timestamp);
    const stale = verifySlackRequest({
      secret: SLACK_DOC_VECTOR.secret,
      signature: SLACK_DOC_VECTOR.signature,
      timestamp: SLACK_DOC_VECTOR.timestamp,
      body: SLACK_DOC_VECTOR.body,
      nowSeconds: base + SLACK_TIMESTAMP_TOLERANCE_SECONDS + 1,
    });
    expect(stale).toEqual({ ok: false, reason: 'stale-timestamp' });

    // Exactly on the boundary is still fresh.
    expect(
      verifySlackRequest({
        secret: SLACK_DOC_VECTOR.secret,
        signature: SLACK_DOC_VECTOR.signature,
        timestamp: SLACK_DOC_VECTOR.timestamp,
        body: SLACK_DOC_VECTOR.body,
        nowSeconds: base + SLACK_TIMESTAMP_TOLERANCE_SECONDS,
      }).ok,
    ).toBe(true);
  });

  it('rejects a timestamp from the future beyond the window', () => {
    const base = Number(SLACK_DOC_VECTOR.timestamp);
    expect(
      verifySlackRequest({
        secret: SLACK_DOC_VECTOR.secret,
        signature: SLACK_DOC_VECTOR.signature,
        timestamp: SLACK_DOC_VECTOR.timestamp,
        body: SLACK_DOC_VECTOR.body,
        nowSeconds: base - SLACK_TIMESTAMP_TOLERANCE_SECONDS - 1,
      }).reason,
    ).toBe('stale-timestamp');
  });

  it('reports missing pieces distinctly', () => {
    const common = { body: 'x', nowSeconds: 0 };
    expect(verifySlackRequest({ ...common, secret: undefined, signature: 'v0=a', timestamp: '0' }).reason)
      .toBe('not-configured');
    expect(verifySlackRequest({ ...common, secret: 's', signature: null, timestamp: '0' }).reason)
      .toBe('missing-signature');
    expect(verifySlackRequest({ ...common, secret: 's', signature: 'v0=a', timestamp: null }).reason)
      .toBe('missing-timestamp');
    expect(verifySlackRequest({ ...common, secret: 's', signature: 'v0=a', timestamp: 'later' }).reason)
      .toBe('missing-timestamp');
  });
});

describe('Block Kit message builder', () => {
  it('renders a header, severity chip and the three triage buttons', () => {
    const blocks = buildTriageMessageBlocks(crash, SECRET) as Array<Record<string, unknown>>;
    expect(blocks.map((block) => block.type)).toEqual(['header', 'section', 'actions']);

    const section = blocks[1] as { fields: Array<{ text: string }> };
    expect(section.fields[0].text).toContain('Critical');
    expect(section.fields[2].text).toContain('run-42');

    const actions = blocks[2] as { elements: Array<{ text: { text: string }; url?: string }> };
    expect(actions.elements.map((element) => element.text.text)).toEqual([
      'Assign to me',
      'Resolve',
      'View run',
    ]);
    expect(actions.elements[2].url).toBe(crash.dashboardUrl);
  });

  it('replaces the triage buttons with a resolution note once resolved', () => {
    const blocks = buildTriageMessageBlocks(crash, SECRET, { resolvedBy: 'ana' }) as Array<
      Record<string, unknown>
    >;
    expect(blocks.map((block) => block.type)).toEqual(['header', 'section', 'context', 'actions']);
    const actions = blocks[3] as { elements: Array<{ text: { text: string } }> };
    expect(actions.elements.map((element) => element.text.text)).toEqual(['View run']);
  });

  it('round-trips run and cluster refs through a signed action_id', () => {
    const id = encodeActionId({ action: 'resolve', runId: 'run-42', clusterId: 'cluster-7' }, SECRET);
    expect(decodeActionId(id, SECRET)).toEqual({
      action: 'resolve',
      runId: 'run-42',
      clusterId: 'cluster-7',
    });
  });

  it('survives refs containing the field separator', () => {
    const id = encodeActionId({ action: 'assign', runId: 'run:a:b', clusterId: 'c:d' }, SECRET);
    expect(decodeActionId(id, SECRET)).toEqual({
      action: 'assign',
      runId: 'run:a:b',
      clusterId: 'c:d',
    });
  });

  it('rejects a tampered or foreign-signed action_id', () => {
    const id = encodeActionId({ action: 'resolve', runId: 'run-42', clusterId: 'cluster-7' }, SECRET);
    expect(decodeActionId(id.replace('run-42', 'run-99'), SECRET)).toBeNull();
    expect(decodeActionId(id, 'another-secret')).toBeNull();
    expect(decodeActionId('crashlab:open-dashboard', SECRET)).toBeNull();
    expect(decodeActionId('not-ours:resolve:a:b:c', SECRET)).toBeNull();
  });
});

describe('triage actions', () => {
  it('records the actor on assign', () => {
    const store = createInMemoryTriageStore();
    const result = applyTriageAction(store, {
      ref: { action: 'assign', runId: 'run-42', clusterId: 'cluster-7' },
      actor: 'ana',
      now: '2026-03-01T00:00:00.000Z',
    });
    expect(result.outcome).toBe('assigned');
    expect(result.record.assignee).toBe('ana');
    expect(result.record.assignedAt).toBe('2026-03-01T00:00:00.000Z');
  });

  it('keeps the first resolver when resolve is clicked twice', () => {
    const store = createInMemoryTriageStore();
    const ref = { action: 'resolve' as const, runId: 'run-42', clusterId: 'cluster-7' };
    const first = applyTriageAction(store, { ref, actor: 'ana', now: '2026-03-01T00:00:00.000Z' });
    const second = applyTriageAction(store, { ref, actor: 'dmitri', now: '2026-03-01T00:00:05.000Z' });

    expect(first.outcome).toBe('resolved');
    expect(second.outcome).toBe('already-resolved');
    expect(second.record.resolvedBy).toBe('ana');
    expect(second.record.resolvedAt).toBe('2026-03-01T00:00:00.000Z');
    expect(store.all()).toHaveLength(1);
  });
});

describe('interactivity payloads', () => {
  it('round-trips a form-encoded payload', () => {
    const body = encodeInteractivityBody({
      type: 'block_actions',
      user: { id: 'U1', username: 'ana' },
      actions: [{ action_id: 'crashlab:open-dashboard' }],
    });
    expect(body.startsWith('payload=')).toBe(true);
    expect(parseInteractivityBody(body)?.user.username).toBe('ana');
  });

  it('returns error for junk bodies', () => {
    expect(parseInteractivityBody('')).toEqual({ error: 'Missing payload parameter' });
    expect(parseInteractivityBody('payload=not-json')).toHaveProperty('error');
    expect(parseInteractivityBody('payload=%7B%7D')).toHaveProperty('error');
  });
});

describe('fast-ack handler', () => {
  const validRequest = (nowSeconds: number) => {
    const body = encodeInteractivityBody({
      type: 'block_actions',
      user: { id: 'U1', username: 'ana' },
      actions: [
        { action_id: encodeActionId({ action: 'resolve', runId: 'run-42', clusterId: 'cluster-7' }, SECRET) },
      ],
    });
    const timestamp = String(nowSeconds);
    return { body, timestamp, signature: signSlackRequest(SECRET, timestamp, body) };
  };

  it('acks before the deferred work runs', () => {
    const store = createInMemoryTriageStore();
    const tasks: Array<() => Promise<void> | void> = [];
    const request = validRequest(1_700_000_000);

    const ack = handleInteractivityRequest(request, {
      secret: SECRET,
      store,
      nowSeconds: 1_700_000_000,
      defer: (task) => tasks.push(task),
    });

    expect(ack).toEqual({ status: 200, body: '', accepted: true });
    // Nothing has been recorded yet — the work is still queued.
    expect(store.all()).toEqual([]);
    tasks.forEach((task) => task());
    expect(store.all()[0].resolvedBy).toBe('ana');
  });

  it('returns the ack well inside Slack’s 3 second budget even when processing is slow', async () => {
    const store = createInMemoryTriageStore();
    let settle: Promise<void> = Promise.resolve();
    const request = validRequest(1_700_000_000);

    const started = Date.now();
    const ack = handleInteractivityRequest(request, {
      secret: SECRET,
      store,
      nowSeconds: 1_700_000_000,
      defer: (task) => {
        settle = new Promise<void>((resolve) => {
          setTimeout(() => {
            void task();
            resolve();
          }, 250);
        });
      },
    });
    const ackMs = Date.now() - started;

    expect(ack.accepted).toBe(true);
    expect(ackMs).toBeLessThan(100);
    await settle;
    expect(store.all()[0].resolvedBy).toBe('ana');
  });

  it('rejects an unsigned or stale request without touching triage state', () => {
    const store = createInMemoryTriageStore();
    const request = validRequest(1_700_000_000);
    const tasks: Array<() => Promise<void> | void> = [];
    const options = {
      secret: SECRET,
      store,
      nowSeconds: 1_700_000_000,
      defer: (task: () => Promise<void> | void) => tasks.push(task),
    };

    expect(handleInteractivityRequest({ ...request, signature: null }, options).status).toBe(401);
    expect(
      handleInteractivityRequest(request, { ...options, nowSeconds: 1_700_000_000 + 400 }).reason,
    ).toBe('stale-timestamp');
    expect(handleInteractivityRequest(request, { ...options, secret: undefined }).status).toBe(503);
    expect(tasks).toEqual([]);
    expect(store.all()).toEqual([]);
  });

  it('rejects a body that is not an interactivity payload', () => {
    const timestamp = '1700000000';
    const body = 'hello=world';
    const ack = handleInteractivityRequest(
      { body, timestamp, signature: signSlackRequest(SECRET, timestamp, body) },
      {
        secret: SECRET,
        store: createInMemoryTriageStore(),
        nowSeconds: 1_700_000_000,
        defer: () => undefined,
      },
    );
    expect(ack).toEqual({ status: 422, body: '', reason: 'invalid-payload', accepted: false });
  });
});

describe('mock interactivity simulator', () => {
  it('drives assign then resolve through the full signed loop', async () => {
    const mock = createMockInteractivity({ now: () => '2026-03-01T00:00:00.000Z' });

    const assignAck = await mock.click({ action: 'assign', crash, userId: 'U1', username: 'ana' });
    expect(assignAck.accepted).toBe(true);
    expect(mock.store.get(crash.runId, crash.clusterId)?.assignee).toBe('ana');

    const blocksAfterAssign = mock.blocksFor(crash) as Array<Record<string, unknown>>;
    expect(JSON.stringify(blocksAfterAssign)).toContain('Assigned to <@ana>');

    const resolveAck = await mock.click({ action: 'resolve', crash, userId: 'U2', username: 'dmitri' });
    expect(resolveAck.accepted).toBe(true);
    expect(mock.store.get(crash.runId, crash.clusterId)?.resolvedBy).toBe('dmitri');

    const resolvedBlocks = mock.blocksFor(crash) as Array<Record<string, unknown>>;
    const actions = resolvedBlocks[resolvedBlocks.length - 1] as {
      elements: Array<{ text: { text: string } }>;
    };
    expect(actions.elements.map((element) => element.text.text)).toEqual(['View run']);
  });

  it('is safe against a double-clicked Resolve button', async () => {
    const mock = createMockInteractivity();
    await mock.click({ action: 'resolve', crash, userId: 'U1', username: 'ana' });
    await mock.click({ action: 'resolve', crash, userId: 'U2', username: 'dmitri' });

    const record = mock.store.get(crash.runId, crash.clusterId);
    expect(record?.resolvedBy).toBe('ana');
    expect(mock.store.all()).toHaveLength(1);
  });
});
