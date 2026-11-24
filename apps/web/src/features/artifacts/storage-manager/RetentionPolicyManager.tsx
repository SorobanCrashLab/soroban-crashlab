'use client';

/**
 * Retention policies, dry-run simulation and the deletion queue (#2342).
 * Policy edits are maintainer-only; deletions are two-person (request →
 * approve by someone else → execute) and every step is audited.
 */

import { useState } from 'react';
import { formatSize } from '@/app/utils/format';
import type { ArtifactManagerState } from './hooks/useArtifactManager';
import type { RetentionPolicy } from './lib/model';

function PolicyRow({ policy, editable, onSave, busy }: { policy: RetentionPolicy; editable: boolean; onSave: (policy: RetentionPolicy) => void; busy: boolean }) {
  const [draft, setDraft] = useState(policy);
  const dirty = JSON.stringify(draft) !== JSON.stringify(policy);
  return (
    <tr>
      <th scope="row" className="text-left">
        {policy.artifactType}
      </th>
      <td>
        <input
          type="number"
          min={1}
          max={3650}
          className="input-field w-24"
          aria-label={`Max age in days for ${policy.artifactType}`}
          disabled={!editable}
          value={draft.maxAgeDays}
          onChange={(event) => setDraft({ ...draft, maxAgeDays: Number(event.target.value) })}
        />
      </td>
      <td>
        <select
          className="input-field"
          aria-label={`Action for ${policy.artifactType}`}
          disabled={!editable}
          value={draft.action}
          onChange={(event) => setDraft({ ...draft, action: event.target.value as RetentionPolicy['action'] })}
        >
          <option value="delete">delete</option>
          <option value="archive">archive</option>
        </select>
      </td>
      <td>
        <input
          type="number"
          min={0}
          max={100}
          className="input-field w-20"
          aria-label={`Keep newest N per campaign for ${policy.artifactType}`}
          disabled={!editable}
          value={draft.keepMinimum}
          onChange={(event) => setDraft({ ...draft, keepMinimum: Number(event.target.value) })}
        />
      </td>
      <td>
        <input
          type="checkbox"
          aria-label={`Enable policy for ${policy.artifactType}`}
          disabled={!editable}
          checked={draft.enabled}
          onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
        />
      </td>
      <td className="text-meta text-xs whitespace-nowrap">
        {policy.updatedBy} · {policy.updatedAt.slice(0, 10)}
      </td>
      <td>
        {editable ? (
          <button type="button" className="btn-outline text-xs" disabled={!dirty || busy} onClick={() => onSave(draft)}>
            Save
          </button>
        ) : null}
      </td>
    </tr>
  );
}

