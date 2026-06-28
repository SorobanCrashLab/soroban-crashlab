'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FuzzingRun } from './types';
import { normalizeTag, runMatchesTagFilter } from './run-tags-utils';

type TaggingAndLabelsUiProps = {
  runs: FuzzingRun[];
  activeTag?: string;
  onActiveTagChange?: (tag: string) => void;
};

type LabelMap = Record<string, string[]>;

const AREA_LABELS: Record<FuzzingRun['area'], string> = {
  auth: 'auth-surface',
  state: 'stateful-flow',
  budget: 'budget-watch',
  xdr: 'xdr-encoding',
};

const SEVERITY_LABELS: Record<FuzzingRun['severity'], string> = {
  low: 'triage-low',
  medium: 'triage-medium',
  high: 'triage-high',
  critical: 'needs-immediate-review',
};

const STATUS_TONES: Record<FuzzingRun['status'], string> = {
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300',
  failed: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300',
  running: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300',
  cancelled: 'border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300',
};

const LABEL_STYLES = [
  'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300',
  'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800 dark:border-fuchsia-900/50 dark:bg-fuchsia-950/30 dark:text-fuchsia-300',
  'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300',
  'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300',
];

const formatRelativeTime = (iso?: string): string => {
  if (!iso) return 'No timestamp';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const makeSuggestedLabels = (run: FuzzingRun): string[] => {
  const labels = [
    AREA_LABELS[run.area],
    SEVERITY_LABELS[run.severity],
    run.status === 'failed' ? 'has-crash-details' : 'stable-pass',
    run.minResourceFee >= 3_000 ? 'high-fee' : 'fee-ok',
    run.cpuInstructions >= 900_000 ? 'cpu-regression-watch' : 'cpu-normal',
  ];

  if (run.associatedIssues && run.associatedIssues.length > 0) {
    labels.push('linked-issues');
  }

  return Array.from(new Set(labels));
};

const sortLabels = (labels: string[]) => [...labels].sort((a, b) => a.localeCompare(b));

export default function AddTaggingAndLabelsUi({
  runs,
  activeTag = 'all',
  onActiveTagChange,
}: TaggingAndLabelsUiProps) {
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [draftLabel, setDraftLabel] = useState('');
  const [persistedTags, setPersistedTags] = useState<LabelMap>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null;

  useEffect(() => {
    let cancelled = false;

    const loadTags = async () => {
      const entries = await Promise.all(
        runs.map(async (run) => {
          try {
            const res = await fetch(`/api/runs/${encodeURIComponent(run.id)}/tags`);
            if (!res.ok) return [run.id, run.tags ?? []] as const;
            const data = (await res.json()) as { tags?: string[] };
            return [run.id, data.tags ?? run.tags ?? []] as const;
          } catch {
            return [run.id, run.tags ?? []] as const;
          }
        }),
      );

      if (!cancelled) {
        setPersistedTags(Object.fromEntries(entries));
      }
    };

    if (runs.length > 0) {
      void loadTags();
    } else {
      queueMicrotask(() => setPersistedTags({}));
    }

    return () => {
      cancelled = true;
    };
  }, [runs]);

  const labelsByRun = useMemo(() => {
    return Object.fromEntries(
      runs.map((run) => {
        const combined = sortLabels([
          ...makeSuggestedLabels(run),
          ...(persistedTags[run.id] ?? run.tags ?? []),
        ]);
        return [run.id, combined];
      }),
    ) as LabelMap;
  }, [persistedTags, runs]);

  const allLabels = useMemo(() => {
    return sortLabels(Array.from(new Set(Object.values(labelsByRun).flat())));
  }, [labelsByRun]);

  const filteredRuns = useMemo(() => {
    if (activeTag === 'all') {
      return runs;
    }
    return runs.filter((run) =>
      runMatchesTagFilter(
        persistedTags[run.id] ?? run.tags ?? [],
        makeSuggestedLabels(run),
        activeTag,
      ),
    );
  }, [activeTag, persistedTags, runs]);

  const selectedLabels = selectedRun ? labelsByRun[selectedRun.id] ?? [] : [];
  const selectedPersistedTags = selectedRun
    ? persistedTags[selectedRun.id] ?? selectedRun.tags ?? []
    : [];

  const setActiveLabel = useCallback(
    (tag: string) => {
      onActiveTagChange?.(tag);
    },
    [onActiveTagChange],
  );

  const addLabel = async () => {
    if (!selectedRun) return;

    const normalized = normalizeTag(draftLabel);
    if (!normalized) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(selectedRun.id)}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: normalized }),
      });
      const data = (await res.json()) as { tags?: string[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to save tag');
      }
      setPersistedTags((current) => ({
        ...current,
        [selectedRun.id]: data.tags ?? [],
      }));
      setDraftLabel('');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save tag');
    } finally {
      setIsSaving(false);
    }
  };

  const removeLabel = async (runId: string, label: string) => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/tags`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: label }),
      });
      const data = (await res.json()) as { tags?: string[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to remove tag');
      }
      setPersistedTags((current) => ({
        ...current,
        [runId]: data.tags ?? [],
      }));
      if (activeTag === label) {
        setActiveLabel('all');
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to remove tag');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="w-full rounded-[2rem] border border-black/[.08] bg-white/95 p-6 shadow-sm dark:border-white/[.145] dark:bg-zinc-950/90 md:p-8">
      <div className="mb-8 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-lime-600 dark:text-lime-300">
            Tagging & Labels
          </p>
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Organize noisy runs with labels that make triage faster
          </h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400 md:text-base">
            Review suggested labels from run metadata, add persisted tags via the API, and click any label to focus matching runs across the dashboard.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 rounded-2xl border border-lime-200 bg-lime-50/80 p-4 text-sm dark:border-lime-900/60 dark:bg-lime-950/20 md:grid-cols-4">
          <div>
            <div className="font-semibold text-lime-950 dark:text-lime-100">{runs.length}</div>
            <div className="text-lime-800 dark:text-lime-300">Runs loaded</div>
          </div>
          <div>
            <div className="font-semibold text-lime-950 dark:text-lime-100">{allLabels.length}</div>
            <div className="text-lime-800 dark:text-lime-300">Available labels</div>
          </div>
          <div>
            <div className="font-semibold text-lime-950 dark:text-lime-100">{filteredRuns.length}</div>
            <div className="text-lime-800 dark:text-lime-300">Matching current filter</div>
          </div>
          <div>
            <div className="font-semibold text-lime-950 dark:text-lime-100">
              {Object.values(persistedTags).filter((tags) => tags.length > 0).length}
            </div>
            <div className="text-lime-800 dark:text-lime-300">Runs with custom tags</div>
          </div>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-10 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-400">
          Labels will appear here when the dashboard has runs to classify.
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.85fr)]">
          <div className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
            <div className="mb-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Label filter</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveLabel('all')}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    activeTag === 'all'
                      ? 'border-lime-500 bg-lime-500 text-white'
                      : 'border-zinc-300 bg-white text-zinc-700 hover:border-lime-300 hover:text-lime-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300'
                  }`}
                >
                  All labels
                </button>
                {allLabels.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setActiveLabel(activeTag === label ? 'all' : label)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      activeTag === label
                        ? 'border-lime-500 bg-lime-500 text-white'
                        : LABEL_STYLES[index % LABEL_STYLES.length]
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {filteredRuns.map((run) => {
                const runLabels = labelsByRun[run.id] ?? [];
                const isSelected = selectedRun?.id === run.id;

                return (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => setSelectedRunId(run.id)}
                    className={`w-full rounded-[1.5rem] border p-4 text-left transition ${
                      isSelected
                        ? 'border-lime-500 bg-lime-50 shadow-sm dark:border-lime-500 dark:bg-lime-950/20'
                        : 'border-zinc-200 bg-white hover:border-lime-300 dark:border-zinc-800 dark:bg-zinc-950'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">{run.id}</span>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONES[run.status]}`}>
                            {run.status}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                          {run.area} · severity {run.severity} · queued {formatRelativeTime(run.queuedAt)}
                        </div>
                      </div>
                      <div className="text-right text-sm text-zinc-500 dark:text-zinc-400">
                        {run.associatedIssues?.length ?? 0} linked issues
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {runLabels.map((label, index) => (
                        <span
                          key={label}
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${LABEL_STYLES[index % LABEL_STYLES.length]}`}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}

              {filteredRuns.length === 0 && (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
                  No runs match the current label filter.
                </div>
              )}
            </div>
          </div>

          <aside className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50/80 p-5 dark:border-zinc-800 dark:bg-zinc-900/70">
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Selected run</p>
              <h3 className="mt-2 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {selectedRun?.id ?? 'No run selected'}
              </h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {selectedRun
                  ? `Manage persisted tags for the ${selectedRun.area} run and keep triage context close to the data.`
                  : 'Choose a run to review and edit its tags.'}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <label htmlFor="new-run-label" className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Add custom tag
              </label>
              <div className="mt-3 flex gap-2">
                <input
                  id="new-run-label"
                  value={draftLabel}
                  onChange={(event) => setDraftLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void addLabel();
                    }
                  }}
                  placeholder="needs-repro, partner-followup..."
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  disabled={isSaving || !selectedRun}
                />
                <button
                  type="button"
                  onClick={() => void addLabel()}
                  disabled={isSaving || !selectedRun}
                  className="rounded-xl bg-lime-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-lime-700 disabled:opacity-60"
                >
                  {isSaving ? 'Saving...' : 'Add'}
                </button>
              </div>
              {saveError && (
                <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{saveError}</p>
              )}
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Tags are normalized to lowercase kebab-case and persisted via `/api/runs/[id]/tags`.
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Current labels</h4>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedLabels.map((label, index) => {
                  const isCustom = selectedPersistedTags.includes(label);
                  return (
                    <span
                      key={label}
                      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${LABEL_STYLES[index % LABEL_STYLES.length]}`}
                    >
                      {label}
                      {isCustom && selectedRun && (
                        <button
                          type="button"
                          onClick={() => void removeLabel(selectedRun.id, label)}
                          className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] transition hover:bg-black/20"
                          aria-label={`Remove tag ${label}`}
                          disabled={isSaving}
                        >
                          remove
                        </button>
                      )}
                    </span>
                  );
                })}
                {selectedLabels.length === 0 && (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No labels available for this run yet.</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
