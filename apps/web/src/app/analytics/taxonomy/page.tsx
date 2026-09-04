'use client';

/**
 * Failure classification taxonomy — /analytics/taxonomy (#1121).
 *
 * Shows every observed crash category grouped into families, with a
 * multi-select category filter driving both the breakdown and the list of
 * matching runs. Styled with the Navy Professional CSS variables so it follows
 * the active theme.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { FuzzingRun, RunSeverity } from '../../types';
import { fetchRuns } from '../../../lib/api-client';
import {
    buildCategoryBreakdown,
    filterRunsByCategories,
    groupBreakdownByFamily,
    summarizeTaxonomy,
    toggleCategory,
    type CategoryBreakdown,
} from './failure-taxonomy-utils';

type DataState = 'loading' | 'success' | 'error';

const SEVERITY_COLORS: Record<RunSeverity, string> = {
    critical: '#CC1016',
    high: '#C37D16',
    medium: '#0A66C2',
    low: '#057642',
};

const ACCENT = '#0A66C2';

/** Headline number in the summary strip. */
function SummaryCard({ label, value, hint }: { label: string; value: number; hint: string }) {
    return (
        <div className="card card-padding">
            <div className="text-meta">{label}</div>
            <div className="font-semibold text-2xl mt-1" style={{ color: 'var(--text-primary)' }}>
                {value.toLocaleString()}
            </div>
            <div className="text-caption mt-0.5">{hint}</div>
        </div>
    );
}

