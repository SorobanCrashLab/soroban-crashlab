/**
 * Run-derived adapters (#2339): runs, crashes, traces and metrics.
 *
 * All four read the configured run storage driver (in-memory fixtures or
 * KV), so the explorer queries the same runs the rest of the dashboard
 * shows. Crashes come from `crashDetail`; spans and metric samples are
 * derived deterministically from each run's recorded timing and corpus stats
 * until a trace/metrics backend is wired in (see the docs' adapter section).
 */

import type { FuzzingRun } from '@/app/types';
import { selectRunStorageDriver } from '@/lib/storage';
import type { SourceRow } from '../lib/engine';
import type { DatasetAdapter } from './types';

const ts = (value: string | undefined): number | null => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function runToRow(run: FuzzingRun): SourceRow {
  return {
    id: run.id,
    campaign_id: run.campaignId ?? null,
    status: run.status,
    area: run.area,
    severity: run.severity,
    fixture: run.fixtureName ?? null,
    duration_ms: run.duration,
    seed_count: run.seedCount,
    cpu_instructions: run.cpuInstructions,
    memory_bytes: run.memoryBytes,
    min_resource_fee: run.minResourceFee,
    started_at: ts(run.startedAt ?? run.queuedAt),
    finished_at: ts(run.finishedAt),
  };
}

export function crashRows(runs: readonly FuzzingRun[]): SourceRow[] {
  return runs.flatMap((run) => {
    if (!run.crashDetail) return [];
    return [
      {
        id: `crash-${run.id}`,
        run_id: run.id,
        signature: run.crashDetail.signature,
        signature_hash: run.crashDetail.signatureHash ?? null,
        failure_category: run.crashDetail.failureCategory,
        area: run.area,
        severity: run.severity,
        detected_at: ts(run.finishedAt ?? run.startedAt),
        payload: run.crashDetail.payload,
      },
    ];
  });
}

const SPAN_PHASES = [
  { name: 'rpc.simulate', service: 'rpc', share: 0.15 },
  { name: 'wasm.execute', service: 'wasm-runner', share: 0.6 },
  { name: 'ledger.apply', service: 'orchestrator', share: 0.2 },
  { name: 'report.persist', service: 'scheduler', share: 0.05 },
] as const;

/** Four sequential spans per run, sized from the run's recorded duration. */
export function traceRows(runs: readonly FuzzingRun[]): SourceRow[] {
  return runs.flatMap((run) => {
    const start = ts(run.startedAt ?? run.queuedAt) ?? 0;
    let offset = 0;
    return SPAN_PHASES.map((phase, index) => {
      const duration = Math.round(run.duration * phase.share);
      const row: SourceRow = {
        span_id: `${run.id}-span-${index + 1}`,
        trace_id: `trace-${run.id}`,
        run_id: run.id,
        name: phase.name,
        service: phase.service,
        // The execute span carries the failure for failed runs.
        status: run.status === 'failed' && phase.name === 'wasm.execute' ? 'error' : 'ok',
        duration_ms: duration,
        started_at: start + offset,
      };
      offset += duration;
      return row;
    });
  });
}

/** Corpus stats when recorded, otherwise one end-of-run sample per metric. */
export function metricRows(runs: readonly FuzzingRun[]): SourceRow[] {
  return runs.flatMap((run) => {
    const points = run.corpusStats ?? [];
    if (points.length > 0) {
      return points.flatMap((point, index) =>
        (
          [
            ['execs_per_sec', point.execsPerSec],
            ['coverage_pct', point.coveragePct],
            ['corpus_size', point.corpusSize],
            ['edges_found', point.edgesFound],
          ] as const
        ).map(([metric, value]) => ({
          id: `${run.id}-${metric}-${index}`,
          run_id: run.id,
          metric,
          value,
          recorded_at: point.ts,
        })),
      );
    }
    const at = ts(run.finishedAt ?? run.startedAt) ?? 0;
    const seconds = Math.max(1, run.duration / 1_000);
    return [
      { id: `${run.id}-execs_per_sec`, run_id: run.id, metric: 'execs_per_sec', value: Math.round(run.seedCount / seconds), recorded_at: at },
      { id: `${run.id}-corpus_size`, run_id: run.id, metric: 'corpus_size', value: run.seedCount, recorded_at: at },
    ];
  });
}

async function listRuns(): Promise<FuzzingRun[]> {
  const { runs } = await selectRunStorageDriver().listRuns();
  return runs;
}

export const runsAdapter: DatasetAdapter = {
  entity: 'runs',
  sourceLabel: 'run storage driver',
  load: async () => (await listRuns()).map(runToRow),
};

export const crashesAdapter: DatasetAdapter = {
  entity: 'crashes',
  sourceLabel: 'run storage driver (crashDetail)',
  load: async () => crashRows(await listRuns()),
};

export const tracesAdapter: DatasetAdapter = {
  entity: 'traces',
  sourceLabel: 'derived from run timing',
  load: async () => traceRows(await listRuns()),
};

export const metricsAdapter: DatasetAdapter = {
  entity: 'metrics',
  sourceLabel: 'run corpus stats',
  load: async () => metricRows(await listRuns()),
};
