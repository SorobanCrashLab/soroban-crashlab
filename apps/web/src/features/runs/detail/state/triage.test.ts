import { describe, expect, it } from 'vitest';
import { applyTriagePatch, canTransition, triageAuditAction, type TriageRecord } from './triage';

const record: TriageRecord = {
  status: 'open',
  assignee: null,
  priority: 'normal',
  note: '',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('inline triage', () => {
  it('allows declared transitions and rejects illegal ones', () => {
    expect(canTransition('open', 'investigating')).toBe(true);
    expect(canTransition('open', 'confirmed')).toBe(false);
    expect(() => applyTriagePatch(record, { status: 'confirmed' }, 'now')).toThrow('Invalid triage transition');
  });

  it('applies partial patches without dropping existing fields', () => {
    const updated = applyTriagePatch(
      { ...record, assignee: 'alice' },
      { status: 'investigating', priority: 'high' },
      '2026-01-02T00:00:00Z',
    );
    expect(updated).toEqual({
      status: 'investigating',
      assignee: 'alice',
      priority: 'high',
      note: '',
      updatedAt: '2026-01-02T00:00:00Z',
    });
  });

  it('caps notes and derives audit actions', () => {
    const updated = applyTriagePatch(record, { note: 'x'.repeat(3000), status: 'resolved' }, 'now');
    expect(updated.note).toHaveLength(2000);
    expect(triageAuditAction(record, updated)).toBe('triage.status:resolved');
    expect(triageAuditAction(record, record)).toBe('triage.note');
  });
});
