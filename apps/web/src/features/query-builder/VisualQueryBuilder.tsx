'use client';

/**
 * Visual Query Builder & Analytics Explorer (#2339).
 *
 * Three panes — schema browser, query canvas, generated query — over a
 * shared result explorer. Templates, saved queries, history, share links and
 * embeddable widgets all carry the canonical query, never result data, so a
 * recipient always re-runs it under their own permissions.
 */

import Link from 'next/link';
import { useId, useState } from 'react';
import { QueryCanvas } from './QueryCanvas';
import { QueryPreview } from './QueryPreview';
import { ResultExplorer } from './ResultExplorer';
import { SchemaBrowser } from './SchemaBrowser';
import { useVisualQuery } from './hooks/useVisualQuery';
import { entitiesInQuery, type VisualQuery } from './lib/model';
import { QUERY_TEMPLATES } from './lib/templates';
import type { ParamValues } from './lib/validate';

export const EXPLORE_PATH = '/analytics/explore';

export interface VisualQueryBuilderProps {
  initialQuery?: VisualQuery;
  initialParams?: ParamValues;
  /** Render only the result widget (for dashboards and reports). */
  embed?: boolean;
  initialView?: 'grid' | 'pivot' | 'chart' | 'timeline';
  /** Shown when a shared link could not be decoded. */
  loadError?: string | null;
}

function absolute(path: string): string {
  return typeof window === 'undefined' ? path : `${window.location.origin}${path}`;
}

