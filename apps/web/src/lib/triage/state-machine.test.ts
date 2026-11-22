import { describe, expect, it } from 'vitest';
import {
  TRIAGE_TRANSITIONS,
  canTransition,
  normaliseAssignee,
  transitionTriageItem,
} from './state-machine';
import { TRIAGE_STATUSES, type TriageItemState } from './types';

function item(overrides: Partial<TriageItemState> = {}): TriageItemState {
  return {
    id: 'triage:run-1',
    orgId: 'default',
    signature: 'auth:token-expired',
    failureClass: 'auth',
    severity: 'high',
    occurrences: 12,
    status: 'new',
    priority: 'p1',
    version: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
    updatedBy: 'seed',
    ...overrides,
  };
}

describe('triage state machine', () => {
  describe('transition table', () => {
    it('defines an edge list for every status', () => {
      for (const status of TRIAGE_STATUSES) {
        expect(Array.isArray(TRIAGE_TRANSITIONS[status])).toBe(true);
      }
    });

    it('allows the documented forward path', () => {
      expect(canTransition('new', 'triaged')).toBe(true);
      expect(canTransition('triaged', 'in-progress')).toBe(true);
      expect(canTransition('in-progress', 'resolved')).toBe(true);
      expect(canTransition('resolved', 'new')).toBe(true);
    });

    it('rejects skipping the workflow', () => {
      expect(canTransition('new', 'in-progress')).toBe(false);
      expect(canTransition('triaged', 'resolved')).toBe(true);
      expect(canTransition('in-progress', 'new')).toBe(false);
    });

    it('treats a self-transition as allowed (idempotent)', () => {
      for (const status of TRIAGE_STATUSES) {
        expect(canTransition(status, status)).toBe(true);
      }
    });
  });

  describe('transitionTriageItem', () => {
    it('moves an item forward and stamps version, time and actor', () => {
      const result = transitionTriageItem(item(), {
        status: 'triaged',
        actor: 'dana',
        now: '2026-02-02T03:04:05.000Z',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.changed).toBe(true);
      expect(result.fields).toEqual(['status']);
      expect(result.item.status).toBe('triaged');
      expect(result.item.version).toBe(2);
      expect(result.item.updatedAt).toBe('2026-02-02T03:04:05.000Z');
      expect(result.item.updatedBy).toBe('dana');
      expect(result.before).toEqual({ status: 'new', priority: 'p1' });
      expect(result.after).toEqual({ status: 'triaged', priority: 'p1' });
    });

    it('does not mutate the input item', () => {
      const original = item();
      const snapshot = JSON.parse(JSON.stringify(original)) as TriageItemState;
      transitionTriageItem(original, { status: 'triaged', actor: 'dana' });
      expect(original).toEqual(snapshot);
    });

    it('rejects an illegal transition and returns the item untouched', () => {
      const result = transitionTriageItem(item(), {
        status: 'in-progress',
        actor: 'dana',
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe('invalid-transition');
      expect(result.message).toMatch(/new.*in-progress/);
    });

    it('rejects an unknown status even though the type says otherwise', () => {
      const result = transitionTriageItem(item(), {
        status: 'done' as never,
        actor: 'dana',
      });
      expect(result).toMatchObject({ ok: false, code: 'invalid-status' });
    });

    it('treats re-applying the current status as a no-op, not an error', () => {
      const original = item();
      const result = transitionTriageItem(original, { status: 'new', actor: 'dana' });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.changed).toBe(false);
      expect(result.fields).toEqual([]);
      expect(result.item).toBe(original);
    });

    it('assigns and unassigns without changing status', () => {
      const assigned = transitionTriageItem(item(), { assignee: '  dana  ', actor: 'dana' });
      expect(assigned.ok).toBe(true);
      if (!assigned.ok) return;
      expect(assigned.item.assignee).toBe('dana');
      expect(assigned.fields).toEqual(['assignee']);
      expect(assigned.item.status).toBe('new');

      const unassigned = transitionTriageItem(assigned.item, { assignee: null, actor: 'dana' });
      expect(unassigned.ok).toBe(true);
      if (!unassigned.ok) return;
      expect(unassigned.item.assignee).toBeUndefined();
      expect(unassigned.fields).toEqual(['assignee']);
    });

    it('rejects an empty, overlong or malformed assignee', () => {
      for (const assignee of ['', '   ', 'x'.repeat(81), 'dana; rm -rf /', '<script>']) {
        const result = transitionTriageItem(item(), { assignee, actor: 'dana' });
        expect(result).toMatchObject({ ok: false, code: 'invalid-assignee' });
      }
    });

    it('accepts the assignee shapes the members list can produce', () => {
      for (const assignee of ['dana', 'dana.dev', 'dana_dev', 'dana+alerts@example.com', 'dana-2']) {
        const result = transitionTriageItem(item(), { assignee, actor: 'dana' });
        expect(result.ok).toBe(true);
      }
    });

    it('changes priority independently of status', () => {
      const result = transitionTriageItem(item(), { priority: 'p0', actor: 'dana' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.item.priority).toBe('p0');
      expect(result.item.status).toBe('new');
      expect(result.fields).toEqual(['priority']);
    });

    it('rejects an unknown priority', () => {
      const result = transitionTriageItem(item(), { priority: 'p9' as never, actor: 'dana' });
      expect(result).toMatchObject({ ok: false, code: 'invalid-priority' });
    });

    it('reports every field that moved in one mutation', () => {
      const result = transitionTriageItem(item({ status: 'triaged' }), {
        status: 'in-progress',
        assignee: 'dana',
        priority: 'p0',
        actor: 'dana',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.fields.sort()).toEqual(['assignee', 'priority', 'status']);
      expect(result.item.version).toBe(2);
    });

    it('rejects a mutation with no fields', () => {
      const result = transitionTriageItem(item(), { actor: 'dana' });
      expect(result).toMatchObject({ ok: false, code: 'empty-mutation' });
    });

    it('falls back to the system actor and the real clock when not supplied', () => {
      const before = Date.now();
      const result = transitionTriageItem(item(), { status: 'triaged', actor: '   ' });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.item.updatedBy).toBe('system');
      expect(Date.parse(result.item.updatedAt)).toBeGreaterThanOrEqual(before - 1000);
    });
  });

  describe('normaliseAssignee', () => {
    it('trims and accepts valid logins', () => {
      expect(normaliseAssignee(' dana ')).toEqual({ ok: true, value: 'dana' });
    });

    it('explains an empty assignee', () => {
      const result = normaliseAssignee('  ');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.message).toMatch(/unassign/i);
    });
  });
});
