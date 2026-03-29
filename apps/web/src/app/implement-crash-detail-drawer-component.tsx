'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReportModal from './ReportModal';
import { simulateSeedReplay } from './replay';
import { generateMarkdownReport } from './report-utils';
import { FuzzingRun, RunSeverity, RunStatus } from './types';

export type ReplayUiStatus = 'idle' | 'running' | 'completed' | 'failed';

interface CrashDetailDrawerProps {
    run: FuzzingRun;
    onClose: () => void;
    onReplayComplete?: (run: FuzzingRun) => void;
}

type CopyTarget = 'signature' | 'command';
type CopyStatus = { target: CopyTarget; status: 'copied' | 'failed' } | null;

const statusBadgeClasses: Record<RunStatus, string> = {
    running: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800',
    completed: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
    failed: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800',
    cancelled: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
};

const severityBadgeClasses: Record<RunSeverity, string> = {
    low: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    medium: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
    high: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800',
    critical: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800',
};

const detailSectionClass =
    'rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/40';

const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
};

const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatFee = (fee: number): string => `${fee.toLocaleString()} stroops`;

const formatDateTime = (value?: string): string =>
    value
        ? new Date(value).toLocaleString('en-US', {
              dateStyle: 'medium',
              timeStyle: 'short',
          })
        : 'Pending';