export function VisualQueryBuilder({ initialQuery, initialParams, embed = false, initialView, loadError }: VisualQueryBuilderProps) {
  const state = useVisualQuery({ initialQuery, initialParams, autoRun: embed });
  const [notice, setNotice] = useState<string | null>(loadError ?? null);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'team'>('private');
  const templateId = useId();
  const sharePath = `${EXPLORE_PATH}?q=${state.shareToken}`;

  const copy = async (text: string, message: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(message);
    } catch {
      setNotice(`Copy failed — select and copy manually: ${text}`);
    }
  };

  if (embed) {
    return (
      <div className="p-2">
        <ResultExplorer result={state.result} status={state.status} error={state.error} compact initialView={initialView} />
        <p className="text-meta mt-1">
          <Link className="link" href={sharePath} target="_top">
            Open in Analytics Explorer
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="container-full page-padding fade-in flex flex-col gap-4">
      <header className="flex-between flex-wrap gap-3">
        <div>
          <h1 className="heading-page">Analytics Explorer</h1>
          <p className="text-meta mt-1">
            Compose cross-entity queries over runs, crashes, logs, traces, metrics and CI without writing a query language.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={templateId} className="text-sm">
            Template
          </label>
          <select
            id={templateId}
            className="input-field"
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) state.loadTemplate(event.target.value);
              event.target.value = '';
            }}
          >
            <option value="">Start from a template…</option>
            {QUERY_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id} title={template.description}>
                {template.name}
              </option>
            ))}
          </select>
          <button type="button" className="btn-outline text-xs" onClick={() => void copy(absolute(sharePath), 'Share link copied.')}>
            Copy share link
          </button>
          <button
            type="button"
            className="btn-outline text-xs"
            onClick={() =>
              void copy(
                `<iframe title="CrashLab query" src="${absolute(`${sharePath}&embed=1&view=chart`)}" width="100%" height="420" loading="lazy"></iframe>`,
                'Embed snippet copied.',
              )
            }
          >
            Copy embed
          </button>
        </div>
      </header>

      {notice ? (
        <p className="text-meta" role="status">
          {notice}{' '}
          <button type="button" className="btn-ghost text-xs" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_minmax(0,22rem)]">
        <SchemaBrowser
          present={entitiesInQuery(state.query)}
          stats={state.stats}
          role={state.role}
          selected={state.query.select}
          grouped={state.query.groupBy}
          onAddFilter={(ref) => state.addCondition('root', ref)}
          onToggleGroupBy={state.toggleGroupBy}
          onToggleSelect={state.toggleSelect}
          onAddJoin={(relationId) => state.addJoin(relationId)}
        />
        <QueryCanvas state={state} />
        <div className="flex flex-col gap-4 min-w-0">
          <QueryPreview state={state} />

          <section className="card card-padding" aria-label="Run query">
            {state.query.params.length > 0 ? (
              <fieldset className="flex flex-col gap-2 mb-3">
                <legend className="text-sm-semibold">Parameters</legend>
                {state.query.params.map((param) => (
                  <label key={param.name} className="text-sm flex items-center gap-2">
                    <code>:{param.name}</code>
                    <input
                      className="input-field"
                      type={param.type === 'number' ? 'number' : 'text'}
                      placeholder={param.defaultValue === null ? param.type : String(param.defaultValue)}
                      value={String(state.paramValues[param.name] ?? '')}
                      onChange={(event) => state.setParamValue(param.name, event.target.value === '' ? null : event.target.value)}
                    />
                  </label>
                ))}
              </fieldset>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-primary" onClick={state.run} disabled={state.status === 'running'}>
                {state.status === 'running' ? 'Running…' : 'Run query'}
              </button>
              {state.status === 'running' ? (
                <button type="button" className="btn-ghost text-xs" onClick={state.cancel}>
                  Cancel
                </button>
              ) : null}
              <span className="text-meta">
                {state.validation.valid ? 'Ready' : `${state.validation.errors.length} error(s) to fix`} · role {state.role}
              </span>
            </div>
            <p className="text-meta text-xs mt-2">Guardrails: 1,000 result rows, 50,000 scanned rows, 2 s per query.</p>
          </section>

          <section className="card card-padding flex flex-col gap-2" aria-label="Saved queries">
            <h2 className="text-sm-semibold">Saved queries</h2>
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                state.saveQuery(saveName, saveDescription, visibility);
                setNotice(`Saved “${saveName.trim() || 'Untitled query'}”.`);
                setSaveName('');
                setSaveDescription('');
              }}
            >
              <input className="input-field" aria-label="Saved query name" placeholder="Name" value={saveName} onChange={(event) => setSaveName(event.target.value)} />
              <input
                className="input-field"
                aria-label="Saved query description"
                placeholder="Description (optional)"
                value={saveDescription}
                onChange={(event) => setSaveDescription(event.target.value)}
              />
              <div className="flex items-center gap-2">
                <select className="input-field" aria-label="Visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as 'private' | 'team')}>
                  <option value="private">Private (this device)</option>
                  <option value="team">Team (offered in share links)</option>
                </select>
                <button type="submit" className="btn-outline text-xs">
                  Save
                </button>
              </div>
            </form>
            {state.saved.length === 0 ? <p className="text-meta">Nothing saved yet.</p> : null}
            <ul className="flex flex-col gap-1">
              {state.saved.map((entry) => (
                <li key={entry.id} className="flex-between gap-2 text-sm">
                  <button type="button" className="link text-left min-w-0 truncate" onClick={() => state.loadQuery(entry.query, entry.paramValues)} title={entry.description}>
                    {entry.name}
                  </button>
                  <span className="flex items-center gap-1">
                    <span className="ds-badge ds-badge-neutral">{entry.visibility}</span>
                    <button type="button" className="btn-ghost text-xs" aria-label={`Delete ${entry.name}`} onClick={() => state.deleteSaved(entry.id)}>
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card card-padding flex flex-col gap-2" aria-label="Query history">
            <div className="flex-between">
              <h2 className="text-sm-semibold">History</h2>
              {state.history.length > 0 ? (
                <button type="button" className="btn-ghost text-xs" onClick={state.clearHistory}>
                  Clear
                </button>
              ) : null}
            </div>
            {state.history.length === 0 ? <p className="text-meta">Queries you run appear here.</p> : null}
            <ul className="flex flex-col gap-1">
              {state.history.map((entry) => (
                <li key={entry.fingerprint} className="text-sm flex-between gap-2">
                  <button type="button" className="link text-left min-w-0 truncate" onClick={() => state.loadQuery(entry.query)}>
                    {entry.query.source} · {entry.fingerprint.slice(0, 8)}
                  </button>
                  <span className="text-meta whitespace-nowrap">
                    {entry.rows} rows · {entry.tookMs} ms{entry.truncated ? ' · partial' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <ResultExplorer result={state.result} status={state.status} error={state.error} initialView={initialView} />
    </div>
  );
}
