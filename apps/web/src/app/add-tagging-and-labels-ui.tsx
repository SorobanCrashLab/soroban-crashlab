'use client';

import { useMemo, useState } from 'react';
import type { FuzzingRun } from './types';

type TaggingAndLabelsUiProps = {
  runs: FuzzingRun[];
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

export default function AddTaggingAndLabelsUi({ runs }: TaggingAndLabelsUiProps) {
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [activeLabel, setActiveLabel] = useState<string>('all');
  const [draftLabel, setDraftLabel] = useState('');
  const [customLabels, setCustomLabels] = useState<LabelMap>({});

  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null;

  const labelsByRun = useMemo(() => {
    return Object.fromEntries(
      runs.map((run) => {
        const combined = sortLabels([...makeSuggestedLabels(run), ...(customLabels[run.id] ?? [])]);
        return [run.id, combined];
      }),
    ) as LabelMap;
  }, [customLabels, runs]);

  const allLabels = useMemo(() => {
    return sortLabels(Array.from(new Set(Object.values(labelsByRun).flat())));
  }, [labelsByRun]);

  const filteredRuns = useMemo(() => {
    if (activeLabel === 'all') {
      return runs;
    }
    return runs.filter((run) => (labelsByRun[run.id] ?? []).includes(activeLabel));
  }, [activeLabel, labelsByRun, runs]);

  const selectedLabels = selectedRun ? labelsByRun[selectedRun.id] ?? [] : [];

  const addLabel = () => {
    if (!selectedRun) return;

    const normalized = draftLabel.trim().toLowerCase().replace(/\s+/g, '-');
    if (!normalized) return;

    setCustomLabels((current) => {
      const next = new Set(current[selectedRun.id] ?? []);
      next.add(normalized);
      return { ...current, [selectedRun.id]: sortLabels(Array.from(next)) };
    });
    setDraftLabel('');
  };

  const removeLabel = (runId: string, label: string) => {
    setCustomLabels((current) => {
      const nextLabels = (current[runId] ?? []).filter((item) => item !== label);
      if (nextLabels.length === 0) {
        const rest = { ...current };
        delete rest[runId];
        return rest;
      }
      return { ...current, [runId]: nextLabels };
    });

    if (activeLabel === label) {
      setActiveLabel('all');
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
            Review suggested labels from run metadata, add your own working labels, and click any label to instantly focus the matching runs in the dashboard.
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
            <div className="font-semibold text-lime-950 dark:text-lime-100">{Object.keys(customLabels).length}</div>
            <div className="text-lime-800 dark:text-lime-300">Runs with custom labels</div>
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
                    activeLabel === 'all'
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
                    onClick={() => setActiveLabel((current) => (current === label ? 'all' : label))}
                    className={`rounded-full border px-3 py-1.5 text-sm transition ${
                      activeLabel === label
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
                  ? `Manage dashboard labels for the ${selectedRun.area} run and keep triage context close to the data.`
                  : 'Choose a run to review and edit its labels.'}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <label htmlFor="new-run-label" className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Add custom label
              </label>
              <div className="mt-3 flex gap-2">
                <input
                  id="new-run-label"
                  value={draftLabel}
                  onChange={(event) => setDraftLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addLabel();
                    }
                  }}
                  placeholder="needs-repro, partner-followup..."
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <button
                  type="button"
                  onClick={addLabel}
                  className="rounded-xl bg-lime-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-lime-700"
                >
                  Add
                </button>
              </div>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Labels are normalized to lowercase kebab-case for consistent filtering.
              </p>
            </div>

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Current labels</h4>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedLabels.map((label, index) => {
                  const isCustom = (customLabels[selectedRun?.id ?? ''] ?? []).includes(label);
                  return (
                    <span
                      key={label}
                      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${LABEL_STYLES[index % LABEL_STYLES.length]}`}
                    >
                      {label}
                      {isCustom && selectedRun && (
                        <button
                          type="button"
                          onClick={() => removeLabel(selectedRun.id, label)}
                          className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] transition hover:bg-black/20"
                          aria-label={`Remove label ${label}`}
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

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Suggested workflow</h4>
              <ul className="mt-3 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
                <li>Use suggested labels to group runs by area, severity, and resource pressure.</li>
                <li>Add temporary labels such as `needs-repro` or `ship-blocker` while you triage issues.</li>
                <li>Click a label in the filter bar to narrow the dashboard to only matching runs.</li>
              </ul>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
