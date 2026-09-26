'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ZipBundleCancelledError,
  generateRunArtifactZipWithProgress,
  type ZipBundleProgress,
} from '../../utils/artifact-zip-worker';
import { registerZipWorker } from '../../utils/zip-worker-factory';
import { triggerBrowserDownload } from '../../utils/browser-download';
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
  const [progress, setProgress] = useState<ZipBundleProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Register the bundling worker on mount. Only the browser can construct one,
  // and registration itself is synchronous, so a pre-render pass is unaffected.
  useEffect(() => {
    registerZipWorker();
  }, []);

  // Abandon an in-flight bundle if the user navigates away mid-export.
  useEffect(() => () => abortRef.current?.abort(), []);

  const handleDownload = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setProgress(null);
    setState('loading');

    try {
      // Bundling runs in a Web Worker, so this never blocks the main thread and
      // the page stays responsive while a large run is exported.
      const bundle = await generateRunArtifactZipWithProgress(run, ledgerChanges, {
        signal: controller.signal,
        onProgress: setProgress,
      });

      triggerBrowserDownload(bundle.blob, bundle.filename);
      setState('idle');
    } catch (error) {
      // Cancelling is a user decision, not a failure: return to idle silently.
      setState(error instanceof ZipBundleCancelledError ? 'idle' : 'error');
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const isLoading = state === 'loading';
  const isError = state === 'error';

  const total = progress?.total ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round(((progress?.completed ?? 0) / total) * 100)) : 0;
  const progressLabel =
    progress?.phase === 'collect' && progress.currentFile
      ? `Collecting ${progress.currentFile}`
      : 'Assembling archive';

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
            : 'Download run artifact bundle as a zip containing a manifest, metadata, traces and fixture exports'
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
            Download Bundle (.zip)
          </>
        )}
      </button>

      {isLoading ? (
        <div className="w-full max-w-xs">
          <div
            role="progressbar"
            aria-label="Artifact bundle progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-1.5 w-full overflow-hidden rounded-full bg-green-200 dark:bg-green-900"
          >
            <div
              className="h-full bg-green-600 transition-[width] duration-200 dark:bg-green-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs opacity-80" aria-live="polite">
              {progressLabel} ({percent}%)
            </span>
            <button
              type="button"
              onClick={handleCancel}
              className="text-xs font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : isError ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          Download failed. Check your browser permissions and try again.
        </p>
      ) : (
        <p className="text-meta text-xs">
          Manifest, metadata, traces and {ledgerChanges.length} ledger fixture
          {ledgerChanges.length === 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}
