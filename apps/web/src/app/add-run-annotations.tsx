'use client';

import React, { useState, useMemo, ChangeEvent, KeyboardEvent } from 'react';
import type { FuzzingRun } from './types';
import { addAnnotation, removeAnnotation, MAX_ANNOTATION_LENGTH } from './run-annotations-utils';

interface AddRunAnnotationsProps {
  runs: FuzzingRun[];
}

export default function AddRunAnnotations({ runs }: AddRunAnnotationsProps) {
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [noteDraft, setNoteDraft] = useState('');
  const [customAnnotations, setCustomAnnotations] = useState<Record<string, string[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedRun = runs.find((r) => r.id === selectedRunId) || (runs.length > 0 ? runs[0] : null);

  const handleAddAnnotation = () => {
    if (!selectedRun) return;

    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    // Simulate async persistence (e.g. API call)
    setTimeout(() => {
      const result = addAnnotation(customAnnotations[selectedRun.id] || [], noteDraft);
      if (!result.success) {
        setError(result.error ?? 'Failed to add annotation');
      } else {
        setCustomAnnotations((prev) => ({ ...prev, [selectedRun.id]: result.annotations }));
        setNoteDraft('');
        setSuccessMessage('Annotation added');
        setTimeout(() => setSuccessMessage(null), 2500);
      }
      setIsSubmitting(false);
    }, 300);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleAddAnnotation();
    }
    if (e.key === 'Escape') {
      setNoteDraft('');
      setError(null);
    }
  };

  const handleRemoveAnnotation = (runId: string, index: number) => {
    setCustomAnnotations((prev) => ({
      ...prev,
      [runId]: removeAnnotation(prev[runId] || [], index),
    }));
  };

  const annotationsForSelected = useMemo(() => {
    const base = selectedRun?.annotations || [];
    const custom = (selectedRun && customAnnotations[selectedRun.id]) || [];
    return [...base, ...custom];
  }, [selectedRun, customAnnotations]);

  const charsRemaining = MAX_ANNOTATION_LENGTH - noteDraft.length;
  const isOverLimit = charsRemaining < 0;
  const canSubmit = !isSubmitting && !!selectedRun && noteDraft.trim().length > 0 && !isOverLimit;

  return (
    <section
      aria-labelledby="run-annotations-heading"
      className="w-full rounded-[2rem] border border-black/[.08] bg-white/95 p-6 shadow-sm dark:border-white/[.145] dark:bg-zinc-950/90 md:p-8 mt-12"
    >
      <div className="mb-8">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-indigo-600 dark:text-indigo-400">
          Run Annotations
        </p>
        <h2 id="run-annotations-heading" className="text-3xl font-semibold tracking-tight md:text-4xl">
          Attach context to your fuzzing results
        </h2>
        <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400 md:text-base">
          Document your findings, reproduction steps, or triage status directly on a run. Annotations help your team understand the impact of a failure.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_350px]">
        <div className="space-y-6">
          <div className="flex flex-col gap-4">
            <label htmlFor="run-selector" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Select a run to annotate
            </label>
            <select
              id="run-selector"
              value={selectedRunId || (selectedRun?.id || '')}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                setSelectedRunId(e.target.value);
                setError(null);
              }}
              className="w-full max-w-md rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm shadow-sm transition hover:border-indigo-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-900"
            >
              <option value="" disabled>Choose a run...</option>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.id} — {run.area} ({run.status})
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-6 dark:border-indigo-900/30 dark:bg-indigo-950/20">
            <h3 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {selectedRun ? `Annotating ${selectedRun.id}` : 'No run selected'}
            </h3>

            <div className="space-y-4">
              <div>
                <label htmlFor="annotation-textarea" className="sr-only">
                  Annotation text
                </label>
                <textarea
                  id="annotation-textarea"
                  value={noteDraft}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
                    setNoteDraft(e.target.value);
                    setError(null);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your notes here... (e.g. 'Reproduction successful with seed X', 'False positive due to mock state')"
                  aria-describedby="annotation-hint annotation-char-count"
                  aria-invalid={isOverLimit || !!error}
                  disabled={isSubmitting}
                  className={`w-full min-h-[120px] rounded-xl border bg-white p-4 text-sm shadow-sm focus:ring-2 dark:bg-zinc-950 transition disabled:opacity-60 ${
                    isOverLimit
                      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20'
                      : 'border-zinc-200 focus:border-indigo-500 focus:ring-indigo-500/20 dark:border-zinc-800'
                  }`}
                />
                <div className="mt-1.5 flex items-center justify-between">
                  <p id="annotation-hint" className="text-xs text-zinc-400 dark:text-zinc-500">
                    Press Ctrl+Enter to submit · Esc to clear
                  </p>
                  <p
                    id="annotation-char-count"
                    aria-live="polite"
                    className={`text-xs font-medium tabular-nums ${
                      isOverLimit ? 'text-rose-500' : charsRemaining <= 50 ? 'text-amber-500' : 'text-zinc-400'
                    }`}
                  >
                    {charsRemaining} / {MAX_ANNOTATION_LENGTH}
                  </p>
                </div>
              </div>

              {error && (
                <p role="alert" className="text-sm text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  {error}
                </p>
              )}

              {successMessage && (
                <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {successMessage}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleAddAnnotation}
                  disabled={!canSubmit}
                  aria-busy={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isSubmitting ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Saving…
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Add Annotation
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div
          role="region"
          aria-label="Active annotations"
          aria-live="polite"
          className="rounded-2xl border border-zinc-200 bg-zinc-50/50 p-6 dark:border-zinc-800 dark:bg-zinc-900/40"
        >
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Active Annotations ({annotationsForSelected.length})
          </h3>

          {annotationsForSelected.length > 0 ? (
            <ul className="space-y-3">
              {annotationsForSelected.map((note, index) => {
                const baseCount = selectedRun?.annotations?.length || 0;
                const isCustom = index >= baseCount;
                const customIndex = index - baseCount;
                return (
                  <li
                    key={`${selectedRun?.id}-${index}`}
                    className="group relative rounded-xl border border-white bg-white p-4 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <p className="text-zinc-700 dark:text-zinc-300 leading-relaxed break-words">
                      {note}
                    </p>
                    {isCustom && (
                      <button
                        type="button"
                        onClick={() => handleRemoveAnnotation(selectedRun!.id, customIndex)}
                        className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white opacity-0 transition group-hover:opacity-100 hover:bg-rose-600 shadow-sm focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-rose-400"
                        aria-label={`Remove annotation: ${note.slice(0, 40)}${note.length > 40 ? '…' : ''}`}
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                    <div className="mt-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                      {isCustom ? 'Added now' : 'Persistent annotation'}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 rounded-full bg-zinc-100 p-3 dark:bg-zinc-800">
                <svg className="h-6 w-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">No annotations yet</p>
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Add notes via the editor on the left</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
