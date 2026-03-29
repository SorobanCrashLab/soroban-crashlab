'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FuzzingRun, RunStatus } from './types';

/** Height of a single data row in pixels — must match the rendered row height. */
const ROW_HEIGHT = 57;

/** Number of extra rows to render above and below the visible area (overscan). */
const OVERSCAN = 3;

interface VirtualizedRunTableProps {
    /** Full list of fuzzing runs to display (may be very large). */
    runs: FuzzingRun[];
    /** Fixed pixel height for the scrollable viewport. Defaults to 480. */
    viewportHeight?: number;
    /** Called when a row is clicked or activated via keyboard. */
    onSelectRun: (runId: string) => void;
    /** Called when the "View Report" button is clicked for a run. */
    onViewReport: (run: FuzzingRun) => void;
    /** List of column IDs to show. */
    visibleColumns?: string[];
}

/**
 * Formats milliseconds into a human-readable duration string (e.g., "5m 23s").
 * Mirrors the helper in RunHistoryTable to stay consistent.
 */
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

/**
 * Renders a color-coded status badge driven by CSS custom properties
 * (--status-*) defined in globals.css — identical to the one used in
 * RunHistoryTable so the two tables look identical row-for-row.
 */
const StatusBadge = ({ status }: { status: RunStatus }) => (
    <span
        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
        style={{
            backgroundColor: `var(--status-${status}-bg)`,
            color: `var(--status-${status}-fg)`,
            borderColor: `var(--status-${status}-border)`,
        }}
    >
        {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
);

/**
 * A single virtualized data row.
 *
 * Rendered absolutely inside the inner scroll container so that only rows
 * currently inside (or just outside) the viewport are in the DOM.
 */
const VirtualRow = ({
    run,
    top,
    onSelectRun,
    onViewReport,
    visibleColumns,
}: {
    run: FuzzingRun;
    top: number;
    onSelectRun: (id: string) => void;
    onViewReport: (run: FuzzingRun) => void;
    visibleColumns: string[];
}) => {
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTableRowElement>) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectRun(run.id);
            }
        },
        [run.id, onSelectRun],
    );

    return (
        <tr
            style={{ position: 'absolute', top, left: 0, right: 0, height: ROW_HEIGHT, display: 'flex', alignItems: 'center' }}
            tabIndex={0}
            className="group hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors cursor-pointer border-b border-zinc-100 dark:border-zinc-800 w-full"
            onClick={() => onSelectRun(run.id)}
            onKeyDown={handleKeyDown}
            aria-label={`Fuzzing run ${run.id}, status ${run.status}`}
        >
            {visibleColumns.includes('id') && (
                <td className="px-6 flex-1 min-w-0">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelectRun(run.id);
                        }}
                        className="text-sm font-mono text-blue-600 dark:text-blue-400 hover:underline decoration-blue-500/30 underline-offset-4 text-left truncate"
                    >
                        {run.id}
                    </button>
                </td>
            )}
            {visibleColumns.includes('status') && (
                <td className="px-6 w-36 shrink-0">
                    <StatusBadge status={run.status} />
                </td>
            )}
            {visibleColumns.includes('duration') && (
                <td className="px-6 w-28 shrink-0 text-sm text-zinc-600 dark:text-zinc-400 text-right tabular-nums">
                    {formatDuration(run.duration)}
                </td>
            )}
            {visibleColumns.includes('seedCount') && (
                <td className="px-6 w-32 shrink-0 text-sm text-zinc-600 dark:text-zinc-400 text-right tabular-nums">
                    {run.seedCount.toLocaleString()}
                </td>
            )}
            {visibleColumns.includes('report') && (
                <td className="px-6 w-32 shrink-0 text-right">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onViewReport(run);
                        }}
                        className="text-xs font-medium px-3 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                        aria-label={`View markdown report for ${run.id}`}
                    >
                        View Report
                    </button>
                </td>
            )}
        </tr>
    );
};

/**
 * VirtualizedRunTable
 *
 * Renders only the rows that are currently visible in the scroll viewport plus
 * a small overscan buffer, keeping DOM node count low even when `runs` contains
 * thousands of entries.
 *
 * Virtualization is implemented without any third-party library: a fixed-height
 * scroll container holds an inner element whose height equals
 * `runs.length * ROW_HEIGHT`. On every scroll event the component recomputes
 * the first and last visible row indices and re-renders the minimal subset.
 *
 * The table interface and styling conventions are intentionally identical to
 * RunHistoryTable so the two components are interchangeable in the dashboard.
 */
