'use client';

import { useMemo, useState } from 'react';
import { FuzzingRun, RunArea, RunSeverity } from './types';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A leaf entry in the taxonomy: one distinct crash signature with all the
 * runs that share it.
 */
interface TaxonomyEntry {
    signature: string;
    runs: FuzzingRun[];
    count: number;
    replayAction: string;
}

/**
 * Middle tier: all entries within one (area + severity) bucket.
 */
interface AreaSeverityGroup {
    area: RunArea;
    severity: RunSeverity;
    entries: TaxonomyEntry[];
    totalCount: number;
}

/**
 * Top tier: all area/severity groups that share the same failure category
 * (e.g. "Panic", "InvariantViolation").
 */
interface CategoryNode {
    category: string;
    groups: AreaSeverityGroup[];
    totalCount: number;
}

// ─── Visual constants ────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<RunSeverity, { badge: string; bar: string }> = {
    low: {
        badge: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300',
        bar: 'bg-emerald-500',
    },
    medium: {
        badge: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300',
        bar: 'bg-amber-500',
    },
    high: {
        badge: 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300',
        bar: 'bg-orange-500',
    },
    critical: {
        badge: 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300',
        bar: 'bg-rose-500',
    },
};

const AREA_STYLES: Record<RunArea, string> = {
    auth: 'border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300',
    state: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300',
    budget: 'border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300',
    xdr: 'border-fuchsia-200 dark:border-fuchsia-800 bg-fuchsia-50 dark:bg-fuchsia-950/30 text-fuchsia-700 dark:text-fuchsia-300',
};

/** Severity display order (most severe first) */
const SEVERITY_ORDER: RunSeverity[] = ['critical', 'high', 'medium', 'low'];

// ─── Data derivation ─────────────────────────────────────────────────────────

/**
 * Derives the three-tier taxonomy from a list of fuzzing runs.
 * Only failed runs with a `crashDetail` are considered.
 * Tree shape: Category → (Area × Severity) → Signature.
 */
function buildTaxonomy(runs: FuzzingRun[]): CategoryNode[] {
    // category → area+severity key → signature → entries
    const tree = new Map<string, Map<string, Map<string, TaxonomyEntry>>>();

    for (const run of runs) {
        if (run.status !== 'failed' || !run.crashDetail) continue;
        const { failureCategory, signature, replayAction } = run.crashDetail;

        if (!tree.has(failureCategory)) {
            tree.set(failureCategory, new Map());
        }
        const byCategory = tree.get(failureCategory)!;

        const groupKey = `${run.area}::${run.severity}`;
        if (!byCategory.has(groupKey)) {
            byCategory.set(groupKey, new Map());
        }
        const byGroup = byCategory.get(groupKey)!;

        if (!byGroup.has(signature)) {
            byGroup.set(signature, {
                signature,
                runs: [],
                count: 0,
                replayAction,
            });
        }
        const entry = byGroup.get(signature)!;
        entry.runs.push(run);
        entry.count += 1;
    }

    const nodes: CategoryNode[] = [];

    for (const [category, byCategory] of tree) {
        const groups: AreaSeverityGroup[] = [];

        for (const [groupKey, byGroup] of byCategory) {
            const [area, severity] = groupKey.split('::') as [RunArea, RunSeverity];
            const entries = [...byGroup.values()].sort((a, b) => b.count - a.count);
            const totalCount = entries.reduce((sum, e) => sum + e.count, 0);
            groups.push({ area, severity, entries, totalCount });
        }

        // Sort groups: severity order first, then area alphabetically
        groups.sort((a, b) => {
            const si = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
            if (si !== 0) return si;
            return a.area.localeCompare(b.area);
        });

        const totalCount = groups.reduce((sum, g) => sum + g.totalCount, 0);
        nodes.push({ category, groups, totalCount });
    }

    return nodes.sort((a, b) => b.totalCount - a.totalCount);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Small pill badge. */
const Badge = ({ children, className }: { children: React.ReactNode; className: string }) => (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}>
        {children}
    </span>
);

