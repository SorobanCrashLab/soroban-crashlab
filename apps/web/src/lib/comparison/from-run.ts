/**
 * lib/comparison/from-run — adapts stored runs to comparison sides (#1877).
 *
 * Runs do not carry a historical signature histogram in the web fixture store,
 * so the side is built from the run's recorded crash detail: one signature,
 * weighted by how many seeds the run executed. That is enough to answer "did
 * this run still reproduce the crash, and how much did the blast radius move"
 * while the API keeps the exact same `ComparisonSide` shape the model expects,
 * so swapping in a real histogram later touches only this file.
 */

import type { FuzzingRun } from '@/app/types';
import type { ComparisonMetrics, ComparisonSide, SignatureSample } from './delta';

function crashSignature(run: FuzzingRun): SignatureSample | null {
  const detail = run.crashDetail;
  if (!detail) return null;
  const signature = (detail.signature || detail.failureCategory || '').trim();
  if (!signature) return null;

  return {
    signature,
    // Every seed that ran is the observable weight of the crash for this run.
    count: Math.max(1, Number.isFinite(run.seedCount) ? Math.trunc(run.seedCount) : 1),
    failureClass: detail.failureCategory || 'unknown',
    ...(run.area ? { contract: run.area } : {}),
    severity: run.severity,
  };
}

export function runMetrics(run: FuzzingRun): ComparisonMetrics {
  return {
    seeds: Number.isFinite(run.seedCount) ? Math.max(0, Math.trunc(run.seedCount)) : 0,
    failures: run.crashDetail ? 1 : 0,
    durationMs: Number.isFinite(run.duration) ? Math.max(0, Math.trunc(run.duration)) : 0,
    ...(typeof run.corpusStats?.length === 'number' && run.corpusStats.length > 0
      ? { coveragePercent: run.corpusStats.at(-1)?.coveragePct ?? 0 }
      : {}),
  };
}

export function toComparisonSide(run: FuzzingRun): ComparisonSide {
  const signature = crashSignature(run);
  return {
    runId: run.id,
    label: `${run.id} · ${run.status}`,
    signatures: signature ? [signature] : [],
    metrics: runMetrics(run),
  };
}