export default function ImplementCrashDetailDrawerComponent({
    run,
    onClose,
    onReplayComplete,
}: CrashDetailDrawerProps) {
    const [replayStatus, setReplayStatus] = useState<ReplayUiStatus>('idle');
    const [replayRunId, setReplayRunId] = useState<string | null>(null);
    const [replayError, setReplayError] = useState<string | null>(null);
    const [copyStatus, setCopyStatus] = useState<CopyStatus>(null);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        closeButtonRef.current?.focus();

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    useEffect(() => {
        if (!copyStatus) return;
        const timer = window.setTimeout(() => setCopyStatus(null), 1600);
        return () => window.clearTimeout(timer);
    }, [copyStatus]);

    const handleCopy = useCallback(async (value: string, target: CopyTarget) => {
        try {
            await navigator.clipboard.writeText(value);
            setCopyStatus({ target, status: 'copied' });
        } catch {
            setCopyStatus({ target, status: 'failed' });
        }
    }, []);

    const handleReplay = useCallback(async () => {
        if (!run.crashDetail || replayStatus === 'running') return;

        setReplayError(null);
        setReplayRunId(null);
        setReplayStatus('running');

        try {
            const { newRunId } = await simulateSeedReplay(run.id);
            const now = new Date().toISOString();

            setReplayRunId(newRunId);
            setReplayStatus('completed');

            onReplayComplete?.({
                id: newRunId,
                status: 'completed',
                area: run.area,
                severity: run.severity,
                duration: 94_000,
                seedCount: Math.max(1, Math.round(run.seedCount * 0.02)),
                crashDetail: null,
                cpuInstructions: Math.max(50_000, Math.round(run.cpuInstructions * 0.35)),
                memoryBytes: Math.max(512_000, Math.round(run.memoryBytes * 0.4)),
                minResourceFee: Math.max(100, Math.round(run.minResourceFee * 0.5)),
                queuedAt: now,
                startedAt: now,
                finishedAt: now,
            });
        } catch {
            setReplayStatus('failed');
            setReplayError('Replay could not be started. Try again.');
        }
    }, [onReplayComplete, replayStatus, run]);

    const crashDetail = run.crashDetail;
    const associatedIssues = run.associatedIssues ?? [];
    const lifecycle = [
        { label: 'Queued', value: formatDateTime(run.queuedAt) },
        { label: 'Started', value: formatDateTime(run.startedAt) },
        { label: 'Finished', value: formatDateTime(run.finishedAt) },
    ];
    const summaryStats = [
        { label: 'Duration', value: formatDuration(run.duration) },
        { label: 'Seeds', value: run.seedCount.toLocaleString() },
        { label: 'CPU', value: `${(run.cpuInstructions / 1000).toFixed(0)}k` },
        { label: 'Issues', value: associatedIssues.length ? `${associatedIssues.length} linked` : 'None linked' },
    ];

    const getCopyLabel = (target: CopyTarget, idleLabel: string): string => {
        if (copyStatus?.target !== target) return idleLabel;
        return copyStatus.status === 'copied' ? 'Copied' : 'Failed';
    };

    return (
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="crash-detail-title">
            <button
                type="button"
                className="absolute inset-0 bg-zinc-950/55 backdrop-blur-sm"
                onClick={onClose}
                aria-label="Close crash detail drawer"
            />

            <aside className="absolute inset-y-0 right-0 flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-start justify-between gap-4 border-b border-zinc-200 pb-6 dark:border-zinc-800">
                    <div className="min-w-0">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">
                            Crash detail drawer
                        </p>
                        <h2 id="crash-detail-title" className="truncate text-3xl font-bold text-zinc-950 dark:text-zinc-50">
                            {run.id}
                        </h2>
                        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                            Inspect the captured crash payload, replay command, linked issues, and run telemetry without leaving the dashboard.
                        </p>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <span
                                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusBadgeClasses[run.status]}`}
                            >
                                {run.status}
                            </span>
                            <span
                                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${severityBadgeClasses[run.severity]}`}
                            >
                                {run.severity}
                            </span>
                            <span className="inline-flex items-center rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                                {run.area}
                            </span>
                        </div>
                    </div>

                    <button
                        ref={closeButtonRef}
                        type="button"
                        onClick={onClose}
                        className="rounded-xl p-2 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                        aria-label="Close drawer"
                    >
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {summaryStats.map((stat) => (
                        <div
                            key={stat.label}
                            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                        >
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                                {stat.label}
                            </p>
                            <p className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-50">{stat.value}</p>
                        </div>
                    ))}
                </div>

                <div className="mt-6 flex-1 overflow-y-auto pr-1">
                    <section className={detailSectionClass}>
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Lifecycle</h3>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">Local dashboard sample data</span>
                        </div>
                        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            {lifecycle.map((entry) => (
                                <div key={entry.label} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                                    <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                                        {entry.label}
                                    </dt>
                                    <dd className="mt-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">{entry.value}</dd>
                                </div>
                            ))}
                        </dl>
                    </section>

                    {crashDetail ? (
                        <>
                            <section className={`${detailSectionClass} mt-5`}>
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Failure summary</h3>
                                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                            Stable crash identity and payload snapshot for quick triage.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(crashDetail.signature, 'signature')}
                                        className="inline-flex items-center justify-center rounded-xl border border-zinc-300 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                                    >
                                        {getCopyLabel('signature', 'Copy signature')}
                                    </button>
                                </div>

                                <div className="mt-4 grid gap-4 sm:grid-cols-[180px,minmax(0,1fr)]">
                                    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                                            Category
                                        </p>
                                        <p className="mt-2 text-base font-semibold text-zinc-900 dark:text-zinc-100">
                                            {crashDetail.failureCategory}
                                        </p>
                                    </div>

                                    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                                            Signature
                                        </p>
                                        <p className="mt-2 break-all font-mono text-sm text-zinc-900 dark:text-zinc-100">
                                            {crashDetail.signature}
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                                            Payload
                                        </p>
                                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                            memory {formatBytes(run.memoryBytes)} and fee {formatFee(run.minResourceFee)}
                                        </span>
                                    </div>
                                    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-zinc-100 p-4 font-mono text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                                        {crashDetail.payload}
                                    </pre>
                                </div>
                            </section>

                            <section className={`${detailSectionClass} mt-5`} aria-live="polite">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Replay from drawer</h3>
                                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                            Re-run the crashing seed and keep the resulting replay run in the dashboard.
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleReplay}
                                        disabled={replayStatus === 'running'}
                                        aria-busy={replayStatus === 'running'}
                                        className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {replayStatus === 'running' ? 'Running replay...' : 'Run seed replay'}
                                    </button>
                                </div>

                                <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                                    <div className="mb-2 flex items-center justify-between gap-3">
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                                            Replay command
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => handleCopy(crashDetail.replayAction, 'command')}
                                            className="text-xs font-semibold text-blue-700 transition hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200"
                                        >
                                            {getCopyLabel('command', 'Copy command')}
                                        </button>
                                    </div>
                                    <pre className="whitespace-pre-wrap break-words rounded-xl bg-zinc-100 p-4 font-mono text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                                        {crashDetail.replayAction}
                                    </pre>
                                </div>

                                {replayStatus === 'idle' && (
                                    <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                                        Replay runs are appended back into the dashboard so you can inspect the follow-up trace immediately.
                                    </p>
                                )}
                                {replayStatus === 'running' && (
                                    <p className="mt-3 text-sm text-blue-700 dark:text-blue-300">Scheduling replay...</p>
                                )}
                                {replayStatus === 'completed' && replayRunId && (
                                    <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
                                        Replay finished.
                                        {' '}
                                        <Link
                                            href={`/runs/${replayRunId}`}
                                            className="font-semibold underline underline-offset-4"
                                        >
                                            Open {replayRunId}
                                        </Link>
                                    </p>
                                )}
                                {replayStatus === 'failed' && replayError && (
                                    <p className="mt-3 text-sm text-rose-700 dark:text-rose-300">{replayError}</p>
                                )}
                            </section>

                            <section className={`${detailSectionClass} mt-5`}>
                                <div className="mb-4 flex items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Linked issues</h3>
                                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                                            Keep triage context beside the captured crash signature.
                                        </p>
                                    </div>
                                    <span className="rounded-full bg-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                        {associatedIssues.length}
                                    </span>
                                </div>

                                {associatedIssues.length > 0 ? (
                                    <ul className="space-y-3">
                                        {associatedIssues.map((issue) => (
                                            <li key={issue.href} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
                                                <a
                                                    href={issue.href}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-sm font-semibold text-blue-700 transition hover:text-blue-800 hover:underline dark:text-blue-300 dark:hover:text-blue-200"
                                                >
                                                    {issue.label}
                                                </a>
                                                <p className="mt-2 break-all font-mono text-xs text-zinc-500 dark:text-zinc-400">
                                                    {issue.href}
                                                </p>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                                        No linked issues yet. Use the generated report to create a fresh triage ticket from this drawer.
                                    </div>
                                )}
                            </section>

                            <div className="mt-5">
                                <button
                                    type="button"
                                    onClick={() => setIsReportModalOpen(true)}
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                                >
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Generate issue report
                                </button>
                            </div>
                        </>
                    ) : (
                        <section className={`${detailSectionClass} mt-5`}>
                            <h3 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">No crash payload available</h3>
                            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                                This run does not currently include a captured crash detail payload. Select a failed run from the dashboard to inspect a signature, payload, and replay command here.
                            </p>
                        </section>
                    )}
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-zinc-200 pt-6 dark:border-zinc-800">
                    <Link
                        href={`/runs/${run.id}`}
                        className="inline-flex items-center justify-center rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                        Open full run page
                    </Link>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                    >
                        Close drawer
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
