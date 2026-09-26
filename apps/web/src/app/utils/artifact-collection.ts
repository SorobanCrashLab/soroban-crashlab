/**
 * Utility for collecting and structuring run artifacts from FuzzingRun data.
 */

import type { FuzzingRun, LedgerStateChange } from '../types';
import type { RunArtifacts } from './artifact-download';

export interface CollectRunArtifactsOptions {
  /**
   * Timestamp recorded in `metadata.downloadedAt`. Defaults to now.
   *
   * Pass the bundle's `generatedAt` when collecting inside a bundle so the
   * manifest and the metadata agree, and so the same run exported twice with
   * the same timestamp produces byte-identical output.
   */
  downloadedAt?: Date;
}

/**
 * Collects artifacts from a fuzzing run into a structured format.
 *
 * @param run - The fuzzing run to extract artifacts from
 * @param ledgerChanges - Optional ledger state changes (fixtures)
 * @param options - Optional collection settings
 * @returns Structured artifacts ready for download
 */
export function collectRunArtifacts(
  run: FuzzingRun,
  ledgerChanges?: LedgerStateChange[],
  options: CollectRunArtifactsOptions = {}
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
      downloadedAt: (options.downloadedAt ?? new Date()).toISOString(),
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
