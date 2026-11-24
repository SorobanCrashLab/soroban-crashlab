import { describe, expect, it } from 'vitest';
import {
  createEvidenceRef,
  evidenceSourceUrl,
  MockEntityResolver,
  pinEvidence,
  resolveAllEvidence,
  resolveEvidence,
  unpinEvidence,
} from './embeds';
import type { EntitySnapshot, ReportDocument } from './types';

const original: EntitySnapshot = {
  id: 'run-001',
  type: 'run',
  title: 'Run 001',
  status: 'running',
  timestamp: '2026-11-21T10:00:00Z',
  sourceUrl: '/runs/run-001',
  summary: 'initial',
};

function documentWith(ref = createEvidenceRef('run', 'run-001', { id: 'ev-1' })): ReportDocument {
  return {
    schemaVersion: 1,
    id: 'report-1',
    title: 'Report',
    markdown: '',
    revision: 1,
    updatedAt: '2026-11-21T10:00:00Z',
    embeds: { [ref.id]: ref },
    comments: [],
  };
}

describe('evidence embed resolution', () => {
  it('captures a snapshot at pin time and ignores later live changes', async () => {
    const resolver = new MockEntityResolver([original]);
    const live = createEvidenceRef('run', 'run-001', { id: 'ev-1' });
    expect((await resolveEvidence(live, resolver))?.status).toBe('running');

    const pinned = pinEvidence(live, original);
    resolver.upsert({ ...original, status: 'failed', summary: 'updated' });

    expect(pinned.mode).toBe('pinned');
    expect((await resolveEvidence(pinned, resolver))?.status).toBe('running');
    expect((await resolveEvidence(live, resolver))?.status).toBe('failed');
  });

  it('rejects a mismatched snapshot', () => {
    expect(() => pinEvidence(createEvidenceRef('run', 'run-001'), { ...original, id: 'run-999' })).toThrow();
  });

  it('returns to live mode when unpinned', async () => {
    const resolver = new MockEntityResolver([{ ...original, status: 'failed' }]);
    const live = unpinEvidence(pinEvidence(createEvidenceRef('run', 'run-001'), original));
    expect((await resolveEvidence(live, resolver))?.status).toBe('failed');
  });

  it('resolves all document embeds keyed by block id', async () => {
    const resolver = new MockEntityResolver([original]);
    const resolved = await resolveAllEvidence(documentWith(), resolver);
    expect(resolved['ev-1']).toMatchObject({ id: 'run-001' });
  });

  it('refuses unsafe source URLs', () => {
    expect(evidenceSourceUrl(original)).toBe('/runs/run-001');
    expect(evidenceSourceUrl({ ...original, sourceUrl: 'javascript:alert(1)' })).toBeNull();
  });
});
