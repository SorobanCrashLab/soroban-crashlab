import { describe, it, expect } from 'vitest';
import {
    RUN_STATUSES,
    STATUS_META,
    UNKNOWN_STATUS_META,
    assertNeverStatus,
    compareRunStatus,
    getStatusMeta,
    isRunStatus,
    isTerminalStatus,
    parseRunStatus,
    type RunStatus,
} from './run-status';

describe('RUN_STATUSES', () => {
    it('is the canonical display order the UI renders in', () => {
        expect([...RUN_STATUSES]).toEqual(['running', 'completed', 'failed', 'cancelled']);
    });

    it('has metadata for every status and no orphan entries', () => {
        expect(Object.keys(STATUS_META).sort()).toEqual([...RUN_STATUSES].sort());
    });

    it('numbers sortOrder densely, matching the declared order', () => {
        expect(RUN_STATUSES.map((s) => STATUS_META[s].sortOrder)).toEqual([0, 1, 2, 3]);
    });
});

describe('lifecycle semantics', () => {
    it('treats running as the only non-terminal status', () => {
        expect(RUN_STATUSES.filter((s) => !isTerminalStatus(s))).toEqual(['running']);
    });

    it('sorts into canonical order regardless of input order', () => {
        const shuffled: RunStatus[] = ['cancelled', 'failed', 'running', 'completed'];
        expect([...shuffled].sort(compareRunStatus)).toEqual([
            'running',
            'completed',
            'failed',
            'cancelled',
        ]);
    });

    it('is a stable comparator for equal statuses', () => {
        expect(compareRunStatus('failed', 'failed')).toBe(0);
    });
});

describe('defensive parsing', () => {
    it('accepts every known status', () => {
        for (const status of RUN_STATUSES) {
            expect(parseRunStatus(status)).toBe(status);
            expect(isRunStatus(status)).toBe(true);
        }
    });

    it('returns null for a status this build does not know', () => {
        // A newer backend could start emitting these; the UI must not crash.
        expect(parseRunStatus('queued')).toBeNull();
        expect(parseRunStatus('RUNNING')).toBeNull();
        expect(parseRunStatus('')).toBeNull();
    });

    it('returns null for non-string input instead of throwing', () => {
        for (const value of [undefined, null, 42, {}, [], true, Symbol('running')]) {
            expect(parseRunStatus(value)).toBeNull();
            expect(isRunStatus(value)).toBe(false);
        }
    });

    it('renders a neutral badge for an unknown status rather than blowing up', () => {
        const meta = getStatusMeta('queued');
        expect(meta).toBe(UNKNOWN_STATUS_META);
        expect(meta.label).toBe('Unknown');
        expect(meta.pillClass).toContain('bg-gray-100');
        expect(meta.badgeClass).toBe('status-badge-cancelled');
    });

    it('returns real metadata for known statuses', () => {
        expect(getStatusMeta('running')).toBe(STATUS_META.running);
        expect(getStatusMeta('completed').label).toBe('Completed');
    });

    it('sorts unknown statuses last', () => {
        expect(UNKNOWN_STATUS_META.sortOrder).toBeGreaterThan(
            Math.max(...RUN_STATUSES.map((s) => STATUS_META[s].sortOrder)),
        );
    });
});

describe('assertNeverStatus', () => {
    it('throws when reached at runtime with an unexpected value', () => {
        // Only reachable if a status slipped past the compiler (e.g. an `as`
        // cast or untyped API data), so it must fail loudly, not silently.
        expect(() => assertNeverStatus('queued' as never)).toThrow(/Unhandled run status: queued/);
    });
});

describe('presentation metadata', () => {
    it('gives every status a non-empty label and class set', () => {
        for (const status of RUN_STATUSES) {
            const meta = STATUS_META[status];
            expect(meta.label.length).toBeGreaterThan(0);
            expect(meta.badgeClass).toBe(`status-badge-${status}`);
            expect(meta.pillClass).toContain('dark:');
            expect(meta.solidClass).toMatch(/^bg-/);
            expect(meta.solidHoverClass).toMatch(/^hover:/);
            expect(meta.solidFocusClass).toMatch(/^focus:ring-/);
            expect(meta.icon.length).toBeGreaterThan(0);
        }
    });

    it('capitalises the label from the status name', () => {
        for (const status of RUN_STATUSES) {
            expect(STATUS_META[status].label).toBe(
                status.charAt(0).toUpperCase() + status.slice(1),
            );
        }
    });
});
