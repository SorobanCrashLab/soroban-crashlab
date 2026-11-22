import type { DlqEntry } from '../lib/webhook-dlq';

/**
 * Sample dead-letter entries for the DLQ browser (#1427), matching the mock
 * data the rest of the webhook surfaces render.
 */

const hoursAgo = (hours: number): string =>
  new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

const daysAgo = (days: number): string => hoursAgo(days * 24);

export const MOCK_DLQ_ENTRIES: DlqEntry[] = [
  {
    id: 'dlq-del_2001',
    requestId: 'del_2001',
    endpoint: 'https://hooks.example.com/crashlab/prod',
    eventType: 'crash.detected',
    payload: { runId: 'run-1042', cluster: 'cluster-7', severity: 'critical' },
    headers: { 'X-Webhook-Event': 'crash.detected' },
    reason: 'retries-exhausted',
    errorTimeline: [
      { attempt: 1, statusCode: 503, error: 'HTTP 503', at: hoursAgo(6) },
      { attempt: 2, statusCode: 503, error: 'HTTP 503', at: hoursAgo(6) },
      { attempt: 3, error: 'socket hang up', at: hoursAgo(6) },
    ],
    firstFailedAt: hoursAgo(6),
    deadLetteredAt: hoursAgo(6),
    replayAttempts: 0,
  },
  {
    id: 'dlq-del_2002',
    requestId: 'del_2002',
    endpoint: 'https://hooks.example.com/crashlab/prod',
    eventType: 'run.failed',
    payload: { runId: 'run-1043', status: 'failed' },
    reason: 'retries-exhausted',
    errorTimeline: [
      { attempt: 1, statusCode: 500, error: 'HTTP 500', at: hoursAgo(30) },
      { attempt: 2, statusCode: 500, error: 'HTTP 500', at: hoursAgo(30) },
      { attempt: 3, statusCode: 500, error: 'HTTP 500', at: hoursAgo(30) },
    ],
    firstFailedAt: hoursAgo(30),
    deadLetteredAt: hoursAgo(30),
    replayAttempts: 1,
  },
  {
    id: 'dlq-del_2003',
    requestId: 'del_2003',
    endpoint: 'https://audit.internal.example/crashlab',
    eventType: 'run.completed',
    payload: { runId: 'run-1039', status: 'completed' },
    reason: 'non-retryable',
    errorTimeline: [{ attempt: 1, statusCode: 401, error: 'HTTP 401', at: daysAgo(4) }],
    firstFailedAt: daysAgo(4),
    deadLetteredAt: daysAgo(4),
    replayAttempts: 0,
  },
];
