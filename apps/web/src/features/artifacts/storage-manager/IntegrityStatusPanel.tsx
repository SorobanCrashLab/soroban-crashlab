'use client';

/**
 * Integrity & security status (#2342, #023): checksum, signature, malware
 * scan, quarantine and provenance checks with an on-demand re-verification.
 */

import { TrustBadge } from './ArtifactExplorer';
import type { ArtifactManagerState } from './hooks/useArtifactManager';

const ICONS = { pass: '✓', warn: '!', fail: '✕', unknown: '?' } as const;
const TONES = { pass: 'ds-badge-success', warn: 'ds-badge-warning', fail: 'ds-badge-error', unknown: 'ds-badge-neutral' } as const;

export function IntegrityStatusPanel({ state }: { state: ArtifactManagerState }) {
  const data = state.metadata.data;
  if (!state.selectedId || !data) return null;
  const { integrity, artifact } = data;
  return (
    <section className="card card-padding flex flex-col gap-2" aria-label="Integrity and security">
      <div className="flex-between">
        <h2 className="text-sm-semibold">Integrity &amp; security</h2>
        <TrustBadge level={integrity.level} />
      </div>
      <ul className="flex flex-col gap-1">
        {integrity.checks.map((check) => (
          <li key={check.id} className="text-sm flex gap-2 items-start">
            <span className={`ds-badge ${TONES[check.status]}`} aria-label={check.status}>
              {ICONS[check.status]}
            </span>
            <span>
              <strong>{check.label}</strong> — {check.detail}
            </span>
          </li>
        ))}
      </ul>
      {artifact.quarantine.active ? (
        <p className="field-error text-sm" role="alert">
          Quarantined since {artifact.quarantine.since ?? 'unknown'}: downloads and previews are disabled.
        </p>
      ) : null}
      {artifact.source === 'storage' && state.viewer?.permissions.download ? (
        <button type="button" className="btn-outline text-xs self-start" onClick={state.verifyNow} disabled={state.metadata.loading}>
          Re-verify checksum
        </button>
      ) : null}
    </section>
  );
}
