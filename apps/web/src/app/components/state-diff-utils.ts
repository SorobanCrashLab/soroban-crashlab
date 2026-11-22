/**
 * Pure helpers behind the ledger state change diff view (#1119).
 *
 * The comparison logic lives here rather than inside the component so it can be
 * unit-tested with plain Node, and so the tests exercise the same code the UI
 * runs instead of a copy of it.
 */

import type { LedgerChangeType, LedgerStateChange, LedgerFieldDiff } from '../types';

// Re-exported from the shared contract-types module (../types) for backward
// compatibility — single source of truth lives in src/types/contracts.ts.
export type { LedgerFieldDiff } from '../types';

function emptyDiff(parseFailed: boolean): LedgerFieldDiff {
    return { added: {}, removed: {}, changed: {}, unchanged: {}, parseFailed };
}

/**
 * Parses a ledger payload into a plain object.
 * Returns null for anything that is not a JSON object — arrays, primitives and
 * malformed strings all lack the key/value shape a field diff needs.
 */
function parseEntry(raw: string | undefined): Record<string, unknown> | null {
    if (raw === undefined || raw === '') return {};
    try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }
        return parsed as Record<string, unknown>;
    } catch {
        return null;
    }
}

/**
 * Compares the before/after payloads of a ledger entry, key by key.
 *
 * A missing side is treated as an empty object, so a `created` entry reports
 * every field as added and a `deleted` entry reports every field as removed.
 */
export function compareLedgerValues(
    before?: string,
    after?: string,
): LedgerFieldDiff {
    const beforeObj = parseEntry(before);
    const afterObj = parseEntry(after);

    if (beforeObj === null || afterObj === null) {
        return emptyDiff(true);
    }

    const diff = emptyDiff(false);
    const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);

    for (const key of allKeys) {
        const inBefore = Object.prototype.hasOwnProperty.call(beforeObj, key);
        const inAfter = Object.prototype.hasOwnProperty.call(afterObj, key);

        if (!inBefore && inAfter) {
            diff.added[key] = afterObj[key];
        } else if (inBefore && !inAfter) {
            diff.removed[key] = beforeObj[key];
        } else if (JSON.stringify(beforeObj[key]) !== JSON.stringify(afterObj[key])) {
            diff.changed[key] = { before: beforeObj[key], after: afterObj[key] };
        } else {
            diff.unchanged[key] = beforeObj[key];
        }
    }

    return diff;
}

/** Number of fields that actually moved — added, removed or changed. */
export function countFieldChanges(diff: LedgerFieldDiff): number {
    return (
        Object.keys(diff.added).length +
        Object.keys(diff.removed).length +
        Object.keys(diff.changed).length
    );
}

/** Filter applied to the change list; `all` disables filtering. */
export type StateChangeFilter = 'all' | LedgerChangeType;

export const STATE_CHANGE_FILTERS: readonly { id: StateChangeFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'created', label: 'Created' },
    { id: 'updated', label: 'Updated' },
    { id: 'deleted', label: 'Deleted' },
];

/** Returns the changes matching `filter`, preserving input order. */
export function filterStateChanges(
    changes: readonly LedgerStateChange[],
    filter: StateChangeFilter,
): LedgerStateChange[] {
    if (filter === 'all') return [...changes];
    return changes.filter((change) => change.changeType === filter);
}

/** Per-type totals used by the summary strip and the filter chip counts. */
export interface StateChangeSummary {
    total: number;
    created: number;
    updated: number;
    deleted: number;
}

export function summarizeStateChanges(
    changes: readonly LedgerStateChange[],
): StateChangeSummary {
    const summary: StateChangeSummary = { total: changes.length, created: 0, updated: 0, deleted: 0 };
    for (const change of changes) {
        if (change.changeType === 'created') summary.created += 1;
        else if (change.changeType === 'updated') summary.updated += 1;
        else if (change.changeType === 'deleted') summary.deleted += 1;
    }
    return summary;
}

/** Count for a single filter, so chips can show how much each one holds. */
export function countForFilter(
    summary: StateChangeSummary,
    filter: StateChangeFilter,
): number {
    return filter === 'all' ? summary.total : summary[filter];
}

/**
 * Renders a ledger payload for display: pretty-printed when it is valid JSON,
 * otherwise the raw string. Missing payloads become an empty string so callers
 * can substitute their own placeholder.
 */
export function formatLedgerValue(raw?: string): string {
    if (raw === undefined || raw === '') return '';
    try {
        return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
        return raw;
    }
}
