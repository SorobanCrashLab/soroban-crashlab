'use client';

/** Query editor with DSL highlighting, validation, autocomplete and live controls (#075). */

import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  applyCompletion,
  getCompletions,
  getQueryHighlights,
  type CompletionItem,
} from './dsl/autocomplete';
import { QUERY_EXAMPLES } from './dsl/parser';
import type { UseLogQueryResult } from './hooks/useLogQuery';

const HIGHLIGHT_CLASS: Record<string, string> = {
  field: 'text-[#7c3aed] dark:text-violet-300',
  operator: 'text-[var(--color-error,#dc2626)]',
  value: 'text-[var(--color-success,#0f766e)]',
  keyword: 'font-bold text-[#0A66C2]',
  range: 'text-[#b45309]',
  paren: 'text-meta',
  whitespace: '',
  comment: 'text-meta',
};

export interface QueryBarProps {
  query: UseLogQueryResult;
}

export function QueryBar({ query }: QueryBarProps) {
  const {
    state, parsed, setQuery, facets, recentQueries, savedQueries, applyState,
    saveCurrentQuery, shareUrl, setMode, paused, setPaused, rate, notices,
    fetching, canonicalQuery, sample, setSample,
  } = query;

  const inputRef = useRef<HTMLInputElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [activeCompletion, setActiveCompletion] = useState(0);
  const [cursor, setCursor] = useState(state.query.length);

  const completion = useMemo(() => {
    if (!focused) return null;
    const result = getCompletions({ source: state.query, cursor, facets });
    return result.items.length > 0 ? result : null;
  }, [focused, facets, cursor, state.query]);

  // Derive a safe index instead of resetting state in an effect: the item
  // count can shrink as the user types without an extra render pass.
  const activeIndex = completion ? Math.min(activeCompletion, completion.items.length - 1) : 0;

  const highlights = useMemo(() => getQueryHighlights(state.query), [state.query]);
  const errors = parsed.diagnostics.filter((item) => item.severity === 'error');
  const warnings = parsed.diagnostics.filter((item) => item.severity === 'warning');

  const chooseCompletion = useCallback((item: CompletionItem) => {
    if (!completion) return;
    const next = applyCompletion(state.query, completion.replaceRange, item.insertText);
    setQuery(next.source);
    setCursor(next.cursor);
    setActiveCompletion(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [completion, setQuery, state.query]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (completion) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveCompletion((current) => (current + 1) % completion.items.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveCompletion((current) => (current - 1 + completion.items.length) % completion.items.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        chooseCompletion(completion.items[activeIndex]);
        return;
      }
      if (event.key === 'Escape') {
        setFocused(false);
        return;
      }
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      setFocused(false);
    }
    if (event.key === '/') {
      event.preventDefault();
      inputRef.current?.focus();
    }
  }, [activeIndex, chooseCompletion, completion]);

  const handleShare = useCallback(() => {
    void navigator.clipboard?.writeText(`${window.location.origin}${shareUrl}`);
  }, [shareUrl]);

  return (
    <section aria-label="Log query controls" className="card card-padding mb-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <label htmlFor="log-query-input" className="heading-section text-sm">Query</label>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Search mode" className="flex gap-1">
            <button
              type="button"
              className={state.mode === 'historical' ? 'chip chip-active text-xs' : 'chip text-xs'}
              aria-pressed={state.mode === 'historical'}
              onClick={() => setMode('historical')}
            >
              Historical
            </button>
            <button
              type="button"
              className={state.mode === 'live' ? 'chip chip-active text-xs' : 'chip text-xs'}
              aria-pressed={state.mode === 'live'}
              onClick={() => setMode('live')}
            >
              Live tail
            </button>
          </div>
          <button type="button" className="btn-ghost text-xs" onClick={() => setShowExamples((value) => !value)} aria-expanded={showExamples}>
            Examples
          </button>
          <button type="button" className="btn-ghost text-xs" onClick={handleShare}>Copy share link</button>
          <button
            type="button"
            className="btn-ghost text-xs"
            onClick={() => {
              const name = window.prompt('Name this query');
              if (name) saveCurrentQuery(name);
            }}
          >
            Save query
          </button>
        </div>
      </div>

      <div className="relative">
        <div
          ref={highlightRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre font-mono text-sm px-3 py-2"
        >
          {highlights.map((highlight, index) => (
            <span key={index} className={HIGHLIGHT_CLASS[highlight.kind] ?? ''}>
              {state.query.slice(highlight.start, highlight.end)}
            </span>
          ))}
        </div>
        <input
          id="log-query-input"
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Search logs"
          aria-autocomplete="list"
          aria-expanded={Boolean(completion)}
          aria-controls="log-query-completions"
          aria-invalid={errors.length > 0}
          aria-describedby="log-query-help"
          className="input-field font-mono text-sm relative bg-transparent text-transparent caret-current placeholder:text-meta"
          value={state.query}
          placeholder="level:error AND trace_id:tr-*"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(event.target.selectionStart ?? event.target.value.length);
            setActiveCompletion(0);
          }}
          onClick={(event) => setCursor(event.currentTarget.selectionStart ?? state.query.length)}
          onKeyUp={(event) => setCursor(event.currentTarget.selectionStart ?? state.query.length)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          onScroll={(event) => {
            if (highlightRef.current) {
              highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
            }
          }}
        />

        {completion && (
          <ul id="log-query-completions" role="listbox" aria-label="Query suggestions" className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto card">
            {completion.items.map((item, index) => (
              <li key={`${item.kind}:${item.label}`} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  className={`w-full text-left px-3 py-2 text-xs ${index === activeIndex ? 'bg-[var(--bg-subtle)]' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseCompletion(item)}
                >
                  <span className="text-meta mr-2">{item.kind}</span>
                  <span className="font-mono">{item.label}</span>
                  {item.detail && <span className="text-meta ml-2">{item.detail}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p id="log-query-help" className="text-meta mt-2" aria-live="polite">
        {errors.length > 0
          ? <span role="alert" className="text-[var(--color-error,#dc2626)]">{errors[0].message}</span>
          : warnings.length > 0
            ? warnings[0].message
            : `Field operators, ranges, wildcards and boolean logic supported.${canonicalQuery ? ` Canonical: ${canonicalQuery}` : ''}`}
      </p>

      {showExamples && (
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {QUERY_EXAMPLES.map((example) => (
            <button key={example.label} type="button" className="btn-ghost text-left text-xs" onClick={() => setQuery(example.query)}>
              <span className="font-semibold">{example.label}</span>
              <code className="text-meta ml-2">{example.query}</code>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mt-3">
        <label className="flex items-center gap-2 text-xs">
          <span className="text-meta">Recent</span>
          <select
            className="input-field py-1 text-xs"
            aria-label="Recent queries"
            defaultValue=""
            onChange={(event) => {
              const index = Number(event.target.value);
              if (Number.isInteger(index) && recentQueries[index]) applyState(recentQueries[index]);
            }}
          >
            <option value="">Choose…</option>
            {recentQueries.map((entry, index) => <option key={`${entry.query}-${index}`} value={index}>{entry.query || '(all logs)'}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-meta">Saved</span>
          <select
            className="input-field py-1 text-xs"
            aria-label="Saved queries"
            defaultValue=""
            onChange={(event) => {
              const saved = savedQueries.find((entry) => entry.id === event.target.value);
              if (saved) applyState(saved.state);
            }}
          >
            <option value="">Choose…</option>
            {savedQueries.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        </label>
        {state.mode === 'live' && (
          <>
            <button
              type="button"
              className={paused ? 'chip chip-active text-xs' : 'chip text-xs'}
              aria-pressed={paused}
              onClick={() => setPaused(!paused)}
            >
              {paused ? 'Resume tail' : 'Pause on inspect'}
            </button>
            <span className="text-meta" aria-live="polite">{rate.toFixed(1)} events/s</span>
            <label className="flex items-center gap-1 text-xs">
              <span className="text-meta">Sample</span>
              <select
                className="input-field py-1 text-xs"
                aria-label="Tail sampling rate"
                value={String(sample)}
                onChange={(event) => setSample(Number(event.target.value))}
              >
                <option value="1">All events</option>
                <option value="0.5">50%</option>
                <option value="0.1">10%</option>
                <option value="0.01">1%</option>
              </select>
            </label>
          </>
        )}
        {notices.map((notice, index) => (
          <span key={`${notice.kind}-${index}`} role="status" className="chip text-xs" title={notice.message}>
            {notice.kind}: {notice.count}
          </span>
        ))}
        {fetching && <span className="text-meta" role="status">Searching…</span>}
      </div>
    </section>
  );
}

export default QueryBar;
