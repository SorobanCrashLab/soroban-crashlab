/**
 * Utility functions for downloading run artifacts as JSON files.
 */

export interface RunArtifacts {
  metadata: {
    id: string;
    status: string;
    area: string;
    severity: string;
    duration: number;
    seedCount: number;
    cpuInstructions: number;
    memoryBytes: number;
    minResourceFee: number;
    queuedAt?: string;
    startedAt?: string;
    finishedAt?: string;
    downloadedAt: string;
  };
  traces: Array<{
    failureCategory?: string;
    signature?: string;
    payload?: string;
    replayAction?: string;
  }>;
  fixtures: Array<{
    id: string;
    entryType: string;
    changeType: 'created' | 'updated' | 'deleted';
    before?: string;
    after?: string;
  }>;
}

/**
 * Downloads run artifacts as a JSON file to the user's device.
 *
 * @param data - The artifacts to download
 * @param runId - Optional run ID to include in filename for clarity
 */
export function downloadArtifacts(
  data: RunArtifacts,
  runId?: string
): void {
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = runId
    ? `run-${runId}-artifacts-${timestamp}.json`
    : `run-artifacts-${timestamp}.json`;

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up the object URL
  URL.revokeObjectURL(url);
}
