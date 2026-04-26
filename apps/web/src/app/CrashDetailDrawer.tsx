'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { FuzzingRun } from './types';
import { simulateSeedReplay } from './replay';
import { generateMarkdownReport } from './report-utils';
import ReportModal from './ReportModal';
import { useMaintainerMode } from './useMaintainerMode';
import { ReplayButtonStatus } from './replay-ui-utils';

interface CrashDetailDrawerProps {
    run: FuzzingRun;
    onClose: () => void;
    /** Called when a replay finishes so the dashboard can list the new run */
    onReplayComplete?: (run: FuzzingRun) => void;
}

export default function CrashDetailDrawer({ run, onClose, onReplayComplete }: CrashDetailDrawerProps) {
    const [status, setStatus] = useState<ReplayButtonStatus>('idle');
    const [replayedRunId, setReplayedRunId] = useState<string | null>(null);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const { isMaintainer } = useMaintainerMode();

    const handleReplay = useCallback(async () => {
        if (!run.crashDetail || status === 'loading' || !isMaintainer) return;
        
        setStatus('loading');
        setReplayedRunId(null);
        try {
            const { newRunId } = await simulateSeedReplay(run.id);
            setReplayedRunId(newRunId);
            setStatus('success');
            onReplayComplete?.({
                id: newRunId,
                status: 'running',
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
            setStatus('error');
        }
    }, [isMaintainer, onReplayComplete, status, run]);

    const canReplay = Boolean(run.crashDetail);

    return (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="crash-detail-title">
            <button
                type="button"
                className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
                aria-label="Close crash detail drawer"
            />
            <aside className="absolute right-0 top-0 h-full w-full max-w-xl bg-white dark:bg-zinc-950 shadow-2xl border-l border-zinc-200 dark:border-zinc-800 p-8 overflow-y-auto animate-in slide-in-from-right duration-500 ease-out">
                <div className="flex items-start justify-between gap-4 mb-8">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400 mb-2">Crash Analysis</p>
                        <h2 id="crash-detail-title" className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Run {run.id}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-full text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-900 transition-all"
                        aria-label="Close drawer"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {run.crashDetail ? (
                    <div className="space-y-6">
                        <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                            <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-2">Failure Category</p>
                            <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{run.crashDetail.failureCategory}</p>
                        </div>

                        <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                            <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-2">Signature</p>
                            <code className="block p-4 rounded-xl bg-zinc-100 dark:bg-zinc-950 font-mono text-sm text-zinc-800 dark:text-zinc-300 break-all border border-zinc-200 dark:border-zinc-800 shadow-inner">
                                {run.crashDetail.signature}
                            </code>
                        </div>

                        <div className="p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                            <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-2">Reproduction Payload</p>
                            <div className="relative group">
                                <pre className="p-4 rounded-xl bg-zinc-900 text-zinc-300 font-mono text-xs overflow-x-auto border border-zinc-800 max-h-[300px] shadow-2xl">
                                    {run.crashDetail.payload}
                                </pre>
                            </div>
                        </div>

                        {/* Replay Section */}
                        <div
                            className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4 bg-white dark:bg-zinc-950 shadow-sm transition-all"
                            aria-live="polite"
                        >
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Seed Replay</p>
                                {status === 'loading' && (
                                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 dark:text-blue-400 animate-pulse uppercase tracking-wider">
                                        Processing Replay
                                    </span>
                                )}
                            </div>
                            
                            <div className="space-y-3">
                                <button
                                    type="button"
                                    onClick={handleReplay}
                                    disabled={!canReplay || status === 'loading' || !isMaintainer}
                                    aria-busy={status === 'loading'}
                                    className={`
                                        w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-md active:scale-[0.97]
                                        ${status === 'loading' 
                                            ? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed' 
                                            : !isMaintainer
                                                ? 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-600 cursor-not-allowed opacity-60'
                                                : status === 'error'
                                                    ? 'bg-rose-600 text-white hover:bg-rose-700'
                                                    : status === 'success'
                                                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                                        : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-500/20'
                                        }
                                    `}
                                >
                                    {status === 'loading' ? (
                                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                    ) : (
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    )}
                                    {status === 'loading' ? 'Running replay…' : status === 'error' ? 'Retry replay' : status === 'success' ? 'Replay queued' : 'Run seed replay'}
                                </button>
                                
                                {!isMaintainer && (
                                    <p className="text-[10px] text-zinc-500 dark:text-zinc-500 italic">
                                        * Enable maintainer mode to trigger replays.
                                    </p>
                                )}
                            </div>

                            {status === 'success' && replayedRunId && (
                                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-100 dark:border-emerald-900/30 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 text-emerald-600 dark:text-emerald-400">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">Replay triggered successfully!</p>
                                            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                                                New run ID: <span className="font-mono font-bold">{replayedRunId}</span>
                                            </p>
                                            <Link 
                                                href={`/?run=${replayedRunId}`} 
                                                className="inline-block mt-3 text-xs font-bold text-emerald-600 dark:text-emerald-400 underline hover:no-underline"
                                            >
                                                View new run detail →
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {status === 'error' && (
                                <div className="p-4 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-100 dark:border-rose-900/30 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 text-rose-600 dark:text-rose-400">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-rose-900 dark:text-rose-100">Replay failed to start</p>
                                            <p className="text-xs text-rose-700 dark:text-rose-400 mt-1">There was an issue scheduling the replay. Please try again or contact system support.</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="pt-4">
                            <button
                                type="button"
                                onClick={() => setIsReportModalOpen(true)}
                                className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-all shadow-xl active:scale-[0.98]"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Generate Full Issue Report
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-[60vh] rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-800 p-8 text-center bg-zinc-50/50 dark:bg-zinc-900/30">
                        <svg className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-zinc-600 dark:text-zinc-400 font-medium">No crash details are available for this run.</p>
                    </div>
                )}

                <div className="mt-12 flex items-center justify-end gap-4 pb-8">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all"
                    >
                        Close
                    </button>
                    <Link
                        href={`/?run=${run.id}`}
                        className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-all shadow-md shadow-blue-500/10"
                    >
                        Focus in Table
                    </Link>
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
