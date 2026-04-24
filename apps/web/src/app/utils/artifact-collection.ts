/**
 * Utility for collecting and structuring run artifacts from FuzzingRun data.
 */

import type { FuzzingRun, LedgerStateChange } from '../types';
import type { RunArtifacts } from './artifact-download';

/**
 * Collects artifacts from a fuzzing run into a structured format.
 *
 * @param run - The fuzzing run to extract artifacts from
 * @param ledgerChanges - Optional ledger state changes (fixtures)
 * @returns Structured artifacts ready for download
 */
export function collectRunArtifacts(
  run: FuzzingRun,
  ledgerChanges?: LedgerStateChange[]
): RunArtifacts {
  return {
    metadata: {
      id: run.id,
      status: run.status,
      area: run.area,
      severity: run.severity,
      duration: run.duration,
      seedCount: run.seedCount,
      cpuInstructions: run.cpuInstructions,
      memoryBytes: run.memoryBytes,
      minResourceFee: run.minResourceFee,
      queuedAt: run.queuedAt,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      downloadedAt: new Date().toISOString(),
    },
    traces: run.crashDetail
      ? [
          {
            failureCategory: run.crashDetail.failureCategory,
            signature: run.crashDetail.signature,
            payload: run.crashDetail.payload,
            replayAction: run.crashDetail.replayAction,
          },
        ]
      : [],
    fixtures: ledgerChanges ?? [],
  };
}