export default function VirtualizedRunTable({
    runs,
    viewportHeight = 480,
    onSelectRun,
    onViewReport,
    visibleColumns = ['id', 'status', 'duration', 'seedCount', 'report'],
}: VirtualizedRunTableProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);

    /** Recalculate on scroll — wrapped in useCallback for stable identity. */
    const handleScroll = useCallback(() => {
        if (scrollRef.current) {
            setScrollTop(scrollRef.current.scrollTop);
        }
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.addEventListener('scroll', handleScroll, { passive: true });
        return () => el.removeEventListener('scroll', handleScroll);
    }, [handleScroll]);

    /** Reset scroll position whenever the run list changes (e.g. filtering). */
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }
        const timer = setTimeout(() => setScrollTop(0), 0);
        return () => clearTimeout(timer);
    }, [runs]);

    if (runs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-xl bg-zinc-50 dark:bg-zinc-900/20 border-zinc-200 dark:border-zinc-800">
                <p className="text-zinc-500 dark:text-zinc-400 font-medium">No fuzzing runs found.</p>
                <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">Start a new campaign to see results here.</p>
            </div>
        );
    }

    const totalHeight = runs.length * ROW_HEIGHT;

    /** Index of the first row that is at least partially visible. */
    const firstVisible = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    /** Index of the last row that is at least partially visible. */
    const lastVisible = Math.min(
        runs.length - 1,
        Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN,
    );

    const visibleRuns = runs.slice(firstVisible, lastVisible + 1);

    return (
        <div
            className="w-full overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm bg-white dark:bg-zinc-950"
            role="region"
            aria-label="Virtualized fuzzing run table"
        >
            {/* ── Sticky header ─────────────────────────────────────────────── */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse" role="presentation">
                    <thead>
                        <tr className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 flex">
                            {visibleColumns.includes('id') && (
                                <th scope="col" className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex-1 min-w-0">
                                    Run ID
                                </th>
                            )}
                            {visibleColumns.includes('status') && (
                                <th scope="col" className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 w-36 shrink-0">
                                    Status
                                </th>
                            )}
                            {visibleColumns.includes('duration') && (
                                <th scope="col" className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 w-28 shrink-0 text-right">
                                    Duration
                                </th>
                            )}
                            {visibleColumns.includes('seedCount') && (
                                <th scope="col" className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 w-32 shrink-0 text-right">
                                    Seed Count
                                </th>
                            )}
                            {visibleColumns.includes('report') && (
                                <th scope="col" className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 w-32 shrink-0 text-right">
                                    Report
                                </th>
                            )}
                        </tr>
                    </thead>
                </table>
            </div>

            {/* ── Scrollable virtualized body ────────────────────────────────── */}
            <div
                ref={scrollRef}
                style={{ height: viewportHeight, overflowY: 'auto' }}
                role="region"
                aria-label={`${runs.length} fuzzing runs`}
            >
                {/* Inner spacer whose height equals the full un-virtualized list. */}
                <div style={{ height: totalHeight, position: 'relative' }}>
                    <table className="w-full" role="presentation" style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
                        <tbody
                            style={{ position: 'relative', display: 'block', height: totalHeight }}
                        >
                            {visibleRuns.map((run, i) => (
                                <VirtualRow
                                    key={run.id}
                                    run={run}
                                    top={(firstVisible + i) * ROW_HEIGHT}
                                    onSelectRun={onSelectRun}
                                    onViewReport={onViewReport}
                                    visibleColumns={visibleColumns}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Footer: row count summary ──────────────────────────────────── */}
            <div className="px-6 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex items-center justify-between">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Showing{' '}
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                        {visibleRuns.length}
                    </span>{' '}
                    of{' '}
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                        {runs.length}
                    </span>{' '}
                    runs (virtualized)
                </p>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono">
                    rows {firstVisible + 1}–{Math.min(lastVisible + 1, runs.length)}
                </span>
            </div>
        </div>
    );
}
