'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FuzzingRun, RunStatus } from '../../app/types';
import { STATUS_META } from '../../lib/run-status';
import { formatDuration } from '../../app/utils/format';
import { useDataTableKeyboardNav } from '../../app/use-data-table-keyboard-nav';
import type { DataTableRowKeyboardProps } from '../../app/use-data-table-keyboard-nav';
import TruncatedCell from '@/components/TruncatedCell';
import { useResponsiveRunColumns } from '../../app/use-responsive-run-columns';
import { SortableColumnHeader } from '../../components/SortableColumnHeader';
import { getNextSortState, type SortState } from '../../app/run-history-sort-utils';
import { isRunSortField, sortRuns } from '../../app/runs-sort-utils';
import { computeVirtualWindow } from '../../app/runs-table/virtual-window';

/** Height of a single data row in pixels — must match the rendered row height. */
const ROW_HEIGHT = 57;

/** Number of extra rows to render above and below the visible area (overscan). */
const OVERSCAN = 3;

/** Start fetching the next cursor page when this close to the loaded end. */
const END_REACHED_THRESHOLD = 5;

/** Column render order — used to compute stable `aria-colindex` values. */
const COLUMN_ORDER = ['id', 'status', 'area', 'severity', 'duration', 'seedCount', 'report'] as const;

interface VirtualizedRunTableProps {
    /** Loaded rows to display (may be very large). */
    runs: FuzzingRun[];
    /** Fixed pixel height for the scrollable viewport. Defaults to 480. */
    viewportHeight?: number;
    /** Called when a row is clicked or activated via keyboard. */
    onSelectRun: (runId: string) => void;
    /** Called when the "View Report" button is clicked for a run. */
    onViewReport: (run: FuzzingRun) => void;
    /** List of column IDs to show. */
    visibleColumns?: string[];
    /** Set of selected run IDs for bulk actions */
    selectedRunIds?: Set<string>;
    /** Called to toggle selection of a run */
    onToggleRunSelection?: (runId: string) => void;
    /** Called to toggle selection of all runs */
    onToggleAllRunsSelection?: (runIds: string[]) => void;
    /** Active sort state (controlled) */
    sortState?: SortState<string> | null;
    /** Callback invoked when a sortable column header is activated */
    onSort?: (field: string) => void;

    // ── Cursor pagination (#1875) ──────────────────────────────────────────
    /** Total rows matching the current filters, across all pages. */
    totalCount?: number | null;
    /** Whether the API has more rows beyond the loaded ones. */
    hasMore?: boolean;
    /** The next page is currently being appended. */
    loadingMore?: boolean;
    /** Called when the virtual viewport nears the end of the loaded rows. */
    onEndReached?: () => void;
    /**
     * Changing this key scrolls the table back to the top (filters, search or
     * sort changed). Appending pages must NOT change it.
     */
    scrollResetKey?: string;

    // ── Selection announcements (#1875) ───────────────────────────────────
    /** Number of selected runs (may exceed the loaded page in query mode). */
    selectedCount?: number;
    /** Accessible label for the header select-all checkbox (count preview). */
    selectAllLabel?: string;
    /** Whether the selection covers every run matching the current filter. */
    allMatchingSelected?: boolean;
    /** Polite live-region text announced when selection changes. */
    selectionAnnouncement?: string;
}

