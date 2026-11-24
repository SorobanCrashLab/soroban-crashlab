'use client';

/** Top-level structured log investigation surface (#075). */

import { useEffect, useMemo, useState } from 'react';
import { ListState } from '@/components/ListState';
import { downloadLogExport, type LogExportFormat } from '@/lib/logs/client';
import { buildCorrelationLinksForEvents } from '@/lib/logs/correlation';
import { canViewSensitiveLogs } from '@/lib/logs/redaction';
import { QueryBar } from './QueryBar';
import { LogFacetsPanel } from './facets/LogFacetsPanel';
import { VirtualizedLogStream } from './stream/VirtualizedLogStream';
import { useLogQuery } from './hooks/useLogQuery';

const ROLES = ['viewer', 'responder', 'analyst', 'maintainer'] as const;

export function LogQueryWorkbench() {
  const query = useLogQuery();
  const { state, events, stats, error, loading, pinnedIds, identity, setRole, setPaused, refresh } = query;
  const [wrap, setWrap] = useState(false);
  const [prettyJson, setPrettyJson] = useState(false);

  const pinnedEvents = useMemo(
    () => events.filter((event) => pinnedIds.includes(event.id)),
    [events, pinnedIds],
  );
  const pinnedLinks = useMemo(() => buildCorrelationLinksForEvents(pinnedEvents), [pinnedEvents]);
  const canReveal = canViewSensitiveLogs({ role: identity.role });
  const hasRedacted = events.some((event) => (event.redacted?.length ?? 0) > 0);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        setPaused(!query.paused);
      }
      if (event.key === '/' && !(event.target instanceof HTMLInputElement) && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault();
        document.getElementById('log-query-input')?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [query.paused, setPaused]);

  const exportAs = (format: LogExportFormat) => downloadLogExport(events, format, state);

  return (
    <div className="container-full page-padding fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="heading-page">Log Query Workbench</h1>
          <p className="text-meta mt-0.5 sm:mt-1">
            Structured search, facets, live tail and correlation across fuzzing logs
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs">
            <span className="text-meta">Access level</span>
            <select
              className="input-field py-1 text-xs"
              aria-label="Log access level"
              value={ROLES.includes(identity.role as (typeof ROLES)[number]) ? identity.role : 'viewer'}
              onChange={(event) => setRole(event.target.value)}
            >
              {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          </label>
          <button type="button" className="btn-outline text-xs" onClick={() => exportAs('json')}>Export JSON</button>
          <button type="button" className="btn-outline text-xs" onClick={() => exportAs('ndjson')}>NDJSON</button>
          <button type="button" className="btn-outline text-xs" onClick={() => exportAs('csv')}>CSV</button>
        </div>
      </div>

      {error && (
        <div role="alert" className="card card-padding mb-4 text-[var(--color-error,#dc2626)] flex items-center justify-between gap-2">
          <span>{error}</span>
          <button type="button" className="btn-outline text-xs" onClick={refresh}>Retry</button>
        </div>
      )}

      <QueryBar query={query} />

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <LogFacetsPanel query={query} />

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-meta" aria-live="polite">
              {stats ? (
                <>
                  {stats.total.toLocaleString()} matches · scanned {stats.scanned.toLocaleString()} · {stats.tookMs} ms
                  {stats.partial ? ' · partial results' : ''}
                </>
              ) : loading ? 'Loading logs…' : ''}
              {state.histogramRange ? ' · brushed time range' : ''}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="chip text-xs" onClick={query.showAroundNow}>Show around now</button>
              <button type="button" className="chip text-xs" aria-pressed={wrap} onClick={() => setWrap((value) => !value)}>Wrap messages</button>
              <button type="button" className="chip text-xs" aria-pressed={prettyJson} onClick={() => setPrettyJson((value) => !value)}>Pretty JSON</button>
              <button type="button" className="chip text-xs" onClick={query.refresh}>Refresh</button>
            </div>
          </div>

          {hasRedacted && (
            <p role="status" className="text-meta">
              Sensitive fields are masked for your access level.
              {canReveal ? ' Maintainer access can view them in the raw event store.' : ' Switch to maintainer access to view them.'}
            </p>
          )}

          <ListState
            {...(loading
              ? { state: 'loading' as const }
              : events.length === 0
                ? {
                    state: 'empty' as const,
                    type: 'logs' as const,
                    message: 'No log events match this query.',
                    description: 'Try clearing facets, widening the time range, or simplifying the query.',
                  }
                : { state: 'success' as const })}
          >
            <VirtualizedLogStream
              events={events}
              query={state.query}
              pinnedIds={pinnedIds}
              onTogglePinned={query.togglePinned}
              onInspect={() => { if (state.mode === 'live') setPaused(true); }}
              onLoadMore={query.loadMore}
              hasMore={Boolean(stats && events.length < stats.total)}
              loading={query.fetching}
              wrap={wrap}
              prettyJson={prettyJson}
            />
          </ListState>

          {pinnedEvents.length > 0 && (
            <section className="card card-padding" aria-label="Pinned events and correlations">
              <h2 className="heading-section text-sm mb-2">
                Pinned events ({pinnedEvents.length})
              </h2>
              <ul className="mb-2 space-y-1">
                {pinnedEvents.slice(-8).map((event) => (
                  <li key={event.id} className="text-xs font-mono truncate">
                    {event.id} · {event.message}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2" aria-label="Correlation actions">
                {pinnedLinks.map((link) => (
                  <a key={link.id} href={link.href} className="chip text-xs" title={link.description}>{link.label}</a>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

export default LogQueryWorkbench;
