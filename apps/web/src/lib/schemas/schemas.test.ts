/**
 * Schema unit tests for issue #1384.
 *
 * Each endpoint's schema is exercised with:
 *   1. A valid round-trip (parse → infer types → data matches input).
 *   2. Representative rejection cases covering the key validation rules.
 */

import { describe, it, expect } from 'vitest';
import {
  RunsListRequestSchema,
  RunsListResponseSchema,
  RunDetailResponseSchema,
  WebhookHistoryRequestSchema,
  WebhookHistoryResponseSchema,
  FuzzingRunSchema,
} from './runs';
import { zodParseRequest } from './parse';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 'run-1',
    status: 'completed',
    area: 'auth',
    severity: 'low',
    duration: 1000,
    seedCount: 42,
    crashDetail: null,
    cpuInstructions: 9999,
    memoryBytes: 1024,
    minResourceFee: 100,
    ...overrides,
  };
}

function makeDeliveryItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'del_1',
    webhookId: 'wh_1',
    url: 'https://example.com/hook',
    eventType: 'run.completed',
    status: 'delivered',
    attempts: 1,
    maxAttempts: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    payload: { event: 'run.completed' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// GET /api/runs — RunsListRequestSchema
// ---------------------------------------------------------------------------

describe('RunsListRequestSchema', () => {
  it('accepts empty params (all optional)', () => {
    const result = RunsListRequestSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('round-trips valid status + limit', () => {
    const result = RunsListRequestSchema.safeParse({ status: 'failed', limit: '20' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('failed');
      expect(result.data.limit).toBe(20); // transformed to number
    }
  });

  it('rejects unknown status values', () => {
    const result = RunsListRequestSchema.safeParse({ status: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('rejects non-numeric limit strings', () => {
    const result = RunsListRequestSchema.safeParse({ limit: 'abc' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('limit');
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/runs — RunsListResponseSchema
// ---------------------------------------------------------------------------

describe('RunsListResponseSchema', () => {
  it('round-trips a valid runs list response', () => {
    const input = { runs: [makeRun()], total: 1 };
    const result = RunsListResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.runs).toHaveLength(1);
      expect(result.data.total).toBe(1);
    }
  });

  it('accepts empty runs array', () => {
    const result = RunsListResponseSchema.safeParse({ runs: [], total: 0 });
    expect(result.success).toBe(true);
  });

  it('rejects missing total', () => {
    const result = RunsListResponseSchema.safeParse({ runs: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a run with an invalid status', () => {
    const result = RunsListResponseSchema.safeParse({
      runs: [makeRun({ status: 'unknown' })],
      total: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('status'))).toBe(true);
    }
  });

  it('accepts a run with crashDetail populated', () => {
    const run = makeRun({
      crashDetail: {
        failureCategory: 'auth',
        signature: 'sig-abc',
        payload: 'deadbeef',
        replayAction: 'soroban invoke ...',
      },
    });
    const result = RunsListResponseSchema.safeParse({ runs: [run], total: 1 });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/runs/[id] — RunDetailResponseSchema
// ---------------------------------------------------------------------------

describe('RunDetailResponseSchema', () => {
  it('round-trips a complete run object', () => {
    const run = makeRun({ tags: ['tag1'], annotations: ['note'], associatedIssues: [] });
    const result = RunDetailResponseSchema.safeParse(run);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('run-1');
    }
  });

  it('rejects a run missing required fields', () => {
    const { id: _id, ...withoutId } = makeRun();
    const result = RunDetailResponseSchema.safeParse(withoutId);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('id');
    }
  });

  it('rejects invalid severity', () => {
    const result = RunDetailResponseSchema.safeParse(makeRun({ severity: 'extreme' }));
    expect(result.success).toBe(false);
  });

  it('accepts a run with optional fields absent', () => {
    const result = FuzzingRunSchema.safeParse(makeRun());
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/webhooks/history — WebhookHistoryRequestSchema
// ---------------------------------------------------------------------------

describe('WebhookHistoryRequestSchema', () => {
  it('defaults status to "all" and search to empty string', () => {
    const result = WebhookHistoryRequestSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('all');
      expect(result.data.search).toBe('');
    }
  });

  it('accepts valid status filter values', () => {
    for (const s of ['all', 'delivered', 'failed', 'queued']) {
      const result = WebhookHistoryRequestSchema.safeParse({ status: s });
      expect(result.success).toBe(true);
    }
  });

  it('rejects unknown status filter', () => {
    const result = WebhookHistoryRequestSchema.safeParse({ status: 'pending' });
    expect(result.success).toBe(false);
  });

  it('round-trips a search param', () => {
    const result = WebhookHistoryRequestSchema.safeParse({ status: 'failed', search: 'discord' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.search).toBe('discord');
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/webhooks/history — WebhookHistoryResponseSchema
// ---------------------------------------------------------------------------

describe('WebhookHistoryResponseSchema', () => {
  const stats = {
    totalCount: 1,
    deliveredCount: 1,
    failedCount: 0,
    queuedCount: 0,
    successRate: 100,
    averageAttempts: 1,
  };

  it('round-trips a valid history response', () => {
    const input = { items: [makeDeliveryItem()], stats, total: 1 };
    const result = WebhookHistoryResponseSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  it('accepts empty items array', () => {
    const result = WebhookHistoryResponseSchema.safeParse({
      items: [],
      stats: { ...stats, totalCount: 0, deliveredCount: 0, successRate: 100 },
      total: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an item with invalid event type', () => {
    const result = WebhookHistoryResponseSchema.safeParse({
      items: [makeDeliveryItem({ eventType: 'run.unknown' })],
      stats,
      total: 1,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths.some((p) => p.includes('eventType'))).toBe(true);
    }
  });

  it('rejects missing stats', () => {
    const result = WebhookHistoryResponseSchema.safeParse({ items: [], total: 0 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// zodParseRequest helper
// ---------------------------------------------------------------------------

describe('zodParseRequest', () => {
  it('returns ok:true with parsed data on valid input', async () => {
    const result = zodParseRequest(RunsListRequestSchema, { status: 'running', limit: '5' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe('running');
      expect(result.data.limit).toBe(5);
    }
  });

  it('returns ok:false with a 400 NextResponse on invalid input', async () => {
    const result = zodParseRequest(RunsListRequestSchema, { status: 'invalid' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const body = await result.response.json();
      expect(body.error).toBeDefined();
      expect(body.fieldErrors).toBeDefined();
      expect(body.fieldErrors.status).toBeDefined();
    }
  });

  it('includes field paths in fieldErrors', async () => {
    const result = zodParseRequest(RunsListResponseSchema, {
      runs: [makeRun({ status: 'bad' })],
      total: 'not-a-number',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const body = await result.response.json();
      const paths = Object.keys(body.fieldErrors);
      // Should contain paths for both invalid fields
      expect(paths.length).toBeGreaterThan(0);
    }
  });
});
