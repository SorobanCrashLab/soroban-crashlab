import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AlertDispatcher, type AlertNotification, type AlertTransport } from './alert-dispatcher';
import { parseAlertPolicy, type AlertSeverity } from './alert-policy';
import { createEnvAlertTransport } from './alert-runtime';
import { verifyPagerDutySignature } from './pagerduty-signature';
import { createHmac } from 'node:crypto';

const policy = parseAlertPolicy(
  fs.readFileSync(path.resolve(__dirname, '../../../../../ops/alert-policies.yml'), 'utf8'),
);

const MINUTE = 60_000;

function setup(start = '2026-10-16T12:00:00Z') {
  let current = Date.parse(start);
  const sent: AlertNotification[] = [];
  const transport: AlertTransport = { send: async (n) => void sent.push(n) };
  let ids = 0;
  const dispatcher = new AlertDispatcher({
    policy,
    transport,
    now: () => new Date(current),
    idFactory: () => `inc-${++ids}`,
  });
  return {
    dispatcher,
    sent,
    advance: (minutes: number) => {
      current += minutes * MINUTE;
    },
    summary: () => sent.map((n) => `${n.channel}:${n.action}`),
  };
}

const critical = (fingerprint = 'sig-1', severity: AlertSeverity = 'critical') => ({
  source: 'nightly-escalation',
  severity,
  fingerprint,
  summary: 'Nightly crash needs a human',
});

describe('dedup window (injected clock)', () => {
  it('folds repeats inside the window into one incident', async () => {
    const { dispatcher, sent, advance } = setup();
    const first = await dispatcher.ingest(critical());
    for (let i = 0; i < 49; i += 1) {
      advance(0.5);
      const repeat = await dispatcher.ingest(critical());
      expect(repeat.outcome).toBe('deduplicated');
      expect(repeat.incident.id).toBe(first.incident.id);
    }
    expect(dispatcher.list()).toHaveLength(1);
    expect(dispatcher.get(first.incident.id)?.occurrences).toBe(50);
    expect(sent).toHaveLength(2); // one trigger to pagerduty + slack, not fifty
  });

  it('opens a new incident once the window has elapsed since the last occurrence', async () => {
    const { dispatcher, advance } = setup();
    await dispatcher.ingest(critical());
    advance(29);
    expect((await dispatcher.ingest(critical())).outcome).toBe('deduplicated');
    advance(30);
    expect((await dispatcher.ingest(critical())).outcome).toBe('created');
  });

  it('does not fold different fingerprints or resolved incidents', async () => {
    const { dispatcher } = setup();
    const a = await dispatcher.ingest(critical('sig-a'));
    expect((await dispatcher.ingest(critical('sig-b'))).outcome).toBe('created');
    await dispatcher.resolve(a.incident.id, 'alice');
    expect((await dispatcher.ingest(critical('sig-a'))).outcome).toBe('created');
  });
});

describe('ack / resolve round trip (API stub)', () => {
  it('dashboard ack propagates to every channel of the route', async () => {
    const { dispatcher, summary } = setup();
    const { incident } = await dispatcher.ingest(critical());
    const acked = await dispatcher.acknowledge(incident.id, 'alice');

    expect(acked.status).toBe('acknowledged');
    expect(acked.acknowledgedBy).toBe('alice');
    expect(summary()).toEqual(['pagerduty:trigger', 'slack:trigger', 'pagerduty:acknowledge', 'slack:acknowledge']);
  });

  it('PagerDuty ack is reflected locally and not echoed back to PagerDuty', async () => {
    const { dispatcher, summary } = setup();
    const { incident } = await dispatcher.ingest(critical());
    const reflected = await dispatcher.applyRemoteStatus(incident.dedupKey, 'acknowledged', 'pagerduty:bob');

    expect(reflected?.status).toBe('acknowledged');
    expect(dispatcher.list()[0].status).toBe('acknowledged');
    expect(summary()).toEqual(['pagerduty:trigger', 'slack:trigger', 'slack:acknowledge']);

    await dispatcher.applyRemoteStatus(incident.dedupKey, 'resolved', 'pagerduty:bob');
    expect(dispatcher.list()[0].status).toBe('resolved');
    expect(summary().at(-1)).toBe('slack:resolve');
  });

  it('ignores remote status for unknown keys and is idempotent once resolved', async () => {
    const { dispatcher, sent } = setup();
    expect(await dispatcher.applyRemoteStatus('nope', 'resolved', 'x')).toBeNull();
    const { incident } = await dispatcher.ingest(critical());
    await dispatcher.resolve(incident.id, 'alice');
    const count = sent.length;
    await dispatcher.acknowledge(incident.id, 'alice');
    expect(dispatcher.get(incident.id)?.status).toBe('resolved');
    expect(sent).toHaveLength(count);
  });

  it('auto-resolves on recovery with a recovery note', async () => {
    const { dispatcher, summary } = setup();
    const { incident } = await dispatcher.ingest(critical());
    const cleared = await dispatcher.clear(incident.dedupKey, 'nightly rerun passed');

    expect(cleared?.status).toBe('resolved');
    expect(cleared?.resolvedBy).toBe('system');
    expect(cleared?.resolutionNote).toBe('Recovered: nightly rerun passed');
    expect(summary().slice(-2)).toEqual(['pagerduty:resolve', 'slack:resolve']);
  });

  it('drives the PagerDuty Events API through the env transport', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response('{}', { status: 202 });
    }) as typeof fetch;
    try {
      const dispatcher = new AlertDispatcher({
        policy,
        transport: createEnvAlertTransport({ PAGERDUTY_INTEGRATION_KEY: 'stub-key' }),
        now: () => new Date('2026-10-16T12:00:00Z'),
      });
      const { incident } = await dispatcher.ingest(critical());
      await dispatcher.acknowledge(incident.id, 'alice');
      await dispatcher.resolve(incident.id, 'alice');
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(calls.map((c) => c.body.event_action)).toEqual(['trigger', 'acknowledge', 'resolve']);
    expect(new Set(calls.map((c) => c.body.dedup_key)).size).toBe(1);
    expect(calls.every((c) => c.body.routing_key === 'stub-key')).toBe(true);
  });
});

