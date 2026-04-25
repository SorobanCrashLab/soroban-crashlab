'use client';

import { useState } from 'react';
import { downloadArtifacts } from '../../utils/artifact-download';
import { collectRunArtifacts } from '../../utils/artifact-collection';
import type { FuzzingRun, LedgerStateChange } from '../../types';

interface DownloadArtifactsButtonProps {
  run: FuzzingRun;
  ledgerChanges: LedgerStateChange[];
}

type DownloadState = 'idle' | 'loading' | 'error';

export default function DownloadArtifactsButton({
  run,
  ledgerChanges,
}: DownloadArtifactsButtonProps) {
  const [state, setState] = useState<DownloadState>('idle');

  const handleDownload = async () => {
    setState('loading');
    try {
      const artifacts = collectRunArtifacts(run, ledgerChanges);
      downloadArtifacts(artifacts, run.id);
      setState('idle');
    } catch {
      setState('error');
    }
  };

  const isLoading = state === 'loading';
  const isError = state === 'error';

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleDownload}
        disabled={isLoading}
        aria-busy={isLoading}
        aria-label={
          isLoading
            ? 'Preparing artifact bundle…'
            : 'Download run artifacts including metadata, traces, and fixture exports'
        }
        className={`inline-flex items-center justify-center h-10 px-4 rounded-full font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 ${
          isLoading
            ? 'bg-green-400 dark:bg-green-800 text-white cursor-not-allowed'
            : isError
              ? 'bg-red-600 dark:bg-red-700 text-white hover:bg-red-700 dark:hover:bg-red-600'
              : 'bg-green-600 dark:bg-green-700 text-white hover:bg-green-700 dark:hover:bg-green-600'
        }`}
      >
        {isLoading ? (
          <>
            <svg
              className="w-4 h-4 mr-2 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Preparing…
          </>
        ) : isError ? (
          <>
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
            Retry Download
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download Artifacts
          </>
        )}
      </button>
      {isError && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          Download failed. Check your browser permissions and try again.
        </p>
      )}
    </div>
  );
}
