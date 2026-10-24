'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { api } from '../../lib/api-client';
import {
  getSearchableFieldLabels,
  highlightedExcerpt,
  type HighlightSegment,
} from '../../app/fuzzy-search-utils';
import { caretLine, QueryError } from '../../app/search/grammar/lexer';
import { suggestFields } from '../../app/search/grammar/fields';
import { MAX_SEARCH_RESULTS, SEARCH_TRUNCATION_HINT } from '../../lib/search/ranker';
import type { RunSearchHit } from '../../lib/schemas/runs';

type SearchState = 'idle' | 'searching' | 'success' | 'error';

const SEARCH_DEBOUNCE_MS = 150;
const SEARCH_ROW_HEIGHT = 142;
const SEARCH_OVERSCAN = 3;
const SEARCH_VIEWPORT_HEIGHT = 620;

function LoadingSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4 animate-pulse">
      <div className="h-10 w-full max-w-md rounded-xl bg-zinc-200 dark:bg-zinc-800" />
      <div className="h-64 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900" />
    </div>
  );
}

function HighlightedText({
  segments,
  className,
}: {
  segments: HighlightSegment[];
  className?: string;
}) {
  if (segments.length === 0) return null;
  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.matched ? (
          <mark
            key={index}
            className="bg-amber-200 text-inherit dark:bg-amber-500/40 rounded-sm px-0.5"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </span>
  );
}

