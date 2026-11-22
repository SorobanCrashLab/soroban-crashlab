import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { POST as RETRY } from './route';
import { POST as RECOVERY } from '../recovery/route';
import { getDeliveryHistoryStore, updateDeliveryHistoryStore } from '../history/route';
import { MOCK_WEBHOOK_DELIVERY_HISTORY } from '../../../../fixtures/webhook-delivery-history';
import { getWebhookStore, resetWebhookStore } from '../../../../lib/webhook-store';
import { getWebhookRecovery, resetWebhookRecovery } from '../../../../lib/webhook-recovery';

const FAILED_ID = 'del_1002';

function retryRequest(id: unknown): Request {
  return new Request('http://t/api/webhooks/retry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
}

async function readData<T>(res: Response): Promise<T> {
  return ((await res.json()) as { data: T }).data;
}

let dataDir: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webhook-route-'));
  resetWebhookStore();
  resetWebhookRecovery();
  getWebhookStore(dataDir);
  updateDeliveryHistoryStore(MOCK_WEBHOOK_DELIVERY_HISTORY.map((item) => ({ ...item })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetWebhookStore();
  resetWebhookRecovery();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('POST /api/webhooks/retry (#1635)', () => {
  it('queues a durable retry and does not attempt delivery inline', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const res = await RETRY(retryRequest(FAILED_ID) as never);

    expect(res.status).toBe(202);
    const data = await readData<{ item: { status: string; nextRetryAt: string }; nextAttemptAt: string }>(res);
    expect(data.item.status).toBe('queued');
    expect(data.item.nextRetryAt).toBe(data.nextAttemptAt);
    expect(fetchSpy).not.toHaveBeenCalled();
    // Persisted, so it survives this function ending.
    expect(getWebhookStore().getRetryQueue().map((job) => job.id)).toEqual([FAILED_ID]);
  });

  it('delivers the queued retry on the next recovery tick and updates history', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    await RETRY(retryRequest(FAILED_ID) as never);

    const res = await RECOVERY(retryRequest(FAILED_ID) as never);

    expect(res.status).toBe(200);
    const data = await readData<{ retries: { outcomes: Array<{ jobId: string; outcome: string }> } }>(res);
    expect(data.retries.outcomes).toEqual([expect.objectContaining({ jobId: FAILED_ID, outcome: 'delivered' })]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const item = getDeliveryHistoryStore().find((candidate) => candidate.id === FAILED_ID);
    expect(item?.status).toBe('delivered');
    expect(getWebhookRecovery().metrics().recoveredDeliveries).toBe(1);
  });

  it('keeps a failing retry queued with a backoff instead of looping', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    await RETRY(retryRequest(FAILED_ID) as never);

    await RECOVERY(retryRequest(FAILED_ID) as never);

    const item = getDeliveryHistoryStore().find((candidate) => candidate.id === FAILED_ID);
    expect(item?.status).toBe('queued');
    expect(Date.parse(item!.nextRetryAt!)).toBeGreaterThan(Date.now());
  });

  it('rejects a missing id and an unknown delivery', async () => {
    expect((await RETRY(retryRequest('') as never)).status).toBe(400);
    expect((await RETRY(retryRequest('nope') as never)).status).toBe(404);
  });

  describe('authentication behavior', () => {
    let originalKey: string | undefined;
    let originalAllow: string | undefined;

    beforeEach(() => {
      originalKey = process.env.CRASHLAB_WEBHOOK_API_KEY;
      originalAllow = process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_WEBHOOKS;
    });

    afterEach(() => {
      if (originalKey === undefined) delete process.env.CRASHLAB_WEBHOOK_API_KEY;
      else process.env.CRASHLAB_WEBHOOK_API_KEY = originalKey;
      if (originalAllow === undefined) delete process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_WEBHOOKS;
      else process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_WEBHOOKS = originalAllow;
    });

    it('rejects with 503 when API key is unset and no escape hatch', async () => {
      delete process.env.CRASHLAB_WEBHOOK_API_KEY;
      delete process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_WEBHOOKS;
      const res = await RETRY(retryRequest(FAILED_ID) as never);
      expect(res.status).toBe(503);
    });

    it('allows when API key is unset but escape hatch is enabled', async () => {
      delete process.env.CRASHLAB_WEBHOOK_API_KEY;
      process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_WEBHOOKS = '1';
      const res = await RETRY(retryRequest(FAILED_ID) as never);
      expect(res.status).toBe(202);
    });

    it('rejects with 401 when API key is configured and header is missing', async () => {
      process.env.CRASHLAB_WEBHOOK_API_KEY = 'secret-key';
      delete process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_WEBHOOKS;
      const res = await RETRY(retryRequest(FAILED_ID) as never);
      expect(res.status).toBe(401);
    });

    it('allows when API key is configured and correct token is provided', async () => {
      process.env.CRASHLAB_WEBHOOK_API_KEY = 'secret-key';
      delete process.env.CRASHLAB_ALLOW_UNAUTHENTICATED_WEBHOOKS;
      const req = new Request('http://t/api/webhooks/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer secret-key',
        },
        body: JSON.stringify({ id: FAILED_ID }),
      });
      const res = await RETRY(req as never);
      expect(res.status).toBe(202);
    });
  });
});
