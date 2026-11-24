'use client';

/**
 * Generated query representations (#2339): the read-only SQL-like DSL, the
 * editable canonical JSON (applied back to the visual model), the explain
 * plan with cost estimate, and validation results.
 */

import { useState } from 'react';
import { AccessibleTabs } from '@/components/AccessibleTabs';
import type { VisualQueryState } from './hooks/useVisualQuery';

type PreviewTab = 'dsl' | 'json' | 'explain' | 'checks';

function JsonEditor({ initial, onApply }: { initial: string; onApply: (text: string) => string[] }) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const dirty = draft !== initial;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="query-json" className="text-meta">
        Canonical JSON. Edits are validated and applied to the visual builder.
      </label>
      <textarea
        id="query-json"
        className="input-field font-mono text-xs"
        rows={16}
        spellCheck={false}
        value={draft}
        aria-invalid={errors.length > 0}
        aria-describedby={errors.length > 0 ? 'query-json-errors' : undefined}
        onChange={(event) => setDraft(event.target.value)}
      />
      {errors.length > 0 ? (
        <ul id="query-json-errors" className="field-error text-xs" role="alert">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <button type="button" className="btn-primary text-xs" disabled={!dirty} onClick={() => setErrors(onApply(draft))}>
          Apply JSON
        </button>
        <button
          type="button"
          className="btn-ghost text-xs"
          disabled={!dirty}
          onClick={() => {
            setDraft(initial);
            setErrors([]);
          }}
        >
          Revert
        </button>
      </div>
    </div>
  );
}

export function QueryPreview({ state }: { state: VisualQueryState }) {
  const [tab, setTab] = useState<PreviewTab>('dsl');
  const { explain, validation } = state;
  const issueCount = validation.errors.length + validation.warnings.length;

  return (
    <section className="card card-padding min-w-0" aria-label="Query preview">
      <div className="flex-between mb-2">
        <h2 className="text-sm-semibold">Query</h2>
        <span className="text-meta">
          fingerprint <code>{state.fingerprint}</code>
        </span>
      </div>
      <AccessibleTabs
        label="Query representations"
        selected={tab}
        onSelect={setTab}
        tabs={[
          { id: 'dsl', label: 'DSL' },
          { id: 'json', label: 'JSON' },
          { id: 'explain', label: 'Explain', badge: explain.costClass },
          { id: 'checks', label: 'Checks', badge: issueCount },
        ]}
      >
        {tab === 'dsl' ? (
          <pre className="text-xs whitespace-pre-wrap font-mono surface-soft p-2 rounded" aria-label="Generated DSL">
            {state.dsl}
          </pre>
        ) : null}
        {tab === 'json' ? <JsonEditor key={state.json} initial={state.json} onApply={state.applyJson} /> : null}
        {tab === 'explain' ? (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              Estimated scan <strong>{explain.estimatedScanRows.toLocaleString('en-US')}</strong> rows · output ≈{' '}
              <strong>{explain.estimatedOutputRows.toLocaleString('en-US')}</strong> rows · cost{' '}
              <span className={`ds-badge ${explain.costClass === 'high' ? 'ds-badge-error' : explain.costClass === 'medium' ? 'ds-badge-warning' : 'ds-badge-success'}`}>
                {explain.costClass}
              </span>
            </p>
            <ol className="list-decimal pl-5">
              {explain.steps.map((step, index) => (
                <li key={index}>
                  <code>{step.op}</code> {step.detail}{' '}
                  <span className="text-meta">≈{step.estimatedRows.toLocaleString('en-US')}</span>
                </li>
              ))}
            </ol>
            {explain.hints.length > 0 ? (
              <ul className="text-meta list-disc pl-5" aria-label="Performance hints">
                {explain.hints.map((hint) => (
                  <li key={hint}>{hint}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {tab === 'checks' ? (
          <div className="text-sm">
            {issueCount === 0 ? <p className="text-meta">No issues — the query is valid.</p> : null}
            <ul className="flex flex-col gap-1">
              {validation.errors.map((issue, index) => (
                <li key={`e${index}`} className="field-error">
                  Error · {issue.message}
                </li>
              ))}
              {validation.warnings.map((issue, index) => (
                <li key={`w${index}`} className="text-meta">
                  Warning · {issue.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </AccessibleTabs>
    </section>
  );
}
