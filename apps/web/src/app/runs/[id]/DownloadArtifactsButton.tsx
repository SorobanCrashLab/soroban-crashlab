'use client';

import { downloadArtifacts } from '../../utils/artifact-download';
import { collectRunArtifacts } from '../../utils/artifact-collection';
import type { FuzzingRun, LedgerStateChange } from '../../types';

interface DownloadArtifactsButtonProps {
  run: FuzzingRun;
  ledgerChanges: LedgerStateChange[];
}

export default function DownloadArtifactsButton({
  run,
  ledgerChanges,
}: DownloadArtifactsButtonProps) {
  const handleDownload = () => {
    const artifacts = collectRunArtifacts(run, ledgerChanges);
    downloadArtifacts(artifacts, run.id);
  };

  return (
    <button
      onClick={handleDownload}
      className="inline-flex items-center justify-center h-10 px-4 rounded-full bg-green-600 dark:bg-green-700 text-white dark:text-white font-medium hover:bg-green-700 dark:hover:bg-green-600 transition"
      title="Download run artifacts including metadata, traces, and fixture exports"
    >
      <svg
        className="w-4 h-4 mr-2"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
        />
      </svg>
      Download Artifacts
    </button>
  );
}
