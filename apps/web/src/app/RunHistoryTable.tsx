'use client';

import Link from 'next/link';
import { FuzzingRun, RunStatus } from './types';

interface RunHistoryTableProps {
    /** Array of fuzzing runs to display */
    runs: FuzzingRun[];
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
 */
const StatusBadge = ({ status }: { status: RunStatus }) => {
    const styles = {
        running: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800',
        completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800',
        failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800',
        cancelled: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700',
    };

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
    );
};

/**
 * Table component for displaying a list of fuzzing runs.
 */
export default function RunHistoryTable({ runs }: RunHistoryTableProps) {
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
                            <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Run ID</th>
                            <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">Status</th>
                            <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 text-right">Duration</th>
                            <th className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 text-right">Seed Count</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {runs.map((run) => (
                            <tr
                                key={run.id}
                                className="group hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors cursor-pointer"
                            >
                                <td className="px-6 py-4">
                                    <Link
                                        href={`/runs/${run.id}`}
                                        className="text-sm font-mono text-blue-600 dark:text-blue-400 hover:underline decoration-blue-500/30 underline-offset-4"
                                    >
                                        {run.id}
                                    </Link>
                                </td>
                                <td className="px-6 py-4">
                                    <StatusBadge status={run.status} />
                                </td>
                                <td className="px-6 py-4 text-sm text-zinc-600 dark:text-zinc-400 text-right tabular-nums">
                                    {formatDuration(run.duration)}
                                </td>
                                <td className="px-6 py-4 text-sm text-zinc-600 dark:text-zinc-400 text-right tabular-nums">
                                    {run.seedCount.toLocaleString()}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