function SearchResultCard({ result, query }: { result: RunSearchHit; query: string }) {
  const { run } = result;
  return (
    <div className="card card-padding card-interactive h-full overflow-hidden">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              <HighlightedText segments={highlightedExcerpt(run.id, query, 120)} />
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              run.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
              run.status === 'failed' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300' :
              run.status === 'running' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
              'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
            }`}>
              {run.status}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {run.area}
            </span>
            <span className={`text-xs font-medium ${
              run.severity === 'critical' ? 'text-rose-600 dark:text-rose-400' :
              run.severity === 'high' ? 'text-orange-600 dark:text-orange-400' :
              run.severity === 'medium' ? 'text-amber-600 dark:text-amber-400' :
              'text-emerald-600 dark:text-emerald-400'
            }`}>
              {run.severity}
            </span>
          </div>
          {result.matchedFields.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {result.matchedFields.slice(0, 4).map((field) => (
                <span key={`${field.field}-${field.value}`} className="text-[11px] px-2 py-0.5 rounded-full bg-[#E7F0F9] text-[#0A66C2] dark:bg-[#0A66C2]/20 dark:text-[#66B2FF] font-medium">
                  {field.field}:{' '}
                  <HighlightedText segments={highlightedExcerpt(field.value, query, 60)} />
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
        {result.score > 1 && (
          <div className="shrink-0 text-right">
            <div className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>
              Score: {result.score}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VirtualizedSearchResults({
  results,
  query,
}: {
  results: RunSearchHit[];
  query: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = 0;
    setScrollTop(0);
  }, [results]);

  if (results.length === 0) return null;

  const totalHeight = results.length * SEARCH_ROW_HEIGHT;
  const viewportHeight = Math.min(SEARCH_VIEWPORT_HEIGHT, totalHeight);
  const firstVisible = Math.max(0, Math.floor(scrollTop / SEARCH_ROW_HEIGHT) - SEARCH_OVERSCAN);
  const lastVisible = Math.min(
    results.length - 1,
    Math.ceil((scrollTop + viewportHeight) / SEARCH_ROW_HEIGHT) + SEARCH_OVERSCAN,
  );
  const visibleResults = results.slice(firstVisible, lastVisible + 1);

  return (
    <div
      ref={scrollRef}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      style={{ height: viewportHeight, overflowY: 'auto' }}
      role="region"
      aria-label={`${results.length} search results`}
      className="pr-1"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleResults.map((result, offset) => (
          <div
            key={result.run.id}
            style={{
              position: 'absolute',
              top: (firstVisible + offset) * SEARCH_ROW_HEIGHT,
              left: 0,
              right: 0,
              height: SEARCH_ROW_HEIGHT,
            }}
            className="pb-2"
          >
            <SearchResultCard result={result} query={query} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CreateFuzzySearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RunSearchHit[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [indexedCount, setIndexedCount] = useState<number | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [hint, setHint] = useState<string | undefined>(undefined);
  const [tookMs, setTookMs] = useState<number | null>(null);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [showFieldHelp, setShowFieldHelp] = useState(false);
  const [queryError, setQueryError] = useState<QueryError | null>(null);
  const [hintIndex, setHintIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const runSearch = useCallback((value: string) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearchState('searching');

    api.runs
      .search(value, { limit: MAX_SEARCH_RESULTS, signal: controller.signal })
      .then((data) => {
        if (requestId !== requestIdRef.current || controller.signal.aborted) return;
        setResults(data.results);
        setTotalResults(data.total);
        setIndexedCount(data.indexed);
        setTruncated(data.truncated);
        setHint(data.hint);
        setTookMs(data.tookMs);
        setQueryError(
          data.error
            ? new QueryError(data.error.message, data.error.position, data.error.expected)
            : null,
        );
        setSearchState('success');
      })
      .catch((error: unknown) => {
        if (requestId !== requestIdRef.current || controller.signal.aborted) return;
        if ((error as Error)?.name === 'AbortError') return;
        setResults([]);
        setTotalResults(0);
        setTruncated(false);
        setHint(undefined);
        setSearchState('error');
      });
  }, []);

  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      setHintIndex(0);
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      abortRef.current?.abort();

      if (value.trim().length === 0) {
        requestIdRef.current += 1;
        setResults([]);
        setTotalResults(0);
        setTruncated(false);
        setHint(undefined);
        setTookMs(null);
        setQueryError(null);
        setSearchState('idle');
        return;
      }

      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        runSearch(value);
      }, SEARCH_DEBOUNCE_MS);
    },
    [runSearch],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const fieldLabels = useMemo(() => getSearchableFieldLabels(), []);

  const activeFieldPrefix = useMemo(() => {
    const lastToken = query.split(/\s+/).at(-1) ?? '';
    if (!lastToken || lastToken.includes(':') || /[()<>"]/.test(lastToken)) return '';
    return lastToken.replace(/^-/, '');
  }, [query]);

  const fieldHints = useMemo(
    () => (activeFieldPrefix ? suggestFields(activeFieldPrefix).slice(0, 6) : []),
    [activeFieldPrefix],
  );

  const applyHint = useCallback(
    (fieldName: string) => {
      const parts = query.split(/(\s+)/);
      const lastIndex = parts.length - 1;
      const negated = (parts[lastIndex] ?? '').startsWith('-');
      parts[lastIndex] = `${negated ? '-' : ''}${fieldName}:`;
      const next = parts.join('');
      setQuery(next);
      setHintIndex(0);
      inputRef.current?.focus();
      handleSearch(next);
    },
    [query, handleSearch],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
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
    },
    [fieldHints, hintIndex, applyHint],
  );

  const handleRetry = useCallback(() => {
    if (query.trim().length > 0) runSearch(query);
  }, [query, runSearch]);

  const isSearching = searchState === 'searching';

  return (
    <div className="container-full page-padding fade-in">
      <div className="mb-6">
        <h1 className="heading-page">Fuzzy Search</h1>
        <p className="text-meta mt-1 text-sm">
          Search indexed run identifiers, signatures, contracts, and tags with relevance ranking.
        </p>
      </div>

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
              onChange={(event) => handleSearch(event.target.value)}
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
            <span>
              {indexedCount === null
                ? 'Server-side index'
                : `${indexedCount.toLocaleString()} runs indexed`}
            </span>
            <div className="flex items-center gap-3">
              {isSearching && <span role="status">Searching…</span>}
              <button
                type="button"
                onClick={() => setShowFieldHelp(!showFieldHelp)}
                className="underline hover:text-[var(--text-primary)]"
              >
                {showFieldHelp ? 'Hide' : 'Show'} searchable fields
              </button>
            </div>
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

        {searchState === 'error' && (
          <div role="alert" className="card card-padding text-center py-12">
            <p className="text-rose-600 dark:text-rose-400 font-semibold">Search failed</p>
            <p className="text-meta mt-1 mb-4 text-sm">Check your connection and try again.</p>
            <button type="button" onClick={handleRetry} className="btn-primary text-sm">
              Retry
            </button>
          </div>
        )}

        {searchState !== 'error' && query.trim() === '' && (
          <div className="card card-padding text-center py-12">
            <div className="text-3xl mb-3 opacity-30">🔍</div>
            <p className="text-meta text-sm">Type a search term to find runs.</p>
            <p className="text-xs text-meta mt-1">Fuzzy matching supports typos and partial matches.</p>
          </div>
        )}

        {searchState !== 'error' && query.trim() !== '' && isSearching && results.length === 0 && (
          <LoadingSkeleton />
        )}

        {searchState !== 'error' && !queryError && query.trim() !== '' && !isSearching && results.length === 0 && (
          <div className="card card-padding text-center py-12">
            <p className="text-meta text-sm">No runs match &ldquo;{query}&rdquo;</p>
            <p className="text-xs text-meta mt-1">Try a different search term.</p>
          </div>
        )}

        {searchState !== 'error' && results.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-meta">
                Found <strong>{totalResults.toLocaleString()}</strong>{' '}
                {totalResults === 1 ? 'result' : 'results'}
                {truncated && (
                  <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                    Showing first {results.length}
                  </span>
                )}
              </p>
              {tookMs !== null && (
                <span className="text-xs text-meta tabular-nums">{tookMs} ms</span>
              )}
            </div>
            {truncated && (
              <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                {hint ?? SEARCH_TRUNCATION_HINT}
              </p>
            )}
            <VirtualizedSearchResults results={results} query={query} />
          </div>
        )}
      </div>
    </div>
  );
}
