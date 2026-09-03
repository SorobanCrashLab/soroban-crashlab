/**
 * Replay Diff Viewer UI - Side-by-side keyed table with field-level diffs.
 */

import { DiffResult, DiffOpType } from './index';

export interface ReplayDiffViewerProps {
    result: DiffResult;
    onToggleFilter?: (filter: 'all' | DiffOpType) => void;
    currentFilter?: 'all' | DiffOpType;
    lazyLoadDetails?: boolean;
}

export function createReplayDiffViewerComponent(): string {
    return `
// ReplayDiffViewer.tsx
'use client';

import { useState, useMemo } from 'react';
import { 
    DiffOperation, 
    DiffResult, 
    filterOperations, 
    summarizeOperations,
    DiffOpType 
} from '@/lib/replay-diff';

interface ReplayDiffViewerProps {
    result: DiffResult;
    onToggleFilter?: (filter: 'all' | DiffOpType) => void;
    currentFilter?: 'all' | DiffOpType;
    lazyLoadDetails?: boolean;
}

const TYPE_COLORS = {
    added: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-800 dark:text-green-200', border: 'border-green-300 dark:border-green-700' },
    removed: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-800 dark:text-red-200', border: 'border-red-300 dark:border-red-700' },
    changed: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-800 dark:text-amber-200', border: 'border-amber-300 dark:border-amber-700' },
    unchanged: { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-600 dark:text-zinc-400', border: 'border-zinc-300 dark:border-zinc-700' },
} as const;

const TYPE_LABELS = {
    added: 'Added',
    removed: 'Removed',
    changed: 'Changed',
    unchanged: 'Unchanged',
};

const TYPE_ICONS = {
    added: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
    ),
    removed: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
        </svg>
    ),
    changed: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
    ),
    unchanged: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    ),
};

export default function ReplayDiffViewer({ 
    result, 
    onToggleFilter, 
    currentFilter = 'all',
    lazyLoadDetails = true 
}: ReplayDiffViewerProps) {
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState<'all' | DiffOpType>(currentFilter || 'all');

    const handleFilterChange = (newFilter: 'all' | DiffOpType) => {
        setFilter(newFilter);
        onToggleFilter?.(newFilter);
    };

    const filteredOps = useMemo(
        () => filterOperations(result.operations, filter),
        [result.operations, filter]
    );

    const summary = useMemo(
        () => summarizeOperations(result.operations),
        [result.operations]
    );

    const toggleRow = (key: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const isExpanded = (key: string) => expandedRows.has(key);

    if (!result.comparability.compatible) {
        return (
            <div className="w-full p-8 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/50 rounded-2xl flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h3 className="text-lg font-bold text-red-900 dark:text-red-100">Runs Not Comparable</h3>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1 max-w-md">{result.comparability.reason}</p>
                <div className="mt-4 text-xs text-muted">
                    <p>Left: {result.metadata.leftRunId} ({result.metadata.leftContractId})</p>
                    <p>Right: {result.metadata.rightRunId} ({result.metadata.rightContractId})</p>
                </div>
            </div>
        );
    }

    const totalOps = filteredOps.length;

    return (
        <div className="w-full space-y-4">
            {/* Summary strip */}
            <div className="flex flex-wrap gap-2">
                {(['all', 'added', 'removed', 'changed', 'unchanged'] as const).map(type => {
                    const colors = TYPE_COLORS[type];
                    const count = type === 'all' ? summary.total : summary[type];
                    return (
                        <button
                            key={type}
                            onClick={() => handleFilterChange(type)}
                            className={\`px-3 py-1.5 text-xs font-medium rounded-full border transition-all \${
                                filter === type 
                                    ? \`\${colors.bg} \${colors.text} border-\${type}-500 shadow-sm\`
                                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                            }\`}
                        >
                            <span className="flex items-center gap-1">
                                {TYPE_ICONS[type]}
                                <span>{TYPE_LABELS[type]}</span>
                            </span>
                            <span className={\`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold \${colors.bg} \${colors.text}\`}>
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Incompatibility warning */}
            {!result.comparability.compatible && (
                <div className="mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                        <strong>Not comparable:</strong> {result.comparability.reason}
                    </p>
                </div>
            )}

            {/* Diff table */}
            <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                <table className="w-full text-sm">
                    <thead className="surface-soft/50 border-b border-zinc-200 dark:border-zinc-800">
                        <tr>
                            <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400 w-8"></th>
                            <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400 w-10">Type</th>
                            <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Ledger Key</th>
                            <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400 w-24">Change</th>
                            <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400">Entry Type</th>
                            <th className="px-3 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400 w-24">Details</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {filteredOps.map((op, idx) => (
                            <tr
                                key={op.key}
                                className={\`hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors \${
                                    op.type !== 'unchanged' ? 'bg-\${op.type}-50 dark:bg-\${op.type}-900/20' : ''
                                }\`}
                            >
                                <td className="px-3 py-2">
                                    <button
                                        onClick={() => toggleRow(op.key)}
                                        className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 transition"
                                        aria-label={expandedRows.has(op.key) ? 'Collapse' : 'Expand'}
                                    >
                                        {op.fieldDiffs && op.fieldDiffs.length > 0 && (
                                            <svg className={\`w-4 h-4 text-zinc-500 transition-transform \${expandedRows.has(op.key) ? 'rotate-90' : ''}\`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        )}
                                    </button>
                                </td>
                                <td className="px-3 py-2">
                                    <span className={\`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium \${TYPE_COLORS[op.type].bg} \${TYPE_COLORS[op.type].text}\`}>
                                        {TYPE_ICONS[op.type]}
                                        {TYPE_LABELS[op.type]}
                                    </span>
                                </td>
                                <td className="px-3 py-2 font-mono text-xs text-zinc-700 dark:text-zinc-300 truncate max-w-xs" title={op.ledgerKey}>
                                    {op.ledgerKey}
                                </td>
                                <td className="px-3 py-2">
                                    <span className={\`px-2 py-0.5 rounded-full text-xs font-medium \${TYPE_COLORS[op.type].bg} \${TYPE_COLORS[op.type].text}\`}>
                                        {op.changeType}
                                    </span>
                                </td>
                                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400 text-xs">
                                    {op.entryType}
                                </td>
                                <td className="px-3 py-2">
                                    {op.fieldDiffs && op.fieldDiffs.length > 0 && (
                                        <button
                                            onClick={() => toggleRow(op.key)}
                                            className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                                        >
                                            {op.fieldDiffs.filter(f => f.type !== 'unchanged').length} field{op.fieldDiffs.filter(f => f.type !== 'unchanged').length !== 1 ? 's' : ''} changed
                                        </button>
                                    )}
                                </td>
                            </tr>
                            {expandedRows.has(op.key) && op.fieldDiffs && op.fieldDiffs.length > 0 && (
                                <tr className="surface-soft/30">
                                    <td colSpan={6} className="px-6 py-3">
                                        <div className="space-y-2 ml-10 border-l-2 border-zinc-200 dark:border-zinc-700 pl-4">
                                            {op.fieldDiffs!.map((field, fIdx) => {
                                                const colors = TYPE_COLORS[field.type];
                                                return (
                                                    <div key={fIdx} className="flex items-center gap-3">
                                                        <span className={\`px-2 py-0.5 rounded text-xs font-medium \${colors.bg} \${colors.text}\`}>
                                                            {field.type.toUpperCase()}
                                                        </span>
                                                        <span className="font-mono text-sm text-zinc-700 dark:text-zinc-300 w-32 truncate">
                                                            {field.key}
                                                        </span>
                                                        {field.type !== 'removed' && (
                                                            <span className="text-muted text-sm">→</span>
                                                        )}
                                                        {field.type !== 'added' && (
                                                            <code className="text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded font-mono max-w-xs truncate block">
                                                                {JSON.stringify(field.before)}
                                                            </code>
                                                        )}
                                                        {field.type !== 'removed' && (
                                                            <code className="text-sm text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded font-mono max-w-xs truncate block">
                                                                {JSON.stringify(field.after)}
                                                            </code>
                                                        )}
                                                        {field.parseFailed && (
                                                            <span className="ml-2 px-1.5 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 rounded">
                                                                Parse Failed
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        ))}
                    </tbody>
                </table>
            </div>

            {filteredOps.length === 0 && (
                <div className="text-center py-12 text-muted">
                    {filter === 'all' ? 'No differences found' : \`No \${TYPE_LABELS[filter].toLowerCase()} entries\`}
                </div>
            )}

            {/* Metadata footer */}
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 text-xs text-muted flex flex-wrap gap-4">
                <span>Diff time: {result.metadata.diffTimeMs.toFixed(2)}ms</span>
                <span>Left: {result.metadata.leftRunId}</span>
                <span>Right: {result.metadata.rightRunId}</span>
            </div>
        </div>
    );
}
`;
}