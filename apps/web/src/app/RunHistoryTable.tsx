'use client';

import { FuzzingRun, RunStatus } from './types';
import AddReplayFromUiAction from './add-replay-from-ui-action';

interface RunHistoryTableProps {
    /** Array of fuzzing runs to display */
    runs: FuzzingRun[];
    /** Called when a row is selected to open crash details */
    onSelectRun: (runId: string) => void;
    /** Called when the report button is clicked for a run */
    onViewReport: (run: FuzzingRun) => void;
    /** Called when a replay is initiated for a run */
    onReplayRun?: (newRunData: { id: string; status: 'running' }) => void;
    /** List of visible columns */
    visibleColumns?: string[];
}

/**
 * Formats milliseconds into a human-readable duration string (e.g., "5m 23s").
 */
const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

    return parts.join(' ');
};

/**
 * Renders a color-coded status badge for a run.
 * Colors are driven by CSS custom properties defined in globals.css,
 * which are chosen to meet WCAG AA contrast (≥4.5:1) in both light and dark modes.
 */
const StatusBadge = ({ status }: { status: RunStatus }) => {
    return (
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
};

/**
 * Table component for displaying a list of fuzzing runs.
 */
export default function RunHistoryTable({ 
    runs, 
    onSelectRun, 
    onViewReport, 
    onReplayRun,
    visibleColumns = ['id', 'status', 'duration', 'seedCount', 'report'] 
}: RunHistoryTableProps) {
    if (runs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-xl bg-zinc-50 dark:bg-zinc-900/20 border-zinc-200 dark:border-zinc-800">
                <p className="text-zinc-500 dark:text-zinc-400 font-medium">No fuzzing runs found.</p>
                <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">Start a new campaign to see results here.</p>
            </div>
        );
    }

    return (
        <div className="w-full overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm bg-white dark:bg-zinc-950">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                            {visibleColumns.includes('id') && <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Run ID</th>}
                            {visibleColumns.includes('status') && <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Status</th>}
                            {visibleColumns.includes('duration') && <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 text-right">Duration</th>}
                            {visibleColumns.includes('seedCount') && <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 text-right">Seed Count</th>}
                            {onReplayRun && <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 text-right">Actions</th>}
                            {visibleColumns.includes('report') && <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 text-right">Report</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {runs.map((run) => (
                            <tr
                                key={run.id}
                                tabIndex={0}
                                className="group hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors cursor-pointer"
                                onClick={() => onSelectRun(run.id)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        onSelectRun(run.id);
                                    }
                                }}
                            >
                                {visibleColumns.includes('id') && (
                                    <td className="px-6 py-4">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSelectRun(run.id);
                                            }}
                                            className="text-sm font-mono text-blue-600 dark:text-blue-400 hover:underline decoration-blue-500/30 underline-offset-4 text-left"
                                        >
                                            {run.id}
                                        </button>
                                    </td>
                                )}
                                {visibleColumns.includes('status') && (
                                    <td className="px-6 py-4">
                                        <StatusBadge status={run.status} />
                                    </td>
                                )}
                                {visibleColumns.includes('duration') && (
                                    <td className="px-6 py-4 text-sm text-zinc-600 dark:text-zinc-400 text-right tabular-nums">
                                        {formatDuration(run.duration)}
                                    </td>
                                )}
                                {visibleColumns.includes('seedCount') && (
                                    <td className="px-6 py-4 text-sm text-zinc-600 dark:text-zinc-400 text-right tabular-nums">
                                        {run.seedCount.toLocaleString()}
                                    </td>
                                )}
                                {onReplayRun && (
                                    <td className="px-6 py-4 text-right">
                                        <AddReplayFromUiAction 
                                            runId={run.id} 
                                            onReplayInitiated={onReplayRun} 
                                        />
                                    </td>
                                )}
                                {visibleColumns.includes('report') && (
                                    <td className="px-6 py-4 text-right">
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
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
