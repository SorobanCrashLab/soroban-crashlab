/**
 * Single source of truth for the fuzzing-run lifecycle.
 *
 * Every status literal, label, colour treatment, ordering rule and terminal
 * check lives here. Adding a lifecycle stage means adding one entry to
 * {@link RUN_STATUSES} and one to {@link STATUS_META}; the compiler then
 * points at every branch that still needs handling, instead of letting a
 * typo render a blank badge at runtime.
 *
 * Issue: #1407 - Single source of truth for run status/lifecycle enums
 */

/**
 * Every run status, in canonical display order.
 *
 * This order is what filter chips, the query builder and status clusters
 * render in, and it drives {@link RunStatusMeta.sortOrder}. It is deliberately
 * *not* used to generate fixture data — fixtures cycle through their own
 * sequences and those literal values must stay byte-identical.
 */
export const RUN_STATUSES = ['running', 'completed', 'failed', 'cancelled'] as const;

/** Status variants for a fuzzing run. */
export type RunStatus = (typeof RUN_STATUSES)[number];

/** Presentation and lifecycle metadata for a single status. */
export interface RunStatusMeta {
    /** Human-readable label, as rendered in badges and cluster headers. */
    label: string;
    /**
     * Token-backed badge class. Pairs with the `.status-badge` base class and
     * resolves through the `--status-*` custom properties in globals.css, so
     * it is theme-aware in both light and dark mode. Preferred treatment.
     */
    badgeClass: string;
    /**
     * Literal Tailwind pill classes. Kept verbatim from the call sites this
     * replaced. UPGRADE POINT: fold into `badgeClass` once the design-token
     * consolidation lands, at which point this field can be deleted.
     */
    pillClass: string;
    /** Solid-fill treatment used by the timeline swimlanes and activity rail. */
    solidClass: string;
    /** Hover variant of {@link solidClass}. */
    solidHoverClass: string;
    /** Focus-ring variant of {@link solidClass}. */
    solidFocusClass: string;
    /** Bare colour name used by cluster grouping (not a CSS class). */
    color: string;
    /** Glyph used by cluster grouping. */
    icon: string;
    /** Rank in canonical display order. Lower sorts first. */
    sortOrder: number;
    /** True once the run can no longer change state. */
    terminal: boolean;
}

/**
 * The one metadata table. Values are reverse-engineered from the call sites
 * this module replaced, so rendering is unchanged.
 */
export const STATUS_META: Record<RunStatus, RunStatusMeta> = {
    running: {
        label: 'Running',
        badgeClass: 'status-badge-running',
        pillClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
        solidClass: 'bg-blue-500 shadow-blue-500/20',
        solidHoverClass: 'hover:bg-blue-400',
        solidFocusClass: 'focus:ring-blue-500',
        color: 'blue',
        icon: '●',
        sortOrder: 0,
        terminal: false,
    },
    completed: {
        label: 'Completed',
        badgeClass: 'status-badge-completed',
        pillClass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
        solidClass: 'bg-emerald-500 shadow-emerald-500/20',
        solidHoverClass: 'hover:bg-emerald-400',
        solidFocusClass: 'focus:ring-emerald-500',
        color: 'green',
        icon: '✓',
        sortOrder: 1,
        terminal: true,
    },
    failed: {
        label: 'Failed',
        badgeClass: 'status-badge-failed',
        pillClass: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
        solidClass: 'bg-rose-500 shadow-rose-500/20',
        solidHoverClass: 'hover:bg-rose-400',
        solidFocusClass: 'focus:ring-rose-500',
        color: 'red',
        icon: '✗',
        sortOrder: 2,
        terminal: true,
    },
    cancelled: {
        label: 'Cancelled',
        badgeClass: 'status-badge-cancelled',
        pillClass: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
        solidClass: 'bg-zinc-500 shadow-zinc-500/20',
        solidHoverClass: 'hover:bg-zinc-400',
        solidFocusClass: 'focus:ring-zinc-500',
        color: 'gray',
        icon: '○',
        sortOrder: 3,
        terminal: true,
    },
};

/**
 * Neutral metadata for a status the backend emitted but this build does not
 * know about. Renders a muted badge rather than a blank one — see
 * {@link getStatusMeta}.
 */
export const UNKNOWN_STATUS_META: RunStatusMeta = {
    label: 'Unknown',
    badgeClass: 'status-badge-cancelled',
    pillClass: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
    solidClass: 'bg-zinc-500 shadow-zinc-500/20',
    solidHoverClass: 'hover:bg-zinc-400',
    solidFocusClass: 'focus:ring-zinc-500',
    color: 'gray',
    icon: '○',
    sortOrder: RUN_STATUSES.length,
    terminal: false,
};

/** Type guard for values arriving from URLs, APIs and stored filter state. */
export function isRunStatus(value: unknown): value is RunStatus {
    return typeof value === 'string' && (RUN_STATUSES as readonly string[]).includes(value);
}

/**
 * Defensive parser for untrusted input. Returns `null` for anything this
 * build does not recognise, so callers render a neutral badge instead of
 * crashing on a status a newer backend introduced.
 */
export function parseRunStatus(value: unknown): RunStatus | null {
    return isRunStatus(value) ? value : null;
}

/** Metadata lookup that never throws — unknown input yields neutral metadata. */
export function getStatusMeta(value: unknown): RunStatusMeta {
    const status = parseRunStatus(value);
    return status ? STATUS_META[status] : UNKNOWN_STATUS_META;
}

/** True once the run can no longer change state. */
export function isTerminalStatus(status: RunStatus): boolean {
    return STATUS_META[status].terminal;
}

/** Comparator placing statuses in canonical display order. */
export function compareRunStatus(a: RunStatus, b: RunStatus): number {
    return STATUS_META[a].sortOrder - STATUS_META[b].sortOrder;
}

/**
 * Exhaustiveness guard for `switch` statements over {@link RunStatus}.
 *
 * Call it from the default branch: if a new status is added to
 * {@link RUN_STATUSES} without a matching `case`, the argument is no longer
 * `never` and the build fails at that exact line.
 *
 * @example
 * switch (status) {
 *   case 'running': return 'spinning';
 *   case 'completed': return 'done';
 *   case 'failed': return 'broken';
 *   case 'cancelled': return 'stopped';
 *   default: return assertNeverStatus(status);
 * }
 */
export function assertNeverStatus(value: never): never {
    throw new Error(`Unhandled run status: ${String(value)}`);
}