const StatusBadge = memo(({ status }: { status: RunStatus }) => (
    <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border status-badge ${STATUS_META[status].badgeClass}`}
    >
        {STATUS_META[status].label}
    </span>
));
StatusBadge.displayName = 'StatusBadge';

type ColumnIndexLookup = (column: string) => number;

/**
 * A single virtualized data row.
 *
 * Rendered absolutely inside the inner scroll container so that only rows
 * currently inside (or just outside) the viewport are in the DOM. Exposed to
 * assistive technology as a `grid` row with a 1-based `aria-rowindex`
 * (the header row is row 1) and per-cell `aria-colindex` values.
 */
const VirtualRow = memo(({
    run,
    top,
    rowIndex,
    columnIndex,
    selectable,
    onSelectRun,
    onViewReport,
    visibleColumns,
    selected,
    onToggleRunSelection,
    rowKeyboardProps,
}: {
    run: FuzzingRun;
    top: number;
    rowIndex: number;
    columnIndex: ColumnIndexLookup;
    selectable: boolean;
    onSelectRun: (id: string) => void;
    onViewReport: (run: FuzzingRun) => void;
    visibleColumns: string[];
    selected: boolean;
    onToggleRunSelection?: (id: string) => void;
    rowKeyboardProps: DataTableRowKeyboardProps;
}) => {
    return (
        <tr
            role="row"
            aria-rowindex={rowIndex + 1}
            aria-selected={selectable ? selected : undefined}
            style={{ position: 'absolute', top, left: 0, right: 0, height: ROW_HEIGHT, display: 'flex', alignItems: 'center' }}
            {...rowKeyboardProps}
            className={`group transition-colors cursor-pointer border-b border-zinc-100 dark:border-zinc-800 w-full ${
                selected
                    ? "bg-blue-50/80 dark:bg-blue-900/20"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900/30"
            }`}
            onClick={() => onSelectRun(run.id)}
        >
            {onToggleRunSelection && (
                <td
                    role="gridcell"
                    aria-colindex={columnIndex('select')}
                    className="px-6 w-12 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-center">
                        <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => onToggleRunSelection(run.id)}
                            aria-label={`Select run ${run.id}`}
                            className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                        />
                    </div>
                </td>
            )}
            {visibleColumns.includes('id') && (
                <td role="gridcell" aria-colindex={columnIndex('id')} className="px-6 flex-1 min-w-0">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelectRun(run.id);
                        }}
                        className="text-sm font-mono text-blue-600 dark:text-blue-400 hover:underline decoration-blue-500/30 underline-offset-4 text-left w-full min-w-0"
                    >
                        <TruncatedCell>{run.id}</TruncatedCell>
                    </button>
                </td>
            )}
            {visibleColumns.includes('status') && (
                <td role="gridcell" aria-colindex={columnIndex('status')} className="px-6 w-36 shrink-0">
                    <StatusBadge status={run.status} />
                </td>
            )}
            {visibleColumns.includes('area') && (
                <td role="gridcell" aria-colindex={columnIndex('area')} className="px-6 w-28 shrink-0 text-sm text-zinc-600 dark:text-zinc-400">
                    <TruncatedCell>{run.area}</TruncatedCell>
                </td>
            )}
            {visibleColumns.includes('severity') && (
                <td
                    role="gridcell"
                    aria-colindex={columnIndex('severity')}
                    className="px-6 w-28 shrink-0 text-sm"
                    style={{ color: run.severity === 'critical' ? '#555555' : run.severity === 'high' ? '#333333' : undefined }}
                >
                    <TruncatedCell>{run.severity}</TruncatedCell>
                </td>
            )}
            {visibleColumns.includes('duration') && (
                <td role="gridcell" aria-colindex={columnIndex('duration')} className="px-6 w-28 shrink-0 text-sm text-zinc-600 dark:text-zinc-400 text-right tabular-nums">
                    {formatDuration(run.duration)}
                </td>
            )}
            {visibleColumns.includes('seedCount') && (
                <td role="gridcell" aria-colindex={columnIndex('seedCount')} className="px-6 w-32 shrink-0 text-sm text-zinc-600 dark:text-zinc-400 text-right tabular-nums">
                    {run.seedCount.toLocaleString()}
                </td>
            )}
            {visibleColumns.includes('report') && (
                <td role="gridcell" aria-colindex={columnIndex('report')} className="px-6 w-32 shrink-0 text-right">
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
});
VirtualRow.displayName = 'VirtualRow';

/**
 * VirtualizedRunTable
 *
 * Renders only the rows that are currently visible in the scroll viewport plus
 * a small overscan buffer, keeping DOM node count low even when `runs` contains
 * 100k+ entries.
 *
 * Virtualization is implemented without any third-party library: a fixed-height
 * scroll container holds an inner element whose height equals
 * `runs.length * ROW_HEIGHT`. On every (rAF-throttled) scroll frame the
 * component recomputes the first/last visible row indices with
 * `computeVirtualWindow()` and re-renders the minimal subset.
 *
 * Pagination: when the rendered window nears the end of the loaded rows and the
 * API reports more, `onEndReached` fires once per loaded length — so scrolling
 * is what fetches the next keyset page (no full dataset fetch).
 *
 * Accessibility (#1875 / #1884): the body is an ARIA `grid` with
 * `aria-rowcount`/`aria-rowindex`/`aria-colindex`/`aria-multiselectable`, rows
 * keep roving-tabindex keyboard support (arrows, PageUp/PageDown, Home/End) and
 * selection changes are announced through a polite live region. The header
 * table intentionally keeps native `table` semantics (`th[scope="col"]`,
 * `aria-sort`) instead of `role="presentation"`, so column names are no longer
 * stripped from the accessibility tree.
 */
export default function VirtualizedRunTable({
    runs,
    viewportHeight = 480,
    onSelectRun,
    onViewReport,
    visibleColumns = ['id', 'status', 'duration', 'seedCount', 'report'],
    selectedRunIds = new Set(),
    onToggleRunSelection,
    onToggleAllRunsSelection,
    sortState,
    onSort,
    totalCount = null,
    hasMore = false,
    loadingMore = false,
    onEndReached,
    scrollResetKey,
    selectedCount = 0,
    selectAllLabel,
    allMatchingSelected = false,
    selectionAnnouncement = '',
}: VirtualizedRunTableProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const scrollFrameRef = useRef<number | null>(null);

    const [internalSortState, setInternalSortState] = useState<SortState<string>>({ field: 'id', order: 'desc' });
    const activeSort = sortState !== undefined ? sortState : internalSortState;

    const handleSort = (field: string) => {
        if (onSort) {
            onSort(field);
        } else {
            setInternalSortState((prev) => getNextSortState(prev, field));
        }
    };

    const effectiveRuns = useMemo(() => {
        if (onSort || !activeSort || !activeSort.field || activeSort.order === 'none') {
            return runs;
        }
        return isRunSortField(activeSort.field)
            ? sortRuns(runs, activeSort.field, activeSort.order)
            : runs;
    }, [runs, onSort, activeSort]);

    /** Responsive column set — adapts to phone and portrait-tablet viewports. */
    const effectiveColumns = useResponsiveRunColumns(visibleColumns);

    const selectable = Boolean(onToggleRunSelection);
    const renderedColumns = COLUMN_ORDER.filter((column) => effectiveColumns.includes(column));
    const columnCount = renderedColumns.length + (selectable ? 1 : 0);

    const columnIndex = useMemo<ColumnIndexLookup>(() => {
        const indexes = new Map<string, number>();
        let next = selectable ? 1 : 0;
        if (selectable) indexes.set('select', 1);
        for (const column of renderedColumns) {
            next += 1;
            indexes.set(column, next);
        }
        return (column) => indexes.get(column) ?? next;
    }, [renderedColumns, selectable]);

    const viewportRows = Math.max(1, Math.floor(viewportHeight / ROW_HEIGHT));

    const { getRowProps } = useDataTableKeyboardNav({
        rowCount: effectiveRuns.length,
        pageSize: viewportRows,
        onActivate: (index) => {
            const run = effectiveRuns[index];
            if (run) {
                onSelectRun(run.id);
            }
        },
        onFocusRow: (index) => {
            const el = scrollRef.current;
            if (!el) {
                return;
            }
            el.scrollTop = index * ROW_HEIGHT;
            setScrollTop(index * ROW_HEIGHT);
        },
    });

    /** rAF-throttled scroll handler: at most one state update per frame. */
    const handleScroll = useCallback(() => {
        if (scrollFrameRef.current !== null) return;
        scrollFrameRef.current = requestAnimationFrame(() => {
            scrollFrameRef.current = null;
            const el = scrollRef.current;
            if (el) setScrollTop(el.scrollTop);
        });
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.addEventListener('scroll', handleScroll, { passive: true });
        return () => el.removeEventListener('scroll', handleScroll);
    }, [handleScroll]);

    useEffect(() => () => {
        if (scrollFrameRef.current !== null) {
            cancelAnimationFrame(scrollFrameRef.current);
            scrollFrameRef.current = null;
        }
    }, []);

    /** Reset scroll when the view identity changes (filter/sort/search). */
    useEffect(() => {
        if (scrollResetKey === undefined) return;
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = 0;
        setScrollTop(0);
    }, [scrollResetKey]);

    const virtualWindow = useMemo(
        () =>
            computeVirtualWindow({
                scrollTop,
                viewportHeight,
                rowHeight: ROW_HEIGHT,
                rowCount: effectiveRuns.length,
                overscan: OVERSCAN,
            }),
        [scrollTop, viewportHeight, effectiveRuns.length],
    );

    // Ask for the next page once, when the rendered window reaches the end of
    // the loaded rows. Re-armed only when more rows actually arrive (guards
    // against a server that reports `hasMore` but returns nothing).
    const requestedAtLengthRef = useRef(-1);
    useEffect(() => {
        if (!onEndReached || !hasMore || loadingMore) return;
        if (effectiveRuns.length === 0) return;
        if (virtualWindow.lastIndex < effectiveRuns.length - END_REACHED_THRESHOLD) return;
        if (requestedAtLengthRef.current === effectiveRuns.length) return;
        requestedAtLengthRef.current = effectiveRuns.length;
        onEndReached();
    }, [onEndReached, hasMore, loadingMore, virtualWindow.lastIndex, effectiveRuns.length]);

    if (effectiveRuns.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 border border-dashed rounded-xl bg-zinc-50 dark:bg-zinc-900/20 border-zinc-200 dark:border-zinc-800">
                <p className="text-zinc-500 dark:text-zinc-400 font-medium">No fuzzing runs found.</p>
                <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">Start a new campaign to see results here.</p>
            </div>
        );
    }

    const visibleRuns = effectiveRuns.slice(virtualWindow.firstIndex, virtualWindow.lastIndex + 1);
    const displayTotal = typeof totalCount === 'number' ? Math.max(totalCount, effectiveRuns.length) : effectiveRuns.length;

    const allLoadedSelected = selectable && selectedCount > 0 && selectedRunIds.size === effectiveRuns.length;
    const selectAllChecked = allLoadedSelected || allMatchingSelected;
    const selectAllIndeterminate = !selectAllChecked && selectedCount > 0;

    return (
        <div
            className="w-full overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm bg-white dark:bg-zinc-950"
            role="region"
            aria-label="Virtualized fuzzing run table"
        >
            {/* Polite live region: announces selection changes without stealing focus. */}
            <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {selectionAnnouncement}
            </div>

            <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                    {/* ── Sticky header ─────────────────────────────────────────────── */}
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 flex">
                                {selectable && (
                                    <th
                                        scope="col"
                                        aria-colindex={columnIndex('select')}
                                        className="px-6 py-4 text-[10px] font-bold text-zinc-400 w-12"
                                    >
                                        <div className="flex items-center justify-center">
                                            <input
                                                type="checkbox"
                                                checked={selectAllChecked}
                                                aria-label={
                                                    selectAllLabel ??
                                                    `Select all ${effectiveRuns.length} runs`
                                                }
                                                ref={(input) => {
                                                    if (input) {
                                                        input.indeterminate = selectAllIndeterminate;
                                                    }
                                                }}
                                                onChange={() => {
                                                    if (onToggleAllRunsSelection) {
                                                        onToggleAllRunsSelection(effectiveRuns.map(r => r.id));
                                                    }
                                                }}
                                                className="w-4 h-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                                            />
                                        </div>
                                    </th>
                                )}
                                {effectiveColumns.includes('id') && (
                                    <SortableColumnHeader
                                        field="id"
                                        label="Run ID"
                                        colIndex={columnIndex('id')}
                                        sortState={activeSort}
                                        onSort={handleSort}
                                        className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex-1 min-w-0"
                                    />
                                )}
                                {effectiveColumns.includes('status') && (
                                    <SortableColumnHeader
                                        field="status"
                                        label="Status"
                                        colIndex={columnIndex('status')}
                                        sortState={activeSort}
                                        onSort={handleSort}
                                        className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 w-36 shrink-0"
                                    />
                                )}
                                {effectiveColumns.includes('area') && (
                                    <SortableColumnHeader
                                        field="area"
                                        label="Area"
                                        colIndex={columnIndex('area')}
                                        sortState={activeSort}
                                        onSort={handleSort}
                                        className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 w-28 shrink-0"
                                    />
                                )}
                                {effectiveColumns.includes('severity') && (
                                    <SortableColumnHeader
                                        field="severity"
                                        label="Severity"
                                        colIndex={columnIndex('severity')}
                                        sortState={activeSort}
                                        onSort={handleSort}
                                        className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 w-28 shrink-0"
                                    />
                                )}
                                {effectiveColumns.includes('duration') && (
                                    <SortableColumnHeader
                                        field="duration"
                                        label="Duration"
                                        align="right"
                                        colIndex={columnIndex('duration')}
                                        sortState={activeSort}
                                        onSort={handleSort}
                                        className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 w-28 shrink-0 text-right"
                                    />
                                )}
                                {effectiveColumns.includes('seedCount') && (
                                    <SortableColumnHeader
                                        field="seedCount"
                                        label="Seed Count"
                                        align="right"
                                        colIndex={columnIndex('seedCount')}
                                        sortState={activeSort}
                                        onSort={handleSort}
                                        className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 w-32 shrink-0 text-right"
                                    />
                                )}
                                {effectiveColumns.includes('report') && (
                                    <th scope="col" aria-colindex={columnIndex('report')} className="px-6 py-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100 w-32 shrink-0 text-right">
                                        Report
                                    </th>
                                )}
                            </tr>
                        </thead>
                    </table>

                    {/* ── Scrollable virtualized body ────────────────────────────────── */}
                    <div
                        ref={scrollRef}
                        style={{ height: viewportHeight, overflowY: 'auto' }}
                        role="region"
                        aria-label={`${displayTotal} fuzzing runs`}
                    >
                        <table
                            className="w-full"
                            role="grid"
                            aria-label="Fuzzing runs"
                            aria-rowcount={displayTotal}
                            aria-colcount={columnCount}
                            aria-multiselectable={selectable ? true : undefined}
                            style={{ position: 'relative' }}
                        >
                            <tbody
                                role="rowgroup"
                                style={{ position: 'relative', display: 'block', height: virtualWindow.totalHeight }}
                            >
                                {visibleRuns.map((run, i) => {
                                    const rowIndex = virtualWindow.firstIndex + i;
                                    return (
                                    <VirtualRow
                                        key={run.id}
                                        run={run}
                                        top={rowIndex * ROW_HEIGHT}
                                        rowIndex={rowIndex}
                                        columnIndex={columnIndex}
                                        selectable={selectable}
                                        selected={selectedRunIds.has(run.id)}
                                        onSelectRun={onSelectRun}
                                        onViewReport={onViewReport}
                                        visibleColumns={effectiveColumns}
                                        onToggleRunSelection={onToggleRunSelection}
                                        rowKeyboardProps={getRowProps(rowIndex)}
                                    />
                                );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* ── Footer: row + selection summary ────────────────────────────── */}
            <div className="px-6 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex items-center justify-between gap-4">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Showing{' '}
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                        {visibleRuns.length}
                    </span>{' '}
                    of{' '}
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                        {displayTotal}
                    </span>{' '}
                    runs (virtualized)
                    {selectedCount > 0 && (
                        <span className="ml-2 text-zinc-600 dark:text-zinc-300">
                            · {selectedCount.toLocaleString()} selected
                            {allMatchingSelected ? ' (all matching filters)' : ''}
                        </span>
                    )}
                </p>
                <span className="text-xs text-zinc-400 dark:text-zinc-500 font-mono" aria-live="polite">
                    {loadingMore
                        ? 'Loading more runs…'
                        : `rows ${virtualWindow.firstIndex + 1}–${Math.min(virtualWindow.lastIndex + 1, effectiveRuns.length)}`}
                </span>
            </div>
        </div>
    );
}
