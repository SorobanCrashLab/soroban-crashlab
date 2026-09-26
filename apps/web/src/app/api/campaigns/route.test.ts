import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST } from './route';
import {
  InMemoryIdempotencyStore,
  resetIdempotencyStore,
} from '@/lib/storage/idempotency-store';

const CONFIG = { seedSource: 'random', authMode: 'none', parallelism: 4, timeoutSeconds: 3600 };

function createRequest(body: unknown, key?: string): Request {
  return new Request('http://t/api/campaigns', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key === undefined ? {} : { 'Idempotency-Key': key }),
    },
    body: JSON.stringify(body),
  });
}

async function campaignId(res: Response): Promise<string> {
  const body = (await res.json()) as { data: { campaign: { id: string } } };
  return body.data.campaign.id;
}

beforeEach(() => resetIdempotencyStore(new InMemoryIdempotencyStore()));
afterEach(() => resetIdempotencyStore());

describe('POST /api/campaigns — idempotency (#1634)', () => {
  it('creates a campaign with 201 on the first request for a key', async () => {
    const res = await POST(createRequest(CONFIG, 'key-1') as never);

    expect(res.status).toBe(201);
    expect(res.headers.get('Idempotent-Replayed')).toBe('false');
    expect(res.headers.get('Idempotency-Key')).toBe('key-1');
  });

  it('replays the original campaign with 200 when the same key is retried', async () => {
    const first = await POST(createRequest(CONFIG, 'key-1') as never);
    const retry = await POST(createRequest(CONFIG, 'key-1') as never);

    expect(retry.status).toBe(200);
    expect(retry.headers.get('Idempotent-Replayed')).toBe('true');
    expect(await campaignId(retry)).toBe(await campaignId(first));
  });

  it('treats a reordered but identical payload as the same request', async () => {
    const first = await POST(createRequest(CONFIG, 'key-1') as never);
    const reordered = { timeoutSeconds: 3600, parallelism: 4, authMode: 'none', seedSource: 'random' };
    const retry = await POST(createRequest(reordered, 'key-1') as never);

    expect(retry.status).toBe(200);
    expect(await campaignId(retry)).toBe(await campaignId(first));
  });

  it('creates a new campaign for a different key', async () => {
    const first = await POST(createRequest(CONFIG, 'key-1') as never);
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await POST(createRequest(CONFIG, 'key-2') as never);

    expect(second.status).toBe(201);
    expect(await campaignId(second)).not.toBe(await campaignId(first));
  });

  it('rejects the same key with a different payload with 422', async () => {
    await POST(createRequest(CONFIG, 'key-1') as never);
    const collision = await POST(createRequest({ ...CONFIG, parallelism: 16 }, 'key-1') as never);

    expect(collision.status).toBe(422);
    expect(await collision.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
  });

  it('rejects a malformed key with 400', async () => {
    const res = await POST(createRequest(CONFIG, 'x'.repeat(256)) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'IDEMPOTENCY_KEY_INVALID' });
  });

  it('dedupes concurrent requests racing on the same key', async () => {
    const [a, b] = await Promise.all([
      POST(createRequest(CONFIG, 'race') as never),
      POST(createRequest(CONFIG, 'race') as never),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(await campaignId(a)).toBe(await campaignId(b));
  });

  it('keeps the legacy behaviour when no key is sent', async () => {
    const res = await POST(createRequest(CONFIG) as never);

    expect(res.status).toBe(201);
    expect(res.headers.get('Idempotent-Replayed')).toBeNull();
  });
});