describe('escalation on unacked past SLA', () => {
  it('fires steps in order and flags the SLA breach', async () => {
    const { dispatcher, advance, summary } = setup();
    const { incident } = await dispatcher.ingest(critical());

    advance(9);
    expect(await dispatcher.tick()).toHaveLength(0);
    expect(dispatcher.isSlaBreached(dispatcher.get(incident.id)!)).toBe(false);

    advance(1);
    expect(dispatcher.isSlaBreached(dispatcher.get(incident.id)!)).toBe(true);
    expect((await dispatcher.tick()).map((n) => `${n.channel}:${n.action}`)).toEqual([
      'pagerduty:escalate',
      'email:escalate',
    ]);

    advance(20);
    expect((await dispatcher.tick()).map((n) => n.channel)).toEqual(['email']);
    expect(await dispatcher.tick()).toHaveLength(0);
    expect(dispatcher.get(incident.id)?.escalationLevel).toBe(2);
    expect(summary()).toHaveLength(5);
  });

  it('does not escalate an acknowledged incident', async () => {
    const { dispatcher, advance } = setup();
    const { incident } = await dispatcher.ingest(critical());
    await dispatcher.acknowledge(incident.id, 'alice');
    advance(120);
    expect(await dispatcher.tick()).toHaveLength(0);
    expect(dispatcher.isSlaBreached(dispatcher.get(incident.id)!)).toBe(false);
  });

  it('keeps paging the other channels when one transport fails', async () => {
    const sent: string[] = [];
    const dispatcher = new AlertDispatcher({
      policy,
      transport: {
        send: async (n) => {
          if (n.channel === 'pagerduty') throw new Error('down');
          sent.push(n.channel);
        },
      },
      now: () => new Date('2026-10-16T12:00:00Z'),
    });
    await dispatcher.ingest(critical());
    expect(sent).toEqual(['slack']);
  });
});

describe('quiet hours', () => {
  it('holds quiet-hours routes and releases them when quiet hours end', async () => {
    const { dispatcher, sent, advance } = setup('2026-10-16T23:00:00Z');
    const { incident } = await dispatcher.ingest({
      source: 'slo-burn',
      severity: 'warning',
      fingerprint: 'latency',
      summary: 'slow burn',
    });
    expect(incident.notifiedAt).toBeNull();
    expect(sent).toHaveLength(0);

    advance(60);
    expect(await dispatcher.tick()).toHaveLength(0);

    advance(8 * 60); // 08:00 UTC
    const released = await dispatcher.tick();
    expect(released.map((n) => `${n.channel}:${n.action}`)).toEqual(['slack:trigger']);
  });

  it('still pages critical routes at night', async () => {
    const { dispatcher, sent } = setup('2026-10-16T23:00:00Z');
    await dispatcher.ingest(critical());
    expect(sent.map((n) => n.channel)).toEqual(['pagerduty', 'slack']);
  });
});

describe('PagerDuty webhook signature', () => {
  const body = JSON.stringify({ event: { event_type: 'incident.acknowledged' } });
  const sign = (secret: string) => createHmac('sha256', secret).update(body).digest('hex');

  it('accepts a valid signature, including during rotation', () => {
    expect(verifyPagerDutySignature(body, `v1=${sign('s3cret')}`, 's3cret')).toBe(true);
    expect(verifyPagerDutySignature(body, `v1=${sign('old')}, v1=${sign('s3cret')}`, 's3cret')).toBe(true);
  });

  it('rejects missing, forged or tampered signatures', () => {
    expect(verifyPagerDutySignature(body, null, 's3cret')).toBe(false);
    expect(verifyPagerDutySignature(body, `v1=${sign('wrong')}`, 's3cret')).toBe(false);
    expect(verifyPagerDutySignature(`${body} `, `v1=${sign('s3cret')}`, 's3cret')).toBe(false);
  });
});
