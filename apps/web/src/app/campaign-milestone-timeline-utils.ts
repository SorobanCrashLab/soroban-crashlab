import type { FuzzingRun, RunSeverity } from './types';

export type MilestoneEventType =
  | 'campaign_start'
  | 'campaign_pause'
  | 'campaign_resume'
  | 'failure_discovered'
  | 'run_update';

export interface MilestoneEvent {
  id: string;
  type: MilestoneEventType;
  timestamp: string;
  label: string;
  description: string;
  severity?: RunSeverity;
  runId?: string;
  failureSignature?: string;
  failureCount?: number;
}

export function sortRunsForTimeline(runs: FuzzingRun[]): FuzzingRun[] {
  return [...runs].sort((a, b) => {
    const aTime =
      Date.parse(a.queuedAt ?? '') || Date.parse(a.startedAt ?? '') || Date.parse(a.finishedAt ?? '') || 0;
    const bTime =
      Date.parse(b.queuedAt ?? '') || Date.parse(b.startedAt ?? '') || Date.parse(b.finishedAt ?? '') || 0;
    return aTime - bTime;
  });
}

function toTimelineTimeLabel(value?: string): string {
  if (!value) {
    return new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  return parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function buildCampaignLifecycleEvent(
  campaignId: string,
  type: 'campaign_start' | 'campaign_pause' | 'campaign_resume',
): MilestoneEvent {
  const now = new Date().toISOString();

  if (type === 'campaign_start') {
    return {
      id: `event-${campaignId}-start`,
      type,
      timestamp: toTimelineTimeLabel(now),
      label: 'Campaign started',
      description: `Fuzzing campaign ${campaignId} is now tracking run milestones.`,
      severity: 'low',
    };
  }

  if (type === 'campaign_pause') {
    return {
      id: `event-${Date.now()}-pause`,
      type,
      timestamp: toTimelineTimeLabel(now),
      label: 'Timeline paused',
      description: 'Live timeline updates paused by operator.',
      severity: 'medium',
    };
  }

  return {
    id: `event-${Date.now()}-resume`,
    type,
    timestamp: toTimelineTimeLabel(now),
    label: 'Timeline resumed',
    description: 'Live timeline updates resumed.',
    severity: 'low',
  };
}

export function buildRunProgressEvent(
  run: FuzzingRun,
  knownFailureSignatures: Set<string>,
): MilestoneEvent {
  const timeLabel = toTimelineTimeLabel(run.finishedAt ?? run.startedAt ?? run.queuedAt);

  if (run.status === 'failed' && run.crashDetail) {
    const signature = run.crashDetail.signature;
    const isNewSignature = !knownFailureSignatures.has(signature);

    return {
      id: `event-${run.id}-failure`,
      type: 'failure_discovered',
      timestamp: timeLabel,
      label: isNewSignature ? 'Failure discovered' : 'Failure re-observed',
      description: `${run.crashDetail.failureCategory} in ${run.area} (${signature})`,
      severity: run.severity,
      runId: run.id,
      failureSignature: signature,
      failureCount: 1,
    };
  }

  const runStatusLabel =
    run.status === 'running'
      ? 'Run queued'
      : run.status === 'completed'
        ? 'Run completed'
        : run.status === 'cancelled'
          ? 'Run cancelled'
          : 'Run updated';

  return {
    id: `event-${run.id}-status-${run.status}`,
    type: 'run_update',
    timestamp: timeLabel,
    label: runStatusLabel,
    description: `${run.id} is ${run.status} (${run.area}, ${run.severity}).`,
    severity: run.severity,
    runId: run.id,
  };
}

export function selectNextUnseenRun(runs: FuzzingRun[], seenRunIds: string[]): FuzzingRun | null {
  const seen = new Set(seenRunIds);
  return runs.find((run) => !seen.has(run.id)) ?? null;
}

export function prependCappedEvent(
  events: MilestoneEvent[],
  event: MilestoneEvent,
  maxEventsDisplayed: number,
): MilestoneEvent[] {
  return [event, ...events].slice(0, maxEventsDisplayed);
}
