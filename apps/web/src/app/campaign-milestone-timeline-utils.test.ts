import {
  buildCampaignLifecycleEvent,
  buildRunProgressEvent,
  prependCappedEvent,
  selectNextUnseenRun,
  sortRunsForTimeline,
} from './campaign-milestone-timeline-utils';
import { buildMockRuns } from './mockRuns';
import { createReplayPlaceholderRun } from './replay-ui-utils';

describe('campaign-milestone-timeline-utils', () => {
  it('sortRunsForTimeline orders runs by queued/started/finished timestamps ascending', () => {
    const runs = buildMockRuns().slice(0, 3);
    const sorted = sortRunsForTimeline([runs[2], runs[0], runs[1]]);
    const queuedTimes = sorted.map((run) => Date.parse(run.queuedAt ?? ''));

    expect(queuedTimes[0]).toBeLessThanOrEqual(queuedTimes[1]);
    expect(queuedTimes[1]).toBeLessThanOrEqual(queuedTimes[2]);
  });

  it('buildRunProgressEvent maps failed run to failure_discovered event', () => {
    const failedRun = buildMockRuns().find((run) => run.status === 'failed');
    expect(failedRun).toBeDefined();

    const event = buildRunProgressEvent(failedRun!, new Set());

    expect(event.type).toBe('failure_discovered');
    expect(event.runId).toBe(failedRun!.id);
    expect(event.failureSignature).toBe(failedRun!.crashDetail?.signature);
    expect(event.label).toBe('Failure discovered');
  });

  it('buildRunProgressEvent marks repeated signature as re-observed', () => {
    const failedRun = buildMockRuns().find((run) => run.status === 'failed');
    expect(failedRun?.crashDetail?.signature).toBeDefined();

    const known = new Set<string>([failedRun!.crashDetail!.signature]);
    const event = buildRunProgressEvent(failedRun!, known);

    expect(event.type).toBe('failure_discovered');
    expect(event.label).toBe('Failure re-observed');
  });

  it('selectNextUnseenRun returns the first unseen run and null when exhausted', () => {
    const runs = sortRunsForTimeline(buildMockRuns().slice(0, 2));

    const next = selectNextUnseenRun(runs, []);
    expect(next?.id).toBe(runs[0].id);

    const noneLeft = selectNextUnseenRun(runs, runs.map((run) => run.id));
    expect(noneLeft).toBeNull();
  });

  it('prependCappedEvent prepends and caps to max events displayed', () => {
    const a = buildCampaignLifecycleEvent('campaign-001', 'campaign_start');
    const b = buildCampaignLifecycleEvent('campaign-001', 'campaign_pause');
    const c = buildCampaignLifecycleEvent('campaign-001', 'campaign_resume');

    const events = prependCappedEvent(prependCappedEvent([a], b, 2), c, 2);

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('campaign_resume');
    expect(events[1].type).toBe('campaign_pause');
  });

  it('integration: replay placeholder run can flow into run_update milestone', () => {
    const replayRun = createReplayPlaceholderRun({ id: 'run-replay-1', status: 'running' });
    const runs = sortRunsForTimeline([...buildMockRuns().slice(0, 3), replayRun]);

    const selected = selectNextUnseenRun(runs, runs.filter((run) => run.id !== replayRun.id).map((run) => run.id));
    const event = buildRunProgressEvent(selected!, new Set());

    expect(selected?.id).toBe('run-replay-1');
    expect(event.type).toBe('run_update');
    expect(event.label).toBe('Run queued');
  });
});
