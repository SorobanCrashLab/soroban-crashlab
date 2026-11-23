'use client';

/** Windowed log stream with context expansion, pinning and match navigation (#075). */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from 'react';
import Link from 'next/link';
import { computeVirtualWindow } from '@/app/runs-table/virtual-window';
import { buildCorrelationLinks } from '@/lib/logs/correlation';
import { parseQuery } from '../dsl/parser';
import type { LogEvent } from '@/lib/logs/types';
import type { QueryNode } from '../dsl/parser';

const ROW_HEIGHT = 34;

type QueryTerm = Extract<QueryNode, { kind: 'term' }>;

function literalTerms(node: QueryNode, into: QueryTerm[] = []): QueryTerm[] {
  if (node.kind === 'term' && !node.value.includes('*')) into.push(node);
  if (node.kind === 'and' || node.kind === 'or') node.children.forEach((child) => literalTerms(child, into));
  if (node.kind === 'not') literalTerms(node.child, into);
  return into;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(11, 23);
}

function highlightMessage(message: string, terms: QueryTerm[]) {
  const needles = terms
    .map((term) => term.value.trim())
    .filter((value) => value.length >= 2)
    .slice(0, 6);
  if (needles.length === 0) return message;
  const pattern = new RegExp(`(${needles.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
  return message.split(pattern).map((part, index) =>
    needles.some((needle) => needle.toLowerCase() === part.toLowerCase())
      ? <mark key={index} className="bg-[var(--ds-color-warning-bg)] px-0.5">{part}</mark>
      : part,
  );
}

export interface VirtualizedLogStreamProps {
  events: LogEvent[];
  query: string;
  pinnedIds: string[];
  onTogglePinned: (id: string) => void;
  onInspect: (event: LogEvent) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loading?: boolean;
  wrap?: boolean;
  prettyJson?: boolean;
}

export function VirtualizedLogStream({
  events,
  query,
  pinnedIds,
  onTogglePinned,
  onInspect,
  onLoadMore,
  hasMore = false,
  loading = false,
  wrap = false,
  prettyJson = false,
}: VirtualizedLogStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const terms = useMemo(() => literalTerms(parseQuery(query).ast), [query]);
  const matchIndices = useMemo(() => {
    if (terms.length === 0) return [];
    const indices: number[] = [];
    events.forEach((event, index) => {
      if (terms.some((term) => event.message.toLowerCase().includes(term.value.toLowerCase()))) indices.push(index);
    });
    return indices;
  }, [events, terms]);
  const [matchCursor, setMatchCursor] = useState(0);

  const window = useMemo(() => computeVirtualWindow({
    scrollTop, viewportHeight, rowHeight: ROW_HEIGHT, rowCount: events.length, overscan: 6,
  }), [scrollTop, viewportHeight, events.length]);

  const selectedIndex = useMemo(
    () => events.findIndex((event) => event.id === selectedId),
    [events, selectedId],
  );
  const selected = selectedIndex >= 0 ? events[selectedIndex] : null;
  const context = useMemo(
    () => events.slice(Math.max(0, selectedIndex - 3), selectedIndex + 4),
    [events, selectedIndex],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height;
      if (height) setViewportHeight(height);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const scrollToIndex = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container || index < 0 || index >= events.length) return;
    container.scrollTo({ top: index * ROW_HEIGHT - container.clientHeight / 2, behavior: 'smooth' });
    setFocusedIndex(index);
  }, [events.length]);

  const navigateMatch = useCallback((direction: 1 | -1) => {
    if (matchIndices.length === 0) return;
    const next = (matchCursor + direction + matchIndices.length) % matchIndices.length;
    setMatchCursor(next);
    scrollToIndex(matchIndices[next]);
  }, [matchCursor, matchIndices, scrollToIndex]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const key = event.key;
    if (key === 'ArrowDown') { event.preventDefault(); scrollToIndex(Math.min(events.length - 1, focusedIndex + 1)); }
    else if (key === 'ArrowUp') { event.preventDefault(); scrollToIndex(Math.max(0, focusedIndex - 1)); }
    else if (key === 'Home') { event.preventDefault(); scrollToIndex(0); }
    else if (key === 'End') { event.preventDefault(); scrollToIndex(events.length - 1); }
    else if (key === 'Enter' && events[focusedIndex]) {
      event.preventDefault();
      setSelectedId(events[focusedIndex].id);
      onInspect(events[focusedIndex]);
    } else if (key.toLowerCase() === 'p' && events[focusedIndex]) {
      event.preventDefault();
      onTogglePinned(events[focusedIndex].id);
    }
  }, [events, focusedIndex, onInspect, onTogglePinned, scrollToIndex]);

  const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    setScrollTop(target.scrollTop);
    if (onLoadMore && hasMore && target.scrollHeight - target.scrollTop - target.clientHeight < ROW_HEIGHT * 8) {
      onLoadMore();
    }
  }, [hasMore, onLoadMore]);

  return (
    <section aria-label="Virtualized log stream" className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border-color)]">
        <div className="flex items-center gap-2">
          <span className="text-meta" aria-live="polite">
            {events.length.toLocaleString()} log event{events.length === 1 ? '' : 's'} rendered
            {matchIndices.length > 0 ? ` · ${matchIndices.length} highlighted matches` : ''}
          </span>
          <button type="button" className="btn-ghost text-xs" onClick={() => navigateMatch(-1)} disabled={matchIndices.length === 0} aria-label="Previous match">
            ↑ Match
          </button>
          <button type="button" className="btn-ghost text-xs" onClick={() => navigateMatch(1)} disabled={matchIndices.length === 0} aria-label="Next match">
            ↓ Match
          </button>
        </div>
        <span className="text-meta">↑↓ navigate · Enter inspect · P pin</span>
      </div>

      <div
        ref={containerRef}
        className="h-[min(62vh,620px)] overflow-y-auto font-mono text-xs"
        onScroll={handleScroll}
        role="list"
        aria-label="Log events"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div style={{ height: window.totalHeight, position: 'relative' }}>
          <div style={{ position: 'absolute', top: window.offsetTop, left: 0, right: 0 }}>
            {events.slice(window.firstIndex, window.lastIndex + 1).map((event, offset) => {
              const index = window.firstIndex + offset;
              const pinned = pinnedIds.includes(event.id);
              return (
                <div
                  key={event.id}
                  role="listitem"
                  aria-current={selectedId === event.id ? 'true' : undefined}
                  aria-label={`${new Date(event.timestamp).toISOString()} ${event.level} from ${event.source}: ${event.message}`}
                  className={`flex items-center gap-2 px-3 border-b border-[var(--border-color)]/50 hover:bg-[var(--bg-subtle)] ${selectedId === event.id ? 'bg-[var(--bg-subtle)]' : ''} ${focusedIndex === index ? 'outline outline-1 outline-[var(--ds-color-focus)]' : ''}`}
                  style={{ height: ROW_HEIGHT }}
                  onClick={() => { setSelectedId(event.id); setFocusedIndex(index); onInspect(event); }}
                >
                  <span className="text-meta shrink-0 w-24">{formatTime(event.timestamp)}</span>
                  <span className={`shrink-0 w-12 uppercase ${event.level === 'error' ? 'text-[var(--color-error,#e11d48)]' : event.level === 'warn' ? 'text-[var(--color-warn,#b45309)]' : ''}`}>{event.level}</span>
                  <span className="shrink-0 w-28 truncate text-[#0A66C2]">{event.source}</span>
                  <span className={`flex-1 truncate ${wrap ? 'whitespace-normal' : ''}`}>{highlightMessage(event.message, terms)}</span>
                  {event.redacted && event.redacted.length > 0 && (
                    <span className="shrink-0 text-meta" title={`${event.redacted.length} field(s) redacted`}>🔒</span>
                  )}
                  {pinned && <span className="shrink-0" aria-label="Pinned">📌</span>}
                  <button
                    type="button"
                    className="btn-ghost shrink-0 text-xs px-1"
                    aria-label={pinned ? 'Unpin event' : 'Pin event'}
                    onClick={(click) => { click.stopPropagation(); onTogglePinned(event.id); }}
                  >
                    {pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost shrink-0 text-xs px-1"
                    aria-label="Copy event as JSON"
                    onClick={(click) => {
                      click.stopPropagation();
                      void navigator.clipboard?.writeText(JSON.stringify(event, null, prettyJson ? 2 : 0));
                    }}
                  >
                    Copy
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {selected && (
        <aside aria-label="Log event context" className="border-t border-[var(--border-color)] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="heading-section text-sm">Context around {selected.id}</h3>
            <button type="button" className="btn-ghost text-xs" onClick={() => setSelectedId(null)}>Close context</button>
          </div>
          <ol className="space-y-1 mb-3">
            {context.map((event) => (
              <li key={event.id} className={event.id === selected.id ? 'font-bold' : 'text-meta'}>
                <button type="button" className="link text-left w-full truncate" onClick={() => scrollToIndex(events.indexOf(event))}>
                  {formatTime(event.timestamp)} · {event.level} · {event.message}
                </button>
              </li>
            ))}
          </ol>
          <pre className="code-text whitespace-pre-wrap break-all">{prettyJson ? JSON.stringify(selected, null, 2) : JSON.stringify(selected)}</pre>
          <div className="flex flex-wrap gap-2 mt-2" aria-label="Correlated entities">
            {buildCorrelationLinks(selected).map((link) => (
              <Link key={link.id} href={link.href} className="chip text-xs" title={link.description}>{link.label}</Link>
            ))}
          </div>
          {selected.redacted && selected.redacted.length > 0 && (
            <p className="text-meta mt-2" role="status">
              {selected.redacted.length} sensitive field(s) hidden by the redaction policy.
            </p>
          )}
        </aside>
      )}

      {hasMore && (
        <div className="p-3 border-t border-[var(--border-color)]">
          <button type="button" className="btn-outline text-xs" onClick={onLoadMore} disabled={loading}>
            {loading ? 'Loading…' : 'Load more results'}
          </button>
        </div>
      )}
    </section>
  );
}

export default VirtualizedLogStream;
