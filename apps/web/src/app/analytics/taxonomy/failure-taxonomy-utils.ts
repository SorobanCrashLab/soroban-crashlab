/**
 * Failure classification taxonomy (#1121).
 *
 * Groups failed runs by the crash category the backend reports, and attaches a
 * definition to each category so the dashboard can explain what a category
 * means and where to start triaging it. Categories roll up into families, which
 * gives the taxonomy two levels: family → category → run.
 *
 * DOM-free so it can be unit-tested with plain Node.
 */

import type { FuzzingRun, RunArea, RunSeverity } from '../../types';

/** Broad grouping a failure category belongs to. */
export type FailureFamily = 'correctness' | 'resource' | 'authorization' | 'encoding' | 'other';

export const FAILURE_FAMILY_LABELS: Record<FailureFamily, string> = {
    correctness: 'Correctness',
    resource: 'Resource limits',
    authorization: 'Authorization',
    encoding: 'Encoding',
    other: 'Unclassified',
};

/** What a category means and how to approach it. */
export interface FailureCategoryDefinition {
    /** Raw category string as emitted by the backend crash index. */
    category: string;
    /** Human-readable name shown in the UI. */
    label: string;
    family: FailureFamily;
    description: string;
    /** First thing a triager should check. */
    triageHint: string;
}

/**
 * Known categories. Anything the backend reports that is not listed here still
 * appears in the UI, via {@link classifyFailureCategory}, under the `other`
 * family — an unrecognised category must never be silently dropped.
 */
export const FAILURE_TAXONOMY: readonly FailureCategoryDefinition[] = [
    {
        category: 'Panic',
        label: 'Panic',
        family: 'correctness',
        description: 'The contract aborted — an unwrap, an explicit panic, or an arithmetic overflow.',
        triageHint: 'Replay the seed and read the last frame before the abort.',
    },
    {
        category: 'InvariantViolation',
        label: 'Invariant violation',
        family: 'correctness',
        description: 'A property the contract is supposed to uphold no longer held after execution.',
        triageHint: 'Compare the ledger state diff before and after the failing call.',
    },
    {
        category: 'BudgetExceeded',
        label: 'Budget exceeded',
        family: 'resource',
        description: 'The run ran past its CPU instruction or memory budget.',
        triageHint: 'Check the resource fee panel for which limit was hit first.',
    },
    {
        category: 'Timeout',
        label: 'Timeout',
        family: 'resource',
        description: 'The run did not reach a terminal state inside its time limit.',
        triageHint: 'Look for unbounded loops over attacker-controlled input.',
    },
    {
        category: 'AuthFailure',
        label: 'Authorization failure',
        family: 'authorization',
        description: 'A call was rejected, or wrongly accepted, by the authorization checks.',
        triageHint: 'Confirm which signer the harness used and what the contract required.',
    },
    {
        category: 'XdrDecodeError',
        label: 'XDR decode error',
        family: 'encoding',
        description: 'A payload could not be decoded into the expected XDR structure.',
        triageHint: 'Inspect the raw payload in the crash trace for truncation.',
    },
];

const TAXONOMY_BY_CATEGORY = new Map(
    FAILURE_TAXONOMY.map((definition) => [definition.category, definition]),
);

/**
 * Looks up a category definition, synthesising one for categories this build
 * does not know about so new backend categories still render.
 */
export function classifyFailureCategory(category: string): FailureCategoryDefinition {
    const known = TAXONOMY_BY_CATEGORY.get(category);
    if (known) return known;

    return {
        category,
        label: category,
        family: 'other',
        description: 'No taxonomy entry for this category yet.',
        triageHint: 'Triage manually, then add it to FAILURE_TAXONOMY.',
    };
}

/** Most severe first — the order severities are listed and compared in. */
export const SEVERITY_ORDER: readonly RunSeverity[] = ['critical', 'high', 'medium', 'low'];

function severityRank(severity: RunSeverity): number {
    return SEVERITY_ORDER.indexOf(severity);
}

/** Returns the runs the taxonomy covers: failed runs that carry crash detail. */
export function getClassifiedRuns(runs: readonly FuzzingRun[]): FuzzingRun[] {
    return runs.filter((run) => run.status === 'failed' && run.crashDetail !== null);
}

