// Mock data for Campaign Milestone Timeline Visualization

import type { MilestoneEvent } from './campaign-milestone-timeline-utils';

export const mockMilestoneEvents: MilestoneEvent[] = [
  {
    id: 'event-1-start',
    type: 'campaign_start',
    timestamp: '10:00:01',
    label: 'Campaign started',
    description: 'Fuzzing campaign ABC123 has begun.',
    severity: 'low',
  },
  {
    id: 'event-2-run1',
    type: 'run_update',
    timestamp: '10:05:12',
    label: 'Run completed',
    description: 'Run 1 completed (area: UI, severity: low).',
    severity: 'low',
    runId: 'run-1',
  },
  {
    id: 'event-3-failure',
    type: 'failure_discovered',
    timestamp: '10:07:45',
    label: 'Failure discovered',
    description: 'Crash in UI (SIGSEGV)',
    severity: 'high',
    runId: 'run-2',
    failureSignature: 'SIGSEGV',
    failureCount: 1,
  },
  {
    id: 'event-4-pause',
    type: 'campaign_pause',
    timestamp: '10:10:00',
    label: 'Timeline paused',
    description: 'Live timeline updates paused by operator.',
    severity: 'medium',
  },
  {
    id: 'event-5-resume',
    type: 'campaign_resume',
    timestamp: '10:15:00',
    label: 'Timeline resumed',
    description: 'Live timeline updates resumed.',
    severity: 'low',
  },
];