/** Visual proportion bar. */
const ProportionBar = ({
    value,
    max,
    colorClass,
}: {
    value: number;
    max: number;
    colorClass: string;
}) => (
    <div className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
        <div
            className={`h-full rounded-full transition-all ${colorClass}`}
            style={{ width: `${Math.max(4, (value / max) * 100)}%` }}
        />
    </div>
);

/** Chevron icon that rotates when open. */
const Chevron = ({ open }: { open: boolean }) => (
    <svg
        className={`w-4 h-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
    >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
);

/** Expandable row for a single crash signature. */
function SignatureRow({
    entry,
    totalInGroup,
}: {
    entry: TaxonomyEntry;
    totalInGroup: number;
}) {
    const [open, setOpen] = useState(false);

    return (
        <li className="rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((p) => !p)}
                className="w-full flex items-start gap-3 p-3 hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition text-left"
                aria-expanded={open}
            >
                <Chevron open={open} />
                <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-zinc-700 dark:text-zinc-300 break-all leading-5">
                        {entry.signature}
                    </p>
                    <div className="mt-1.5">
                        <ProportionBar
                            value={entry.count}
                            max={totalInGroup}
                            colorClass="bg-zinc-400 dark:bg-zinc-500"
                        />
                    </div>
                </div>
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 tabular-nums shrink-0">
                    ×{entry.count}
                </span>
            </button>

            {open && (
                <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 pb-4 pt-3 space-y-3">
                    {/* Replay command */}
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">
                            Replay command
                        </p>
                        <pre className="text-xs font-mono bg-zinc-900 dark:bg-zinc-800 text-emerald-400 dark:text-emerald-300 rounded-lg px-3 py-2 overflow-x-auto whitespace-pre-wrap break-all">
                            {entry.replayAction}
                        </pre>
                    </div>

                    {/* Run list */}
                    <div>
                        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-1">
                            Matching runs
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {entry.runs.map((run) => (
                                <span
                                    key={run.id}
                                    className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-700 dark:text-zinc-300"
                                >
                                    {run.id}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </li>
    );
}

/** Expandable card for an (area × severity) group. */
function AreaSeverityCard({
    group,
    maxGroupCount,
}: {
    group: AreaSeverityGroup;
    maxGroupCount: number;
}) {
    const [open, setOpen] = useState(false);
    const sev = SEVERITY_STYLES[group.severity];

    return (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen((p) => !p)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-100/60 dark:hover:bg-zinc-800/40 transition text-left"
                aria-expanded={open}
            >
                <Chevron open={open} />

                <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-y-1.5 gap-x-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Badge className={AREA_STYLES[group.area]}>
                            {group.area.toUpperCase()}
                        </Badge>
                        <Badge className={sev.badge}>
                            {group.severity}
                        </Badge>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                            {group.entries.length} unique signature{group.entries.length !== 1 ? 's' : ''}
                        </span>
                    </div>

                    <div className="flex items-center gap-2 min-w-0 sm:max-w-[160px] w-full">
                        <ProportionBar value={group.totalCount} max={maxGroupCount} colorClass={sev.bar} />
                        <span className="text-xs font-semibold tabular-nums text-zinc-600 dark:text-zinc-300 shrink-0">
                            {group.totalCount}
                        </span>
                    </div>
                </div>
            </button>

            {open && (
                <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 pb-4 pt-3">
                    <ul className="space-y-2">
                        {group.entries.map((entry) => (
                            <SignatureRow
                                key={entry.signature}
                                entry={entry}
                                totalInGroup={group.totalCount}
                            />
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

/** Expandable top-level card for a failure category. */
function CategoryCard({
    node,
    maxCategoryCount,
}: {
    node: CategoryNode;
    maxCategoryCount: number;
}) {
    const [open, setOpen] = useState(true); // open by default so the first level is visible

    const maxGroupCount = useMemo(
        () => Math.max(...node.groups.map((g) => g.totalCount), 1),
        [node.groups],
    );

    return (
        <article
            className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-sm"
            aria-label={`Category: ${node.category}`}
        >
            <button
                type="button"
                onClick={() => setOpen((p) => !p)}
                className="w-full flex items-center gap-4 p-5 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition text-left"
                aria-expanded={open}
            >
                <Chevron open={open} />

                <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-y-2 gap-x-6">
                    <div>
                        <p className="font-bold text-zinc-900 dark:text-zinc-50 text-base">
                            {node.category}
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {node.groups.length} area-severity combination{node.groups.length !== 1 ? 's' : ''} ·{' '}
                            {node.groups.reduce((sum, g) => sum + g.entries.length, 0)} unique signatures
                        </p>
                    </div>

                    <div className="flex items-center gap-3 min-w-0 md:max-w-[200px] w-full">
                        <ProportionBar
                            value={node.totalCount}
                            max={maxCategoryCount}
                            colorClass="bg-zinc-600 dark:bg-zinc-400"
                        />
                        <span className="text-sm font-bold tabular-nums text-zinc-700 dark:text-zinc-200 shrink-0">
                            {node.totalCount} crash{node.totalCount !== 1 ? 'es' : ''}
                        </span>
                    </div>
                </div>
            </button>

            {open && (
                <div className="border-t border-zinc-100 dark:border-zinc-800 px-5 pb-5 pt-4 space-y-3">
                    {node.groups.map((group) => (
                        <AreaSeverityCard
                            key={`${group.area}-${group.severity}`}
                            group={group}
                            maxGroupCount={maxGroupCount}
                        />
                    ))}
                </div>
            )}
        </article>
    );
}

// ─── Stats summary strip ─────────────────────────────────────────────────────

function StatStrip({
    label,
    value,
    sub,
}: {
    label: string;
    value: number | string;
    sub?: string;
}) {
    return (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40 px-4 py-3">
            <div className="text-xl font-bold text-zinc-900 dark:text-zinc-50 tabular-nums">{value}</div>
            <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{label}</div>
            {sub && <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>}
        </div>
    );
}

// ─── Main export ─────────────────────────────────────────────────────────────

interface FailureClassificationTaxonomyProps {
    /** Full list of fuzzing runs. Only failed runs with crash details are used. */
    runs: FuzzingRun[];
}

/**
 * FailureClassificationTaxonomy
 *
 * Renders a three-tier interactive taxonomy of observed failures:
 *   Category  (e.g. Panic, InvariantViolation)
 *     └─ Area × Severity  (e.g. auth × critical)
 *          └─ Signature  (stable de-dup key with run list + replay command)
 *
 * Each tier is collapsible. Visual proportion bars let users instantly spot
 * the most impactful failure categories without reading every number.
 */
export default function FailureClassificationTaxonomy({ runs }: FailureClassificationTaxonomyProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [severityFilter, setSeverityFilter] = useState<'all' | RunSeverity>('all');
    const [areaFilter, setAreaFilter] = useState<'all' | RunArea>('all');

    const taxonomy = useMemo(() => buildTaxonomy(runs), [runs]);

    /** Apply search + filters at the category level (any matching group passes the category through). */
    const filtered = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return taxonomy
            .map((node) => {
                const filteredGroups = node.groups
                    .filter((group) => {
                        if (severityFilter !== 'all' && group.severity !== severityFilter) return false;
                        if (areaFilter !== 'all' && group.area !== areaFilter) return false;
                        return true;
                    })
                    .map((group) => {
                        if (!q) return group;
                        const filteredEntries = group.entries.filter(
                            (e) =>
                                e.signature.toLowerCase().includes(q) ||
                                node.category.toLowerCase().includes(q),
                        );
                        return filteredEntries.length > 0
                            ? { ...group, entries: filteredEntries, totalCount: filteredEntries.reduce((s, e) => s + e.count, 0) }
                            : null;
                    })
                    .filter(Boolean) as typeof node.groups;

                if (filteredGroups.length === 0) return null;
                return {
                    ...node,
                    groups: filteredGroups,
                    totalCount: filteredGroups.reduce((s, g) => s + g.totalCount, 0),
                };
            })
            .filter(Boolean) as CategoryNode[];
    }, [taxonomy, searchQuery, severityFilter, areaFilter]);

    const maxCategoryCount = useMemo(
        () => Math.max(...filtered.map((n) => n.totalCount), 1),
        [filtered],
    );

    // Summary stats from the full (unfiltered) taxonomy
    const totalCrashes = useMemo(
        () => taxonomy.reduce((s, n) => s + n.totalCount, 0),
        [taxonomy],
    );
    const totalCategories = taxonomy.length;
    const totalSignatures = useMemo(
        () => taxonomy.reduce((s, n) => s + n.groups.reduce((gs, g) => gs + g.entries.length, 0), 0),
        [taxonomy],
    );
    const uniqueAreas = useMemo(
        () => new Set(taxonomy.flatMap((n) => n.groups.map((g) => g.area))).size,
        [taxonomy],
    );

    return (
        <section
            id="failure-classification-taxonomy"
            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm"
            aria-label="Failure classification taxonomy"
        >
            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="p-6 md:p-8 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40">
                <div className="flex items-start gap-3 mb-1">
                    <div className="h-8 w-8 rounded-lg bg-rose-600 dark:bg-rose-500 flex items-center justify-center text-white shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                            Failure Classification Taxonomy
                        </h2>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            Three-tier breakdown of observed crashes: category → area × severity → signature.
                            Expand any level to drill into signatures and replay commands.
                        </p>
                    </div>
                </div>

                {/* Stats strip */}
                <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                    <StatStrip label="Total crashes" value={totalCrashes} sub="failed runs with crash detail" />
                    <StatStrip label="Categories" value={totalCategories} sub="distinct failure kinds" />
                    <StatStrip label="Unique signatures" value={totalSignatures} sub="de-duplicated keys" />
                    <StatStrip label="Areas affected" value={uniqueAreas} sub="out of auth, state, budget, xdr" />
                </div>
            </div>

            {/* ── Filters ────────────────────────────────────────────── */}
            <div className="px-6 md:px-8 py-4 border-b border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950/60 flex flex-col sm:flex-row gap-3">
                {/* Search */}
                <div className="relative flex-1">
                    <svg
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
                    </svg>
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter by category or signature…"
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                </div>

                {/* Severity filter */}
                <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value as 'all' | RunSeverity)}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                    aria-label="Filter by severity"
                >
                    <option value="all">All severities</option>
                    {SEVERITY_ORDER.map((s) => (
                        <option key={s} value={s}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                        </option>
                    ))}
                </select>

                {/* Area filter */}
                <select
                    value={areaFilter}
                    onChange={(e) => setAreaFilter(e.target.value as 'all' | RunArea)}
                    className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                    aria-label="Filter by area"
                >
                    <option value="all">All areas</option>
                    <option value="auth">Auth</option>
                    <option value="state">State</option>
                    <option value="budget">Budget</option>
                    <option value="xdr">XDR</option>
                </select>

                {(searchQuery || severityFilter !== 'all' || areaFilter !== 'all') && (
                    <button
                        type="button"
                        onClick={() => {
                            setSearchQuery('');
                            setSeverityFilter('all');
                            setAreaFilter('all');
                        }}
                        className="px-3 py-2 rounded-xl text-sm font-semibold text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition shrink-0"
                    >
                        Clear filters
                    </button>
                )}
            </div>

            {/* ── Taxonomy tree ───────────────────────────────────────── */}
            <div className="p-6 md:p-8">
                {runs.every((r) => r.status !== 'failed' || !r.crashDetail) ? (
                    <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-10 text-center">
                        <svg className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">No classified failures yet.</p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">Failed runs with crash details will appear here.</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                        No failures match the current filters.
                    </div>
                ) : (
                    <div className="space-y-4" role="list" aria-label="Failure categories">
                        {filtered.map((node) => (
                            <CategoryCard
                                key={node.category}
                                node={node}
                                maxCategoryCount={maxCategoryCount}
                            />
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
