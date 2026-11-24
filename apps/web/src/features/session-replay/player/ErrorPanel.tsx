'use client';

/**
 * Errors & context panel (#2341): errors so far with the request most likely
 * behind each, plus feature flags, web vitals, app state summaries and the
 * linked incidents/issues (#066).
 */

import Link from 'next/link';
import { useState } from 'react';
import type { SessionReplayState } from '../hooks/useSessionReplay';
import { correlatedRequest, formatOffset, POOR_VITALS, requestLogsHref } from '../lib/timeline';

export function ErrorPanel({ replay }: { replay: SessionReplayState }) {
  const { session, state } = replay;
  const [incident, setIncident] = useState('');
  const [issue, setIssue] = useState('');
  if (!session || !state) return null;
  return (
    <section className="card card-padding flex flex-col gap-3 min-w-0" aria-label="Errors and context">
      <div>
        <h2 className="text-sm-semibold">Errors ({state.errors.length})</h2>
        {state.errors.length === 0 ? <p className="text-meta text-sm">No errors yet at this point.</p> : null}
        <ul className="flex flex-col gap-2 mt-1">
          {state.errors.map((error, index) => {
            const request = correlatedRequest(session, error.t);
            return (
              <li key={`${error.t}-${index}`} className="text-sm rounded border border-token p-2">
                <button type="button" className="link font-mono text-xs mr-2" onClick={() => replay.seek(error.t)}>
                  {formatOffset(error.t)}
                </button>
                <span className="field-error">{error.message}</span>
                {error.type === 'error' && error.stack ? (
                  <details>
                    <summary className="text-xs cursor-pointer">Stack (redacted)</summary>
                    <pre className="text-xs whitespace-pre-wrap break-all">{error.stack}</pre>
                  </details>
                ) : null}
                {request ? (
                  <p className="text-meta text-xs">
                    After {request.method} {request.url} → {request.status || 'network error'}
                    {request.requestId ? (
                      <>
                        {' · '}
                        <Link className="link" href={requestLogsHref(request.requestId)}>
                          backend logs for {request.requestId}
                        </Link>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
        <dt className="text-meta">Feature flags</dt>
        <dd>{state.flags.length > 0 ? state.flags.join(', ') : 'none'}</dd>
        <dt className="text-meta">Web vitals</dt>
        <dd>
          {Object.keys(state.vitals).length === 0
            ? '—'
            : Object.entries(state.vitals).map(([name, value]) => (
                <span key={name} className={`ds-badge mr-1 ${value > (POOR_VITALS[name] ?? Infinity) ? 'ds-badge-warning' : 'ds-badge-success'}`}>
                  {name} {name === 'CLS' ? value.toFixed(3) : `${Math.round(value)} ms`}
                </span>
              ))}
        </dd>
        <dt className="text-meta">App state</dt>
        <dd>
          {Object.keys(state.state).length === 0
            ? '—'
            : Object.entries(state.state).map(([key, summary]) => (
                <div key={key}>
                  <code>{key}</code>: {summary}
                </div>
              ))}
        </dd>
        <dt className="text-meta">Last input</dt>
        <dd>{state.lastInput ?? '—'}</dd>
        <dt className="text-meta">Incidents</dt>
        <dd>
          {session.incidentIds.length === 0
            ? '—'
            : session.incidentIds.map((id) => (
                <Link key={id} className="link mr-2" href={`/incidents/${encodeURIComponent(id)}`}>
                  {id}
                </Link>
              ))}
        </dd>
        <dt className="text-meta">Issues</dt>
        <dd className="break-all">
          {session.issueLinks.length === 0
            ? '—'
            : session.issueLinks.map((href) => (
                <a key={href} className="link mr-2" href={href} rel="noopener noreferrer" target="_blank">
                  {href.replace(/^https?:\/\//, '')}
                </a>
              ))}
        </dd>
      </dl>

      {replay.viewer?.canViewCaptured && replay.access !== 'local' ? (
        <form
          className="flex flex-wrap gap-2 items-end"
          aria-label="Link to incident or issue"
          onSubmit={(event) => {
            event.preventDefault();
            void replay.link({ incident: incident.trim() || undefined, issue: issue.trim() || undefined });
            setIncident('');
            setIssue('');
          }}
        >
          <input className="input-field" aria-label="Incident id" placeholder="INC-1234" value={incident} onChange={(event) => setIncident(event.target.value.toUpperCase())} />
          <input className="input-field" aria-label="Issue URL" placeholder="https://github.com/…/issues/1" value={issue} onChange={(event) => setIssue(event.target.value)} />
          <button type="submit" className="btn-outline text-xs" disabled={!incident.trim() && !issue.trim()}>
            Link
          </button>
        </form>
      ) : null}
    </section>
  );
}
