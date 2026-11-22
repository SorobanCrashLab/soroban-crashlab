import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildCampaignTimelineFor,
  getCampaign,
  markCampaignStatus,
  recordCampaignFailure,
  recordCampaignMarker,
  recordCampaignSample,
  registerCampaign,
  resetCampaignRegistry,
} from './campaign-registry';

const START = '2026-10-19T00:00:00.000Z';

beforeEach(() => resetCampaignRegistry());

describe('campaign registry', () => {
  it('registers a campaign with a start marker', () => {
    const record = registerCampaign({
      id: 'campaign-1',
      name: 'Nightly sweep',
      createdAt: START,
      target: { seeds: 1_000, workers: 4 },
    });

    expect(record).not.toBeNull();
    expect(getCampaign('campaign-1')?.name).toBe('Nightly sweep');
    expect(record?.markers).toHaveLength(1);
    expect(record?.markers[0]).toMatchObject({
      kind: 'campaign_start',
      at: START,
      label: 'Campaign started',
    });
  });

  it('rejects blank ids and refreshes metadata without losing samples', () => {
    expect(registerCampaign({ id: '   ' })).toBeNull();

    registerCampaign({ id: 'campaign-2', createdAt: START });
    recordCampaignSample('campaign-2', { at: START, seeds: 10, failures: 0 });
    const updated = registerCampaign({ id: 'campaign-2', status: 'running', name: 'Renamed' });

    expect(updated?.status).toBe('running');
    expect(updated?.name).toBe('Renamed');
    expect(updated?.samples).toHaveLength(1);
    expect(updated?.markers).toHaveLength(1);
  });

  it('ignores samples, markers and failures for unknown campaigns', () => {
    expect(recordCampaignSample('missing', { at: START, seeds: 1, failures: 0 })).toBeNull();
    expect(recordCampaignMarker('missing', { kind: 'checkpoint', at: START, label: 'x' })).toBeNull();
    expect(
      recordCampaignFailure('missing', { at: START, signature: 'SIG' }),
    ).toBeNull();
    expect(buildCampaignTimelineFor('missing')).toBeNull();
  });

  it('turns sample signatures into failure points and deduplicates them', () => {
    registerCampaign({ id: 'campaign-3', createdAt: START });
    recordCampaignSample('campaign-3', {
      at: START,
      seeds: 20,
      failures: 2,
      signatures: ['SIG-A', 'SIG-A', 'SIG-B'],
    });
    recordCampaignSample('campaign-3', {
      at: START,
      seeds: 5,
      failures: 0,
      signatures: ['SIG-A', 'SIG-B'],
    });

    const record = getCampaign('campaign-3');
    expect(record?.failures.map((failure) => failure.signature)).toEqual(['SIG-A', 'SIG-B']);
    expect(record?.lastSampleAt).toBe(START);
  });

  it('keeps explicit crash points (run ids and severities) for click-through', () => {
    registerCampaign({ id: 'campaign-4', createdAt: START });
    recordCampaignSample('campaign-4', {
      at: START,
      seeds: 50,
      failures: 1,
      crashes: [{ id: 'crash-1', signature: 'SIGSEGV', runId: 'run-9', severity: 'high' }],
    });

    expect(getCampaign('campaign-4')?.failures).toEqual([
      { id: 'crash-1', at: START, signature: 'SIGSEGV', runId: 'run-9', severity: 'high' },
    ]);
  });

  it('de-duplicates markers by id and records lifecycle transitions', () => {
    registerCampaign({ id: 'campaign-5', createdAt: START });
    recordCampaignMarker('campaign-5', {
      id: 'cp-1',
      kind: 'checkpoint',
      at: '2026-10-19T00:10:00.000Z',
      label: 'Checkpoint 1',
    });
    recordCampaignMarker('campaign-5', {
      id: 'cp-1',
      kind: 'checkpoint',
      at: '2026-10-19T00:10:00.000Z',
      label: 'Duplicate',
    });
    markCampaignStatus('campaign-5', 'running', '2026-10-19T00:01:00.000Z');
    markCampaignStatus('campaign-5', 'paused', '2026-10-19T00:20:00.000Z');

    const record = getCampaign('campaign-5');
    expect(record?.markers.map((marker) => marker.kind)).toEqual([
      'campaign_start',
      'checkpoint',
      'campaign_resume',
      'campaign_pause',
    ]);
    expect(record?.status).toBe('paused');
    expect(record?.startedAt).toBe('2026-10-19T00:01:00.000Z');
  });

  it('serves a downsampled series with campaign metadata', () => {
    registerCampaign({ id: 'campaign-6', name: 'Deep run', createdAt: START, status: 'running' });
    for (let minute = 0; minute < 120; minute += 1) {
      recordCampaignSample('campaign-6', {
        at: new Date(Date.parse(START) + minute * 60_000).toISOString(),
        seeds: 100,
        failures: minute === 45 ? 3 : 0,
        signatures: minute === 45 ? ['SIG-X'] : [],
      });
    }

    const series = buildCampaignTimelineFor('campaign-6', { buckets: 24 });
    expect(series?.campaign).toMatchObject({ id: 'campaign-6', name: 'Deep run', status: 'running' });
    expect(series?.bucketCount).toBe(24);
    expect(series?.downsampled).toBe(true);
    expect(series?.summary.seeds).toBe(12_000);
    expect(series?.summary.failures).toBe(3);
    expect(series?.failures).toHaveLength(1);
  });

  it('drops invalid timestamps instead of writing them to the store', () => {
    registerCampaign({ id: 'campaign-7', createdAt: START });
    recordCampaignSample('campaign-7', { at: 'yesterday', seeds: 1, failures: 0 });
    recordCampaignMarker('campaign-7', { kind: 'checkpoint', at: 'later', label: 'x' });

    expect(getCampaign('campaign-7')?.samples).toHaveLength(0);
    expect(getCampaign('campaign-7')?.markers).toHaveLength(1);
  });
});
