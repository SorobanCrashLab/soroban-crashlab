'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { fetchRuns } from '../lib/api-client';
import { FuzzingRun } from './types';
import { fuzzySearch, getSearchableFieldLabels, type FuzzySearchResult } from './fuzzy-search-utils';
import { searchRuns, usesGrammar } from './search/grammar/compiler';
import { caretLine, type QueryError } from './search/grammar/lexer';
import { suggestFields } from './search/grammar/fields';

type PageState = 'loading' | 'success' | 'error';

function LoadingSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4 animate-pulse">
      <div className="h-10 w-full max-w-md rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-64 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900" />
    </div>
  );
}

export default function CreateFuzzySearchPage() {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [runs, setRuns] = useState<FuzzingRun[]>([]);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FuzzySearchResult[]>([]);
  const [showFieldHelp, setShowFieldHelp] = useState(false);
  const [queryError, setQueryError] = useState<QueryError | null>(null);
  const [hintIndex, setHintIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchRuns()
      .then((data) => {
        if (!cancelled) {
          setRuns(data.runs ?? []);
          setPageState('success');
        }
      })
      .catch(() => {
        if (!cancelled) setPageState('error');
      });
    return () => { cancelled = true; };
  }, []);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    setHintIndex(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      // Plain text keeps the existing fuzzy behaviour; only a query that
      // actually uses the grammar goes through the parser.
      if (!usesGrammar(value)) {
        setQueryError(null);
        setSearchResults(fuzzySearch(runs, value));
        return;
      }

      const outcome = searchRuns(runs, value);
      setQueryError(outcome.error ?? null);
      setSearchResults(
        outcome.runs.map((run) => ({ run, score: 1, matchedFields: [] })),
      );
    }, 150);
  }, [runs]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const fieldLabels = useMemo(() => getSearchableFieldLabels(), []);

  // The token under the cursor, when it is a bare word that could become a
  // field name (`stat` → `status:`).
  const activeFieldPrefix = useMemo(() => {
    const lastToken = query.split(/\s+/).at(-1) ?? '';
    if (!lastToken || lastToken.includes(':') || /[()<>"]/.test(lastToken)) return '';
    return lastToken.replace(/^-/, '');
  }, [query]);

  const fieldHints = useMemo(
    () => (activeFieldPrefix ? suggestFields(activeFieldPrefix).slice(0, 6) : []),
    [activeFieldPrefix],
  );

  const applyHint = useCallback((fieldName: string) => {
    const parts = query.split(/(\s+)/);
    const lastIndex = parts.length - 1;
    const negated = (parts[lastIndex] ?? '').startsWith('-');
    parts[lastIndex] = `${negated ? '-' : ''}${fieldName}:`;
    const next = parts.join('');
    setQuery(next);
    setHintIndex(0);
    inputRef.current?.focus();
  }, [query]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (fieldHints.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHintIndex((index) => (index + 1) % fieldHints.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHintIndex((index) => (index - 1 + fieldHints.length) % fieldHints.length);
    } else if (event.key === 'Tab' || event.key === 'Enter') {
      event.preventDefault();
      applyHint(fieldHints[hintIndex].name);
    } else if (event.key === 'Escape') {
      setHintIndex(0);
    }
  }, [fieldHints, hintIndex, applyHint]);

  const handleRetry = useCallback(() => {
    setPageState('loading');
    fetchRuns()
      .then((data) => {
        setRuns(data.runs ?? []);
        setPageState('success');
      })
      .catch(() => setPageState('error'));
  }, []);

  return (
    <div className="container-full page-padding fade-in">
      <div className="mb-6">
        <h1 className="heading-page">Fuzzy Search</h1>
        <p className="text-meta mt-1 text-sm">
          Search across all run fields with relevance-based ranking.
        </p>
      </div>

      {pageState === 'loading' && <LoadingSkeleton />}

      {pageState === 'error' && (
        <div role="alert" className="card card-padding text-center py-12">
          <p className="text-rose-600 dark:text-rose-400 font-semibold">Failed to load runs</p>
          <p className="text-meta mt-1 mb-4 text-sm">Check your connection and try again.</p>
          <button type="button" onClick={handleRetry} className="btn-primary text-sm">
            Retry
          </button>
        </div>
      )}

      {pageState === 'success' && (
        <div className="space-y-4">
          <div className="relative">
            <div className="relative">
              <svg
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400 dark:text-zinc-500"
                fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => handleSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="status:failed area:auth fee>100 since 2026 — or just type"
                role="combobox"
                aria-expanded={fieldHints.length > 0}
                aria-controls="search-field-hints"
                className="w-full pl-12 pr-4 py-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A66C2]"
                autoFocus
                aria-label="Search runs"
              />
            </div>
            {fieldHints.length > 0 && (
              <ul
                id="search-field-hints"
                role="listbox"
                aria-label="Field name suggestions"
                className="absolute z-10 mt-1 w-full max-w-md overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
              >
                {fieldHints.map((field, index) => (
                  <li key={field.name}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === hintIndex}
                      onClick={() => applyHint(field.name)}
                      className={`flex w-full items-baseline justify-between px-3 py-2 text-left text-xs ${
                        index === hintIndex
                          ? 'bg-[#0A66C2] text-white'
                          : 'text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      <span className="font-mono font-semibold">{field.name}:</span>
                      <span className="opacity-70">{field.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {queryError && (
              <div
                role="alert"
                className="mt-2 rounded-xl border border-rose-300 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950/40"
              >
                <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                  {queryError.message}
                </p>
                <pre className="mt-1 overflow-x-auto font-mono text-[11px] leading-tight text-rose-700 dark:text-rose-300">
                  {caretLine(query, queryError.position)}
                </pre>
                {queryError.expected.length > 0 && (
                  <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
                    Expected: {queryError.expected.slice(0, 8).join(', ')}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between mt-2 text-xs text-meta">
              <span>{runs.length} runs indexed</span>
              <button
                type="button"
                onClick={() => setShowFieldHelp(!showFieldHelp)}
                className="underline hover:text-[var(--text-primary)]"
              >
                {showFieldHelp ? 'Hide' : 'Show'} searchable fields
              </button>
            </div>
            {showFieldHelp && (
              <div className="mt-2 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 mb-2">Searchable Fields:</div>
                <div className="flex flex-wrap gap-1.5">
                  {fieldLabels.map((label) => (
                    <span key={label} className="px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-[11px] font-medium">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {query.trim() === '' ? (
            <div className="card card-padding text-center py-12">
              <div className="text-3xl mb-3 opacity-30">🔍</div>
              <p className="text-meta text-sm">Type a search term to find runs.</p>
              <p className="text-xs text-meta mt-1">Fuzzy matching supports typos and partial matches.</p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="card card-padding text-center py-12">
              <p className="text-meta text-sm">No runs match &ldquo;{query}&rdquo;</p>
              <p className="text-xs text-meta mt-1">Try a different search term.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-meta">
                  Found <strong>{searchResults.length}</strong> {searchResults.length === 1 ? 'result' : 'results'}
                </p>
              </div>
              <div className="space-y-2">
                {searchResults.slice(0, 50).map((result) => (
                  <div
                    key={result.run.id}
                    className="card card-padding card-interactive"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {result.run.id}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            result.run.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                            result.run.status === 'failed' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' :
                            result.run.status === 'running' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                            'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                          }`}>
                            {result.run.status}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                            {result.run.area}
                          </span>
                          <span className={`text-xs font-medium ${
                            result.run.severity === 'critical' ? 'text-rose-600 dark:text-rose-400' :
                            result.run.severity === 'high' ? 'text-orange-600 dark:text-orange-400' :
                            result.run.severity === 'medium' ? 'text-amber-600 dark:text-amber-400' :
                            'text-emerald-600 dark:text-emerald-400'
                          }`}>
                            {result.run.severity}
                          </span>
                        </div>
                        {result.matchedFields.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {result.matchedFields.slice(0, 4).map((field) => (
                              <span key={field.field} className="text-[11px] px-2 py-0.5 rounded-full bg-[#E7F0F9] text-[#0A66C2] dark:bg-[#0A66C2]/20 dark:text-[#66B2FF] font-medium">
                                {field.field}: {field.value.length > 30 ? field.value.slice(0, 30) + '...' : field.value}
                              </span>
                            ))}
                            {result.matchedFields.length > 4 && (
                              <span className="text-[11px] text-meta">
                                +{result.matchedFields.length - 4} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
                          Score: {result.score}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {searchResults.length > 50 && (
                <p className="text-center text-sm text-meta">
                  Showing 50 of {searchResults.length} results. Refine your search for more precise results.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
