'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { FuzzingRun } from './types';
import { simulateSeedReplay } from './replay';
import { generateMarkdownReport } from './report-utils';
import ReportModal from './ReportModal';

export type ReplayUiStatus = 'idle' | 'running' | 'completed' | 'failed';

interface CrashDetailDrawerProps {
    run: FuzzingRun;
    onClose: () => void;
    /** Called when a replay finishes so the dashboard can list the new run */
    onReplayComplete?: (run: FuzzingRun) => void;
}

export default function CrashDetailDrawer({ run, onClose, onReplayComplete }: CrashDetailDrawerProps) {
    const [replayStatus, setReplayStatus] = useState<ReplayUiStatus>('idle');
    const [replayRunId, setReplayRunId] = useState<string | null>(null);
    const [replayError, setReplayError] = useState<string | null>(null);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);

    const handleReplay = useCallback(async () => {
        if (!run.crashDetail || replayStatus === 'running') return;
        setReplayError(null);
        setReplayRunId(null);
        setReplayStatus('running');
        try {
            const { newRunId } = await simulateSeedReplay(run.id);
            setReplayRunId(newRunId);
            setReplayStatus('completed');
            onReplayComplete?.({
                id: newRunId,
                status: 'completed',
                area: run.area,
                severity: run.severity,
                duration: 0,
                seedCount: 1,
                crashDetail: null,
                cpuInstructions: 0,
                memoryBytes: 0,
                minResourceFee: 0,
            });
        } catch {
            setReplayStatus('failed');
            setReplayError('Replay could not be started. Try again.');
        }
    }, [onReplayComplete, replayStatus, run]);

    const canReplay = Boolean(run.crashDetail);

    return (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="crash-detail-title">
            <button
                type="button"
                className="absolute inset-0 bg-black/40 dark:bg-black/60"
                onClick={onClose}
                aria-label="Close crash detail drawer"
            />
            <aside className="absolute right-0 top-0 h-full w-full max-w-xl bg-white dark:bg-zinc-950 shadow-2xl border-l border-zinc-200 dark:border-zinc-800 p-6 overflow-y-auto">
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">Crash Details</p>
                        <h2 id="crash-detail-title" className="text-2xl font-bold">Run {run.id}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                        aria-label="Close drawer"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {run.crashDetail ? (
                    <div className="space-y-5">
                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Failure Category</p>
                            <p className="font-medium">{run.crashDetail.failureCategory}</p>
                        </div>

                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Signature</p>
                            <p className="font-mono text-sm break-all">{run.crashDetail.signature}</p>
                        </div>

                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Payload</p>
                            <pre className="font-mono text-xs whitespace-pre-wrap break-words text-zinc-700 dark:text-zinc-300">
                                {run.crashDetail.payload}
                            </pre>
                        </div>

                        <div
                            className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 space-y-3"
                            aria-live="polite"
                        >
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Seed replay</p>
                            <button
                                type="button"
                                onClick={handleReplay}
                                disabled={!canReplay || replayStatus === 'running'}
                                aria-busy={replayStatus === 'running'}
                                className="w-full sm:w-auto px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                                {replayStatus === 'running' ? 'Running replay…' : 'Run seed replay'}
                            </button>
                            {replayStatus === 'idle' && (
                                <p className="text-sm text-zinc-600 dark:text-zinc-400">Trigger a replay from the UI; when it finishes you can open the new run.</p>
                            )}
                            {replayStatus === 'running' && (
                                <p className="text-sm text-blue-700 dark:text-blue-300">Replay is running…</p>
                            )}
                            {replayStatus === 'completed' && replayRunId && (
                                <p className="text-sm text-green-700 dark:text-green-400">
                                    Replay finished.{' '}
                                    <Link
                                        href={`/runs/${replayRunId}`}
                                        className="font-medium underline underline-offset-2 hover:text-green-800 dark:hover:text-green-300"
                                    >
                                        Open replay run
                                    </Link>
                                </p>
                            )}
                            {replayStatus === 'failed' && replayError && (
                                <p className="text-sm text-red-600 dark:text-red-400">{replayError}</p>
                            )}
                        </div>

                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Replay Action</p>
                            <p className="font-mono text-xs whitespace-pre-wrap break-words">{run.crashDetail.replayAction}</p>
                        </div>

                        <div className="pt-2">
                            <button
                                type="button"
                                onClick={() => setIsReportModalOpen(true)}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all shadow-lg active:scale-[0.98]"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Generate Issue Report
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-4 text-sm text-zinc-600 dark:text-zinc-300">
                        No crash details are available for this run.
                    </div>
                )}

                <div className="mt-8 flex items-center justify-end gap-3">
                    <Link
                        href={`/runs/${run.id}`}
                        className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition"
                    >
                        Open Run Page
                    </Link>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
                    >
                        Close
                    </button>
                </div>
            </aside>

            <ReportModal
                isOpen={isReportModalOpen}
                onClose={() => setIsReportModalOpen(false)}
                markdown={generateMarkdownReport(run)}
                runId={run.id}
            />
        </div>
    );
}
