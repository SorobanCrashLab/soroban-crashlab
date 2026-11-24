'use client';

/**
 * Legal / compliance / investigation holds (#2342). Holds override every
 * retention policy and block deletion requests and approvals. Releasing a
 * legal hold needs a written justification, which is audited.
 */

import { useState } from 'react';
import type { ArtifactManagerState } from './hooks/useArtifactManager';
import type { HoldKind } from './lib/model';

export function HoldsManager({ state }: { state: ArtifactManagerState }) {
  const data = state.holds.data;
  const canManage = Boolean(data?.viewer.permissions.manageHolds);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<HoldKind>('investigation');
  const [reason, setReason] = useState('');
  const [scopeKind, setScopeKind] = useState<'campaignId' | 'runId' | 'artifactIds'>('campaignId');
  const [scopeValue, setScopeValue] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [justifications, setJustifications] = useState<Record<string, string>>({});

  const scopeLabel = (scope: { artifactIds?: string[]; campaignId?: string; runId?: string }) =>
    [
      scope.campaignId ? `campaign ${scope.campaignId}` : null,
      scope.runId ? `run ${scope.runId}` : null,
      scope.artifactIds?.length ? `${scope.artifactIds.length} artifact(s)` : null,
    ]
      .filter(Boolean)
      .join(', ');

  return (
    <div className="flex flex-col gap-3">
      {canManage ? (
        <form
          className="card card-padding grid gap-2 sm:grid-cols-2"
          aria-label="Place a hold"
          onSubmit={(event) => {
            event.preventDefault();
            const scope =
              scopeKind === 'artifactIds'
                ? { artifactIds: scopeValue.split(',').map((value) => value.trim()).filter(Boolean) }
                : { [scopeKind]: scopeValue.trim() };
            void state
              .createHold({ name, kind, reason, scope, expiresAt: expiresAt ? new Date(`${expiresAt}:00Z`).toISOString() : null })
              .then((result) => {
                if (result) {
                  setName('');
                  setReason('');
                  setScopeValue('');
                  setExpiresAt('');
                }
              });
          }}
        >
          <h2 className="text-sm-semibold sm:col-span-2">Place a hold</h2>
          <label className="text-sm flex flex-col gap-1">
            <span className="input-label">Name</span>
            <input className="input-field" required minLength={3} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="text-sm flex flex-col gap-1">
            <span className="input-label">Kind</span>
            <select className="input-field" value={kind} onChange={(event) => setKind(event.target.value as HoldKind)}>
              <option value="investigation">investigation</option>
              <option value="compliance">compliance</option>
              <option value="legal">legal (never expires)</option>
            </select>
          </label>
          <label className="text-sm flex flex-col gap-1 sm:col-span-2">
            <span className="input-label">Reason</span>
            <textarea className="input-field" required minLength={10} rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
          <label className="text-sm flex flex-col gap-1">
            <span className="input-label">Scope</span>
            <select className="input-field" value={scopeKind} onChange={(event) => setScopeKind(event.target.value as typeof scopeKind)}>
              <option value="campaignId">Campaign</option>
              <option value="runId">Run</option>
              <option value="artifactIds">Artifact ids (comma-separated)</option>
            </select>
          </label>
          <label className="text-sm flex flex-col gap-1">
            <span className="input-label">Scope value</span>
            <input className="input-field" required value={scopeValue} onChange={(event) => setScopeValue(event.target.value)} />
          </label>
          {kind !== 'legal' ? (
            <label className="text-sm flex flex-col gap-1">
              <span className="input-label">Expires (UTC, optional)</span>
              <input className="input-field" type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} />
            </label>
          ) : null}
          <div className="flex items-end">
            <button type="submit" className="btn-primary text-xs" disabled={state.busy}>
              Place hold
            </button>
          </div>
        </form>
      ) : (
        <p className="text-meta text-xs">Placing and releasing holds requires the maintainer role.</p>
      )}

      <section className="card card-padding flex flex-col gap-2" aria-label="Holds" aria-busy={state.holds.loading}>
        <h2 className="text-sm-semibold">Holds</h2>
        {state.holds.error ? <p className="field-error text-sm">{state.holds.error}</p> : null}
        {data && data.holds.length === 0 ? <p className="text-meta">No holds.</p> : null}
        <ul className="flex flex-col gap-2">
          {(data?.holds ?? []).map((hold) => (
            <li key={hold.id} className="rounded border border-token p-2 text-sm flex flex-col gap-1">
              <div className="flex-between flex-wrap gap-2">
                <strong>{hold.name}</strong>
                <span className="flex gap-1">
                  <span className="ds-badge ds-badge-info">{hold.kind}</span>
                  <span className={`ds-badge ${hold.active ? 'ds-badge-warning' : 'ds-badge-neutral'}`}>{hold.active ? 'active' : 'inactive'}</span>
                </span>
              </div>
              <span className="text-meta">
                {scopeLabel(hold.scope)} · {hold.coveredArtifacts} artifact(s) · placed by {hold.createdBy} {hold.createdAt.slice(0, 10)}
                {hold.expiresAt ? ` · expires ${hold.expiresAt.slice(0, 10)}` : ''}
              </span>
              <span>{hold.reason}</span>
              {hold.releasedAt ? (
                <span className="text-meta">
                  Released by {hold.releasedBy} {hold.releasedAt.slice(0, 10)}: {hold.releaseJustification}
                </span>
              ) : null}
              {canManage && hold.active ? (
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    className="input-field flex-1"
                    aria-label={`Justification for releasing ${hold.name}`}
                    placeholder={hold.kind === 'legal' ? 'Justification (20+ characters, audited)' : 'Justification'}
                    value={justifications[hold.id] ?? ''}
                    onChange={(event) => setJustifications({ ...justifications, [hold.id]: event.target.value })}
                  />
                  <button
                    type="button"
                    className="btn-outline text-xs"
                    disabled={state.busy}
                    onClick={() => void state.releaseHold(hold.id, justifications[hold.id] ?? '')}
                  >
                    Release
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
