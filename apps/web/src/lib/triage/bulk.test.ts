import { describe, expect, it } from 'vitest';
import { AuditLog } from '@/lib/audit/audit-log';
import {
  applyBulkTriage,
  bulkRequestForItem,
  parseBulkTriageRequest,
  type BulkTriageRequest,
} from './bulk';
import { recordTriageAudit } from './audit';
import type { TriageItemState, TriageStatus } from './types';

const NOW = '2026-05-05T12:00:00.000Z';

function item(id: string, overrides: Partial<TriageItemState> = {}): TriageItemState {
  return {
    id,
    orgId: 'default',
    signature: `sig:${id}`,
    failureClass: 'auth',
    severity: 'high',
    occurrences: 10,
    status: 'new',
    priority: 'p1',
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'seed',
    ...overrides,
  };
}

function request(overrides: Partial<BulkTriageRequest> = {}): BulkTriageRequest {
  return {
    ids: ['a'],
    actor: 'dana',
    now: NOW,
    ...overrides,
  };
}

describe('triage bulk actions', () => {
  describe('parseBulkTriageRequest', () => {
    it('accepts a minimal valid request and dedupes ids', () => {
      const parsed = parseBulkTriageRequest({
        ids: ['a', 'b', 'a', ' a '],
        actor: '  dana ',
        status: 'triaged',
      });

      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.request.ids).toEqual(['a', 'b']);
      expect(parsed.request.actor).toBe('dana');
      expect(parsed.request.status).toBe('triaged');
    });

    it('rejects a non-object body', () => {
      expect(parseBulkTriageRequest(null)).toMatchObject({ ok: false });
      expect(parseBulkTriageRequest([])).toMatchObject({ ok: false });
      expect(parseBulkTriageRequest('nope')).toMatchObject({ ok: false });
    });

    it('requires at least one id and rejects non-string ids', () => {
      expect(parseBulkTriageRequest({ ids: [], actor: 'dana', status: 'triaged' })).toMatchObject({
        ok: false,
      });
      expect(parseBulkTriageRequest({ ids: ['a', 3], actor: 'dana', status: 'triaged' })).toMatchObject(
        { ok: false },
      );
      expect(parseBulkTriageRequest({ ids: ['  '], actor: 'dana', status: 'triaged' })).toMatchObject({
        ok: false,
      });
    });

    it('bounds the batch size', () => {
      const ids = Array.from({ length: 501 }, (_, index) => `id-${index}`);
      const parsed = parseBulkTriageRequest({ ids, actor: 'dana', status: 'triaged' });
      expect(parsed).toMatchObject({ ok: false });
      if (parsed.ok) return;
      expect(parsed.message).toMatch(/500/);
    });

    it('requires an actor', () => {
      expect(parseBulkTriageRequest({ ids: ['a'], status: 'triaged' })).toMatchObject({ ok: false });
      expect(parseBulkTriageRequest({ ids: ['a'], actor: '  ', status: 'triaged' })).toMatchObject({
        ok: false,
      });
    });

    it('rejects a request with nothing to change', () => {
      expect(parseBulkTriageRequest({ ids: ['a'], actor: 'dana' })).toMatchObject({ ok: false });
    });

    it('validates status, priority and assignee types', () => {
      expect(parseBulkTriageRequest({ ids: ['a'], actor: 'dana', status: 'nope' })).toMatchObject({
        ok: false,
      });
      expect(parseBulkTriageRequest({ ids: ['a'], actor: 'dana', priority: 'p9' })).toMatchObject({
        ok: false,
      });
      expect(parseBulkTriageRequest({ ids: ['a'], actor: 'dana', assignee: 5 })).toMatchObject({
        ok: false,
      });
    });

    it('accepts null as an explicit unassign', () => {
      const parsed = parseBulkTriageRequest({ ids: ['a'], actor: 'dana', assignee: null });
      expect(parsed.ok && parsed.request.assignee).toBeNull();
    });

    it('validates orgId and now when supplied', () => {
      expect(parseBulkTriageRequest({ ids: ['a'], actor: 'dana', status: 'triaged', orgId: '' })).toMatchObject(
        { ok: false },
      );
      expect(
        parseBulkTriageRequest({ ids: ['a'], actor: 'dana', status: 'triaged', now: 'yesterday' }),
      ).toMatchObject({ ok: false });
    });
  });

  describe('applyBulkTriage', () => {
    it('applies a partial batch and reports every outcome', () => {
      const items = [item('a'), item('b', { status: 'resolved' }), item('c')];
      const result = applyBulkTriage(
        items,
        request({ ids: ['a', 'b', 'missing'], status: 'triaged' }),
      );

      expect(result.updated.map((row) => row.id)).toEqual(['a']);
      expect(result.failed.map((row) => row.id).sort()).toEqual(['b', 'missing']);
      expect(result.failed.find((row) => row.id === 'missing')?.code).toBe('not-found');
      expect(result.failed.find((row) => row.id === 'b')?.code).toBe('invalid-transition');
      expect(result.progress).toEqual({
        requested: 3,
        updated: 1,
        unchanged: 0,
        failed: 2,
        percentComplete: 33,
      });
    });

    it('returns the full collection with successful mutations applied', () => {
      const items = [item('a'), item('b')];
      const result = applyBulkTriage(items, request({ ids: ['a'], status: 'triaged' }));

      expect(result.items).toHaveLength(2);
      expect(result.items.find((row) => row.id === 'a')?.status).toBe('triaged');
      expect(result.items.find((row) => row.id === 'b')?.status).toBe('new');
      // The input collection is untouched.
      expect(items[0]?.status).toBe('new');
    });

    it('counts an idempotent re-apply as unchanged, not failed', () => {
      const items = [item('a', { status: 'triaged' })];
      const result = applyBulkTriage(items, request({ ids: ['a'], status: 'triaged' }));

      expect(result.updated).toEqual([]);
      expect(result.failed).toEqual([]);
      expect(result.unchanged.map((row) => row.id)).toEqual(['a']);
      expect(result.audit).toEqual([]);
      expect(result.progress.percentComplete).toBe(100);
    });

    it('refuses to touch an item from another organisation', () => {
      const items = [item('a', { orgId: 'other' })];
      const result = applyBulkTriage(items, request({ ids: ['a'], orgId: 'default', status: 'triaged' }));

      expect(result.updated).toEqual([]);
      expect(result.failed[0]).toMatchObject({ id: 'a', code: 'forbidden' });
    });

    it('unassigns in bulk', () => {
      const items = [item('a', { assignee: 'dana' })];
      const result = applyBulkTriage(items, request({ ids: ['a'], assignee: null }));

      expect(result.updated[0]?.assignee).toBeUndefined();
    });

    it('emits one audit record per changed item with before and after', () => {
      const items = [item('a'), item('b')];
      const result = applyBulkTriage(items, request({ ids: ['a', 'b'], status: 'triaged' }));

      expect(result.audit).toHaveLength(2);
      expect(result.audit[0]).toMatchObject({
        action: 'triage.status',
        itemId: 'a',
        actor: 'dana',
        at: NOW,
        before: { status: 'new', priority: 'p1' },
        after: { status: 'triaged', priority: 'p1' },
        orgId: 'default',
      });
    });

    it('labels assign and priority changes distinctly', () => {
      const assigned = applyBulkTriage([item('a')], request({ ids: ['a'], assignee: 'dana' }));
      expect(assigned.audit[0]?.action).toBe('triage.assign');

      const prioritised = applyBulkTriage([item('a')], request({ ids: ['a'], priority: 'p0' }));
      expect(prioritised.audit[0]?.action).toBe('triage.priority');

      const both = applyBulkTriage(
        [item('a')],
        request({ ids: ['a'], assignee: 'dana', priority: 'p0' }),
      );
      expect(both.audit[0]?.action).toBe('triage.bulk');
    });

    it('does not emit audit records for failures or no-ops', () => {
      const result = applyBulkTriage(
        [item('a', { status: 'triaged' }), item('b', { status: 'resolved' })],
        request({ ids: ['a', 'b'], status: 'triaged' }),
      );
      expect(result.audit).toEqual([]);
    });

    it('builds a single-item request helper with the same shape', () => {
      const built = bulkRequestForItem('a', { actor: 'dana', status: 'triaged' });
      expect(built.ids).toEqual(['a']);
      expect(built.status).toBe('triaged');
    });
  });

  describe('audit sink', () => {
    it('appends actor, target and before/after to the audit log', () => {
      const log = new AuditLog({ now: () => new Date('2026-06-06T00:00:00.000Z') });
      const result = applyBulkTriage([item('a')], request({ ids: ['a'], status: 'triaged' }));

      const entries = recordTriageAudit(result.audit, log);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        action: 'triage.status',
        target: 'a',
        actor: 'dana',
        timestamp: '2026-06-06T00:00:00.000Z',
        metadata: {
          before: { status: 'new', priority: 'p1' },
          after: { status: 'triaged', priority: 'p1' },
        },
        orgId: 'default',
      });
      expect(log.verify().status).toBe('intact');
    });
  });

  describe('status coverage', () => {
    it('walks the full forward path and the reopen edge', () => {
      const steps: Array<[TriageStatus, TriageStatus]> = [
        ['new', 'triaged'],
        ['triaged', 'in-progress'],
        ['in-progress', 'resolved'],
        ['resolved', 'new'],
      ];

      for (const [from, to] of steps) {
        const result = applyBulkTriage([item('a', { status: from })], request({ ids: ['a'], status: to }));
        expect(result.updated[0]?.status).toBe(to);
        expect(result.failed).toEqual([]);
      }
    });
  });
});