/** Proportion bar showing how much of all failures a category accounts for. */
function ShareBar({ share, color }: { share: number; color: string }) {
    return (
        <div
            className="h-1.5 rounded-full overflow-hidden mt-2"
            style={{ background: 'var(--chip-bg)' }}
            role="presentation"
        >
            <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(share * 100, 2)}%`, background: color }}
            />
        </div>
    );
}

/** One selectable category card. */
function CategoryCard({
    entry,
    isSelected,
    onToggle,
}: {
    entry: CategoryBreakdown;
    isSelected: boolean;
    onToggle: () => void;
}) {
    const color = SEVERITY_COLORS[entry.topSeverity];

    return (
        <button
            type="button"
            onClick={onToggle}
            aria-pressed={isSelected}
            className="card card-padding card-interactive text-left w-full"
            style={isSelected ? { borderColor: ACCENT, background: 'var(--highlight-bg)' } : undefined}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                        {entry.definition.label}
                    </h3>
                    <p className="text-meta mt-0.5 text-xs">{entry.definition.description}</p>
                </div>
                <span className="font-semibold text-lg shrink-0" style={{ color }}>
                    {entry.count}
                </span>
            </div>

            <ShareBar share={entry.share} color={color} />

            <div className="flex flex-wrap gap-1.5 mt-3">
                <span className="chip text-xs" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
                    {entry.topSeverity}
                </span>
                {entry.areas.map((area) => (
                    <span key={area} className="chip text-xs">
                        {area}
                    </span>
                ))}
                <span className="chip text-xs">
                    {entry.signatures.length} signature{entry.signatures.length === 1 ? '' : 's'}
                </span>
            </div>

            <p className="text-caption mt-2">{entry.definition.triageHint}</p>
        </button>
    );
}

export default function FailureTaxonomyPage() {
    const [runs, setRuns] = useState<FuzzingRun[]>([]);
    const [dataState, setDataState] = useState<DataState>('loading');
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

    useEffect(() => {
        let cancelled = false;
        fetchRuns()
            .then((data) => {
                if (cancelled) return;
                setRuns(data.runs ?? []);
                setDataState('success');
            })
            .catch(() => {
                if (!cancelled) setDataState('error');
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const breakdown = useMemo(() => buildCategoryBreakdown(runs), [runs]);
    const families = useMemo(() => groupBreakdownByFamily(breakdown), [breakdown]);
    const summary = useMemo(() => summarizeTaxonomy(breakdown), [breakdown]);
    const matchingRuns = useMemo(
        () => filterRunsByCategories(runs, selectedCategories),
        [runs, selectedCategories],
    );

    const handleToggle = (category: string) =>
        setSelectedCategories((previous) => toggleCategory(previous, category));

    return (
        <div className="container-full page-padding fade-in">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4 sm:mb-6">
                <div>
                    <h1 className="heading-page">Failure Taxonomy</h1>
                    <p className="text-meta mt-0.5 sm:mt-1">
                        Crash categories grouped by family, with triage guidance and a filter by category
                    </p>
                </div>
                <Link href="/analytics" className="btn-outline text-xs sm:text-sm px-3 sm:px-6 h-8 sm:h-10">
                    Analytics
                </Link>
            </div>

            {dataState === 'loading' && (
                <div role="status" aria-live="polite" className="space-y-4">
                    <span className="sr-only">Loading failure taxonomy</span>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                        {[0, 1, 2, 3].map((index) => (
                            <div key={index} className="skeleton h-24 rounded-lg" />
                        ))}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                        {[0, 1, 2, 3].map((index) => (
                            <div key={index} className="skeleton h-40 rounded-lg" />
                        ))}
                    </div>
                </div>
            )}

            {dataState === 'error' && (
                <div
                    role="alert"
                    className="card card-padding text-center py-8 sm:py-12"
                    style={{ borderLeft: '4px solid #CC1016' }}
                >
                    <p className="font-semibold" style={{ color: '#CC1016' }}>
                        Failed to load failure data
                    </p>
                    <p className="text-meta mt-1 mb-3 sm:mb-4">Check your connection and try again.</p>
                    <button type="button" onClick={() => window.location.reload()} className="btn-primary text-xs sm:text-sm">
                        Retry
                    </button>
                </div>
            )}

            {dataState === 'success' && breakdown.length === 0 && (
                <div className="card card-padding text-center py-12">
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                        No classified failures yet
                    </p>
                    <p className="text-meta mt-1">
                        Failed runs that carry crash detail are classified here automatically.
                    </p>
                </div>
            )}

            {dataState === 'success' && breakdown.length > 0 && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
                        <SummaryCard label="Classified failures" value={summary.classifiedFailures} hint="failed runs with crash detail" />
                        <SummaryCard label="Categories" value={summary.categories} hint="distinct failure kinds" />
                        <SummaryCard label="Families" value={summary.families} hint="top-level groupings" />
                        <SummaryCard label="Signatures" value={summary.signatures} hint="de-duplicated crash keys" />
                    </div>

                    {/* Category filter */}
                    <div className="card card-padding mb-6">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-secondary)' }}>
                                Filter by category
                            </h2>
                            {selectedCategories.length > 0 && (
                                <button type="button" onClick={() => setSelectedCategories([])} className="link text-xs">
                                    Clear {selectedCategories.length} filter
                                    {selectedCategories.length === 1 ? '' : 's'}
                                </button>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by failure category">
                            {breakdown.map((entry) => {
                                const isSelected = selectedCategories.includes(entry.definition.category);
                                return (
                                    <button
                                        key={entry.definition.category}
                                        type="button"
                                        onClick={() => handleToggle(entry.definition.category)}
                                        aria-pressed={isSelected}
                                        className={`chip text-xs ${isSelected ? 'chip-active' : ''}`}
                                    >
                                        {entry.definition.label} ({entry.count})
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-caption mt-3">
                            {selectedCategories.length === 0
                                ? 'Showing every classified failure. Select one or more categories to narrow the list.'
                                : `Showing ${matchingRuns.length} run${matchingRuns.length === 1 ? '' : 's'} across ${selectedCategories.length} selected categor${selectedCategories.length === 1 ? 'y' : 'ies'}.`}
                        </p>
                    </div>

                    {/* Taxonomy by family */}
                    {families.map((family) => (
                        <section key={family.family} className="mb-6">
                            <div className="flex items-baseline justify-between gap-2 mb-2 sm:mb-3">
                                <h2 className="heading-subtitle">{family.label}</h2>
                                <span className="text-meta">
                                    {family.count} failure{family.count === 1 ? '' : 's'}
                                </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                                {family.entries.map((entry) => (
                                    <CategoryCard
                                        key={entry.definition.category}
                                        entry={entry}
                                        isSelected={selectedCategories.includes(entry.definition.category)}
                                        onToggle={() => handleToggle(entry.definition.category)}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}

                    {/* Matching runs */}
                    <section>
                        <h2 className="heading-subtitle mb-2 sm:mb-3">
                            Matching runs ({matchingRuns.length})
                        </h2>
                        {matchingRuns.length === 0 ? (
                            <div className="card card-padding text-center py-10">
                                <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                                    No runs in the selected categories
                                </p>
                                <p className="text-meta mt-1">Clear or change the filter above to see failures.</p>
                            </div>
                        ) : (
                            <div className="card overflow-x-auto">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th scope="col">Run</th>
                                            <th scope="col">Category</th>
                                            <th scope="col">Area</th>
                                            <th scope="col">Severity</th>
                                            <th scope="col">Signature</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {matchingRuns.map((run) => (
                                            <tr key={run.id}>
                                                <td>
                                                    <Link href={`/runs/${run.id}`} className="link">
                                                        {run.id}
                                                    </Link>
                                                </td>
                                                <td>{run.crashDetail?.failureCategory}</td>
                                                <td>{run.area}</td>
                                                <td style={{ color: SEVERITY_COLORS[run.severity] }}>{run.severity}</td>
                                                <td className="code-text">{run.crashDetail?.signature}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}
