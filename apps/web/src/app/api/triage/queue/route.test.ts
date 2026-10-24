import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { InMemoryRecordDriver, setRecordDriver } from '@/lib/storage/record-driver';
import { GET, POST } from './route';
import type { TriageItemState } from '@/lib/triage/types';

interface QueueBody {
  data: {
    items: TriageItemState[];
    counts: Record<string, number>;
    orgId: string;
  };
}

interface BulkBody {
  data: {
    updated: TriageItemState[];
    unchanged: TriageItemState[];
    failed: Array<{ id: string; code: string }>;
    progress: { requested: number; updated: number; failed: number; percentComplete: number };
    audit: { appended: number };
  };
}

function getRequest(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/triage/queue${query}`);
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/triage/queue', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('/api/triage/queue', () => {
  beforeEach(() => {
    setRecordDriver(new InMemoryRecordDriver());
  });

  it('seeds and returns the default queue on first read', async () => {
    const response = await GET(getRequest());
    expect(response.status).toBe(200);

    const body = (await response.json()) as QueueBody;
    expect(body.data.items.length).toBeGreaterThan(0);
    expect(body.data.orgId).toBe('default');
    expect(body.data.counts.new).toBe(body.data.items.length);
    // Priority-first ordering: ranks are non-decreasing across the list.
    const rank: Record<string, number> = { p0: 0, p1: 1, p2: 2, p3: 3 };
    const ranks = body.data.items.map((item) => rank[item.priority] ?? 99);
    for (let index = 1; index < ranks.length; index += 1) {
      expect(ranks[index - 1]).toBeLessThanOrEqual(ranks[index] ?? 99);
    }
  });

  it('is idempotent: a second read does not duplicate the seed', async () => {
    const first = (await (await GET(getRequest())).json()) as QueueBody;
    const second = (await (await GET(getRequest())).json()) as QueueBody;
    expect(second.data.items.map((item) => item.id).sort()).toEqual(
      first.data.items.map((item) => item.id).sort(),
    );
  });

  it('persists a bulk status change across requests', async () => {
    const seeded = (await (await GET(getRequest())).json()) as QueueBody;
    const targets = seeded.data.items.filter((item) => item.status === 'new').slice(0, 2);
    expect(targets.length).toBe(2);

    const response = await POST(
      postRequest({
        ids: targets.map((item) => item.id),
        status: 'triaged',
        actor: 'dana',
      }),
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as BulkBody;
    expect(body.data.updated).toHaveLength(2);
    expect(body.data.progress).toMatchObject({ requested: 2, updated: 2, failed: 0, percentComplete: 100 });
    expect(body.data.audit.appended).toBe(2);

    const after = (await (await GET(getRequest())).json()) as QueueBody;
    for (const target of targets) {
      expect(after.data.items.find((item) => item.id === target.id)?.status).toBe('triaged');
    }
    expect(after.data.counts.triaged).toBe(2);
  });

  it('reports partial failure without failing the request', async () => {
    const seeded = (await (await GET(getRequest())).json()) as QueueBody;
    const first = seeded.data.items[0];
    expect(first).toBeDefined();
    if (!first) return;

    const response = await POST(
      postRequest({
        ids: [first.id, 'does-not-exist'],
        assignee: 'dana',
        actor: 'dana',
      }),
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as BulkBody;
    expect(body.data.updated).toHaveLength(1);
    expect(body.data.failed).toEqual([{ id: 'does-not-exist', code: 'not-found', message: expect.any(String) }]);
    expect(body.data.progress.percentComplete).toBe(50);
  });

  it('rejects a malformed body with 400', async () => {
    const invalidJson = await POST(postRequest('{not json'));
    expect(invalidJson.status).toBe(400);

    const empty = await POST(postRequest({ ids: [], actor: 'dana', status: 'triaged' }));
    expect(empty.status).toBe(400);

    const noActor = await POST(postRequest({ ids: ['x'], status: 'triaged' }));
    expect(noActor.status).toBe(400);
  });

  it('rejects an invalid transition per item rather than as a request error', async () => {
    const seeded = (await (await GET(getRequest())).json()) as QueueBody;
    const target = seeded.data.items.find((item) => item.status === 'new');
    expect(target).toBeDefined();
    if (!target) return;

    const response = await POST(
      postRequest({ ids: [target.id], status: 'in-progress', actor: 'dana' }),
    );
    expect(response.status).toBe(200);

    const body = (await response.json()) as BulkBody;
    expect(body.data.updated).toEqual([]);
    expect(body.data.failed[0]).toMatchObject({ id: target.id, code: 'invalid-transition' });
    expect(body.data.audit.appended).toBe(0);
  });

  it('scopes reads to the requested organisation', async () => {
    const response = await GET(getRequest('?orgId=other'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as QueueBody;
    expect(body.data.items).toEqual([]);
    expect(body.data.counts.new).toBe(0);
  });
});
