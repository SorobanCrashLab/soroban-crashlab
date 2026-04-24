'use client';

import { useCallback, useState, useEffect } from 'react';
import { FuzzingRun, RunStatus, RunArea, RunSeverity } from './types';
import { simulateSeedReplay } from './replay';
import { generateMarkdownReport } from './report-utils';
import ReportModal from './ReportModal';

type ReplayUiStatus = 'idle' | 'running' | 'completed' | 'failed';

interface RunDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    run: FuzzingRun | null;
    /** Called when a replay finishes so the dashboard can list the new run */
    onReplayComplete?: (run: FuzzingRun) => void;
}

const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatFee = (fee: number): string => `${fee.toLocaleString()} stroops`;

const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
};

const getStatusColor = (status: RunStatus): string => {
    switch (status) {
        case 'running': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
        case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
        case 'failed': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
        case 'cancelled': return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
};

const getSeverityColor = (severity: RunSeverity): string => {
    switch (severity) {
        case 'low': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
        case 'medium': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
        case 'high': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
        case 'critical': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
};

const getAreaColor = (area: RunArea): string => {
    switch (area) {
        case 'auth': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
        case 'state': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
        case 'budget': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
        case 'xdr': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300';
        default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
};

export default function RunDetailModal({ isOpen, onClose, run, onReplayComplete }: RunDetailModalProps) {
    const [replayStatus, setReplayStatus] = useState<ReplayUiStatus>('idle');
    const [replayRunId, setReplayRunId] = useState<string | null>(null);
    const [replayError, setReplayError] = useState<string | null>(null);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);

    const handleReplay = useCallback(async () => {
        if (!run?.crashDetail || replayStatus === 'running') return;
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

    const canReplay = Boolean(run?.crashDetail);
    useEffect(() => {
        if (!isOpen) return;
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    if (!isOpen || !run) return null;

    return (
        <>
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 md:p-8 overflow-hidden">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-zinc-950/40 dark:bg-black/80 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative bg-white dark:bg-zinc-950 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 w-full max-w-2xl max-h-full flex flex-col transform transition-all duration-300 scale-100 opacity-100">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Run Details</h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 font-mono">Run ID: {run.id}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                        aria-label="Close modal"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-white dark:bg-zinc-950">
                    <div className="space-y-6">
                        {/* Status, Area, Severity */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Status</p>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(run.status)}`}>
                                    {run.status}
                                </span>
                            </div>
                            <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Area</p>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getAreaColor(run.area)}`}>
                                    {run.area}
                                </span>
                            </div>
                            <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Severity</p>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(run.severity)}`}>
                                    {run.severity}
                                </span>
                            </div>
                        </div>

                        {/* Duration and Seed Count */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Duration</p>
                                <p className="text-lg font-mono text-zinc-900 dark:text-zinc-100">{formatDuration(run.duration)}</p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Seed Count</p>
                                <p className="text-lg font-mono text-zinc-900 dark:text-zinc-100">{run.seedCount.toLocaleString()}</p>
                            </div>
                        </div>

                        {/* Resource Usage */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Resource Usage</h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-4">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">CPU Instructions</p>
                                    <p className="text-lg font-mono text-zinc-900 dark:text-zinc-100">{run.cpuInstructions.toLocaleString()}</p>
                                </div>
                                <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-4">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Memory Usage</p>
                                    <p className="text-lg font-mono text-zinc-900 dark:text-zinc-100">{formatBytes(run.memoryBytes)}</p>
                                </div>
                                <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-4">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Min Resource Fee</p>
                                    <p className="text-lg font-mono text-zinc-900 dark:text-zinc-100">{formatFee(run.minResourceFee)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Timestamps */}
                        {(run.queuedAt || run.startedAt || run.finishedAt) && (
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Timeline</h3>
                                <div className="space-y-2">
                                    {run.queuedAt && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-zinc-600 dark:text-zinc-400">Queued:</span>
                                            <span className="font-mono text-zinc-900 dark:text-zinc-100">{new Date(run.queuedAt).toLocaleString()}</span>
                                        </div>
                                    )}
                                    {run.startedAt && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-zinc-600 dark:text-zinc-400">Started:</span>
                                            <span className="font-mono text-zinc-900 dark:text-zinc-100">{new Date(run.startedAt).toLocaleString()}</span>
                                        </div>
                                    )}
                                    {run.finishedAt && (
                                        <div className="flex justify-between text-sm">
                                            <span className="text-zinc-600 dark:text-zinc-400">Finished:</span>
                                            <span className="font-mono text-zinc-900 dark:text-zinc-100">{new Date(run.finishedAt).toLocaleString()}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Crash Details */}
                        {run.crashDetail && (
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Crash Details</h3>
                                <div className="space-y-3">
                                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400 mb-1">Failure Category</p>
                                        <p className="font-medium text-red-900 dark:text-red-100">{run.crashDetail.failureCategory}</p>
                                    </div>
                                    <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-4">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Signature</p>
                                        <p className="font-mono text-sm break-all text-zinc-900 dark:text-zinc-100">{run.crashDetail.signature}</p>
                                    </div>
                                    <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-4">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Payload</p>
                                        <pre className="font-mono text-xs whitespace-pre-wrap break-words text-zinc-700 dark:text-zinc-300 max-h-32 overflow-y-auto">
                                            {run.crashDetail.payload}
                                        </pre>
                                    </div>
                                    <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-4">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1">Replay Action</p>
                                        <p className="font-mono text-xs whitespace-pre-wrap break-words text-zinc-900 dark:text-zinc-100">{run.crashDetail.replayAction}</p>
                                    </div>

                                    {/* Replay Section */}
                                    <div className="bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-4 space-y-3">
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
                                                <a
                                                    href={`/runs/${replayRunId}`}
                                                    className="font-medium underline underline-offset-2 hover:text-green-800 dark:hover:text-green-300"
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    Open replay run
                                                </a>
                                            </p>
                                        )}
                                        {replayStatus === 'failed' && replayError && (
                                            <p className="text-sm text-red-600 dark:text-red-400">{replayError}</p>
                                        )}
                                    </div>

                                    {/* Report Button */}
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
                            </div>
                        )}

                        {/* Associated Issues */}
                        {run.associatedIssues && run.associatedIssues.length > 0 && (
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Associated Issues</h3>
                                <div className="space-y-2">
                                    {run.associatedIssues.map((issue, index) => (
                                        <a
                                            key={index}
                                            href={issue.href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-3 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                                        >
                                            <span className="text-sm text-zinc-900 dark:text-zinc-100">{issue.label}</span>
                                            <svg className="w-4 h-4 inline ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                            </svg>
                                        </a>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Annotations */}
                        {run.annotations && run.annotations.length > 0 && (
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Annotations</h3>
                                <div className="space-y-2">
                                    {run.annotations.map((annotation, index) => (
                                        <div key={index} className="bg-zinc-50 dark:bg-zinc-900/50 rounded-lg p-3">
                                            <p className="text-sm text-zinc-900 dark:text-zinc-100">{annotation}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end bg-zinc-50/50 dark:bg-zinc-900/30 rounded-b-2xl">
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm transition-all shadow-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>

        <ReportModal
            isOpen={isReportModalOpen}
            onClose={() => setIsReportModalOpen(false)}
            markdown={run ? generateMarkdownReport(run) : ''}
            runId={run?.id || ''}
        />
        </>
    );
}