/** Everything the UI needs to render one category row. */
export interface CategoryBreakdown {
    definition: FailureCategoryDefinition;
    /** Number of failed runs in this category. */
    count: number;
    runIds: string[];
    /** Distinct crash signatures seen, in first-seen order. */
    signatures: string[];
    /** Distinct areas affected, alphabetical. */
    areas: RunArea[];
    /** Distinct severities seen, most severe first. */
    severities: RunSeverity[];
    /** Highest severity observed in this category. */
    topSeverity: RunSeverity;
    /** Fraction of all classified failures, 0–1. */
    share: number;
}

/**
 * Builds one breakdown per observed category, ordered by count (descending)
 * then label, so the biggest problem is always first.
 */
export function buildCategoryBreakdown(runs: readonly FuzzingRun[]): CategoryBreakdown[] {
    const classified = getClassifiedRuns(runs);
    const buckets = new Map<string, { runs: FuzzingRun[]; signatures: string[] }>();

    for (const run of classified) {
        const category = run.crashDetail!.failureCategory;
        let bucket = buckets.get(category);
        if (!bucket) {
            bucket = { runs: [], signatures: [] };
            buckets.set(category, bucket);
        }
        bucket.runs.push(run);
        if (!bucket.signatures.includes(run.crashDetail!.signature)) {
            bucket.signatures.push(run.crashDetail!.signature);
        }
    }

    const total = classified.length;

    return [...buckets.entries()]
        .map(([category, bucket]) => {
            const severities = [...new Set(bucket.runs.map((run) => run.severity))].sort(
                (left, right) => severityRank(left) - severityRank(right),
            );

            return {
                definition: classifyFailureCategory(category),
                count: bucket.runs.length,
                runIds: bucket.runs.map((run) => run.id),
                signatures: bucket.signatures,
                areas: [...new Set(bucket.runs.map((run) => run.area))].sort(),
                severities,
                topSeverity: severities[0],
                share: total === 0 ? 0 : bucket.runs.length / total,
            };
        })
        .sort((left, right) =>
            right.count !== left.count
                ? right.count - left.count
                : left.definition.label.localeCompare(right.definition.label),
        );
}

/**
 * Adds or removes a category from the selection.
 * Returns a new array; the input is never mutated.
 */
export function toggleCategory(selected: readonly string[], category: string): string[] {
    return selected.includes(category)
        ? selected.filter((entry) => entry !== category)
        : [...selected, category];
}

/**
 * Filters classified runs down to the selected categories.
 * An empty selection means "no filter", so every classified run is returned.
 */
export function filterRunsByCategories(
    runs: readonly FuzzingRun[],
    selected: readonly string[],
): FuzzingRun[] {
    const classified = getClassifiedRuns(runs);
    if (selected.length === 0) return classified;
    return classified.filter((run) => selected.includes(run.crashDetail!.failureCategory));
}

/** Headline numbers for the page summary strip. */
export interface TaxonomySummary {
    classifiedFailures: number;
    categories: number;
    families: number;
    signatures: number;
}

export function summarizeTaxonomy(breakdown: readonly CategoryBreakdown[]): TaxonomySummary {
    const signatures = new Set<string>();
    const families = new Set<FailureFamily>();

    for (const entry of breakdown) {
        families.add(entry.definition.family);
        for (const signature of entry.signatures) signatures.add(signature);
    }

    return {
        classifiedFailures: breakdown.reduce((total, entry) => total + entry.count, 0),
        categories: breakdown.length,
        families: families.size,
        signatures: signatures.size,
    };
}

/** Groups a breakdown by family, preserving the breakdown's ordering within each. */
export function groupBreakdownByFamily(
    breakdown: readonly CategoryBreakdown[],
): { family: FailureFamily; label: string; entries: CategoryBreakdown[]; count: number }[] {
    const groups = new Map<FailureFamily, CategoryBreakdown[]>();

    for (const entry of breakdown) {
        const existing = groups.get(entry.definition.family);
        if (existing) existing.push(entry);
        else groups.set(entry.definition.family, [entry]);
    }

    return [...groups.entries()]
        .map(([family, entries]) => ({
            family,
            label: FAILURE_FAMILY_LABELS[family],
            entries,
            count: entries.reduce((total, entry) => total + entry.count, 0),
        }))
        .sort((left, right) => right.count - left.count);
}
