/**
 * Logs adapter (#2339 → #075 log corpus).
 *
 * The log corpus is index-addressable (1M+ events), so the adapter reads a
 * bounded recent window instead of materialising it. The window size is the
 * adapter's own guardrail, independent of the engine's scan limit.
 */

import { eventAt, LOG_DATASET_SIZE } from '@/lib/logs/dataset';
import type { LogEvent } from '@/lib/logs/types';
import type { SourceRow } from '../lib/engine';
import type { DatasetAdapter } from './types';

export const LOG_WINDOW_EVENTS = 5_000;

export function logToRow(event: LogEvent): SourceRow {
  return {
    id: event.id,
    timestamp: event.timestamp,
    level: event.level,
    source: event.source,
    message: event.message,
    run_id: event.run_id ?? null,
    campaign_id: event.campaign_id ?? null,
    trace_id: event.trace_id ?? null,
    error_code: event.error_code ?? null,
    contract: event.contract ?? null,
  };
}

export const logsAdapter: DatasetAdapter = {
  entity: 'logs',
  sourceLabel: `log corpus (latest ${LOG_WINDOW_EVENTS.toLocaleString('en-US')} events)`,
  load: async () =>
    Array.from({ length: Math.min(LOG_WINDOW_EVENTS, LOG_DATASET_SIZE) }, (_, index) => logToRow(eventAt(index))),
};