export function RetentionPolicyManager({ state }: { state: ArtifactManagerState }) {
  const data = state.retention.data;
  const permissions = data?.viewer.permissions;
  const [reason, setReason] = useState('Retention policy cleanup');
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!data) {
    return (
      <section className="card card-padding" aria-busy={state.retention.loading}>
        <p className="text-meta">{state.retention.error ?? 'Loading retention state…'}</p>
      </section>
    );
  }
  const { simulation } = data;
  return (
    <div className="flex flex-col gap-3">
      <section className="card card-padding min-w-0" aria-label="Retention policies">
        <h2 className="text-sm-semibold">Policies per artifact class</h2>
        {!permissions?.managePolicies ? <p className="text-meta text-xs">Read-only: changing policies requires the maintainer role.</p> : null}
        <div className="table-responsive overflow-auto">
          <table className="data-table text-sm">
            <thead>
              <tr>
                <th scope="col" className="text-left">Class</th>
                <th scope="col" className="text-left">Max age (days)</th>
                <th scope="col" className="text-left">Action</th>
                <th scope="col" className="text-left">Keep newest</th>
                <th scope="col" className="text-left">Enabled</th>
                <th scope="col" className="text-left">Last change</th>
                <th scope="col">
                  <span className="sr-only">Save</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.policies.map((policy) => (
                <PolicyRow
                  key={`${policy.artifactType}-${policy.updatedAt}`}
                  policy={policy}
                  editable={Boolean(permissions?.managePolicies)}
                  busy={state.busy}
                  onSave={(next) => void state.updatePolicy(next)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card card-padding flex flex-col gap-2" aria-label="Retention dry run">
        <h2 className="text-sm-semibold">Dry run · {simulation.generatedAt.slice(0, 16).replace('T', ' ')} UTC</h2>
        <p className="text-sm">
          <strong>{simulation.eligible.length}</strong> eligible ({formatSize(simulation.bytesReclaimable)} reclaimable) ·{' '}
          <strong>{simulation.protectedByHold.length}</strong> protected by holds · <strong>{simulation.keptByMinimum.length}</strong> kept by
          minimum
        </p>
        <ul className="flex flex-wrap gap-2 text-xs">
          {Object.entries(simulation.byType).map(([type, entry]) => (
            <li key={type} className="chip">
              {type}: {entry.eligible} · {formatSize(entry.bytes)}
            </li>
          ))}
        </ul>
        {simulation.eligible.length > 0 ? (
          <details>
            <summary className="text-sm cursor-pointer">Eligible artifacts</summary>
            <ul className="text-xs mt-1 max-h-48 overflow-auto">
              {simulation.eligible.map((entry) => (
                <li key={entry.artifactId}>
                  {entry.artifactId} · {entry.name} · {entry.ageDays}d · {entry.action}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {simulation.protectedByHold.length > 0 ? (
          <details>
            <summary className="text-sm cursor-pointer">Protected by holds</summary>
            <ul className="text-xs mt-1 max-h-48 overflow-auto">
              {simulation.protectedByHold.map((entry) => (
                <li key={entry.artifactId}>
                  {entry.artifactId} · {entry.name} · {entry.holdIds.join(', ')}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {permissions?.requestDeletion && simulation.eligible.length > 0 ? (
          <div className="flex flex-wrap gap-2 items-center">
            <input className="input-field" aria-label="Reason for retention deletion" value={reason} onChange={(event) => setReason(event.target.value)} />
            <button
              type="button"
              className="btn-danger text-xs"
              disabled={state.busy || reason.trim().length < 5}
              onClick={() =>
                void state.requestDeletion(
                  simulation.eligible.filter((entry) => entry.action === 'delete').map((entry) => entry.artifactId),
                  reason,
                  'retention',
                )
              }
            >
              Queue eligible “delete” artifacts for approval
            </button>
          </div>
        ) : null}
      </section>

      <section className="card card-padding flex flex-col gap-2" aria-label="Deletion queue">
        <h2 className="text-sm-semibold">Deletion queue</h2>
        {data.deletions.length === 0 ? <p className="text-meta">No deletion requests.</p> : null}
        <ul className="flex flex-col gap-2">
          {data.deletions.map((request) => (
            <li key={request.id} className="rounded border border-token p-2 text-sm flex flex-col gap-1">
              <div className="flex-between flex-wrap gap-2">
                <span>
                  <code>{request.id}</code> · {request.artifactIds.length} artifact(s) · {request.source}
                </span>
                <span className={`ds-badge ${request.status === 'pending' ? 'ds-badge-warning' : request.status === 'rejected' ? 'ds-badge-neutral' : 'ds-badge-success'}`}>
                  {request.status}
                </span>
              </div>
              <span className="text-meta">
                {request.reason} — requested by {request.requestedBy} {request.requestedAt.slice(0, 16)}
                {request.decidedBy ? ` · decided by ${request.decidedBy}${request.decisionNote ? `: ${request.decisionNote}` : ''}` : ''}
              </span>
              {permissions?.approveDeletion && request.status === 'pending' ? (
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    className="input-field"
                    aria-label={`Decision note for ${request.id}`}
                    placeholder="Decision note"
                    value={notes[request.id] ?? ''}
                    onChange={(event) => setNotes({ ...notes, [request.id]: event.target.value })}
                  />
                  <button
                    type="button"
                    className="btn-outline text-xs"
                    disabled={state.busy || request.requestedBy === data.viewer.subject}
                    title={request.requestedBy === data.viewer.subject ? 'You cannot approve your own request.' : undefined}
                    onClick={() => void state.decide(request.id, 'approve', notes[request.id])}
                  >
                    Approve
                  </button>
                  <button type="button" className="btn-ghost text-xs" disabled={state.busy} onClick={() => void state.decide(request.id, 'reject', notes[request.id])}>
                    Reject
                  </button>
                </div>
              ) : null}
              {permissions?.approveDeletion && request.status === 'approved' ? (
                <button
                  type="button"
                  className="btn-danger text-xs self-start"
                  disabled={state.busy}
                  onClick={() => {
                    if (window.confirm(`Permanently delete ${request.artifactIds.length} artifact(s)? This cannot be undone.`)) {
                      void state.execute(request.id);
                    }
                  }}
                >
                  Execute deletion
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {data.audit.length > 0 ? (
        <section className="card card-padding" aria-label="Governance audit trail">
          <h2 className="text-sm-semibold">Audit trail</h2>
          <ol className="text-xs flex flex-col gap-1 mt-1">
            {data.audit.map((entry) => (
              <li key={`${entry.sequence}-${entry.at}`}>
                <time dateTime={entry.at}>{entry.at.slice(0, 19).replace('T', ' ')}</time> · {entry.actor} · <code>{entry.action}</code> · {entry.target} —{' '}
                {entry.detail}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
