'use client';

/**
 * Artifact metadata, preview and download (#2342). Downloads and previews
 * are only offered when the server's access decision allows them; previews
 * are always rendered as escaped text, never as HTML.
 */

import Link from 'next/link';
import { formatSize } from '@/app/utils/format';
import type { ArtifactManagerState } from './hooks/useArtifactManager';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-meta">{label}</dt>
      <dd className="text-sm break-all">{children}</dd>
    </>
  );
}

export function ArtifactMetadataPanel({ state }: { state: ArtifactManagerState }) {
  const { metadata } = state;
  if (!state.selectedId) {
    return (
      <section className="card card-padding" aria-label="Artifact details">
        <p className="text-meta">Select an artifact to see its metadata, integrity and lineage.</p>
      </section>
    );
  }
  const data = metadata.data;
  const artifact = data?.artifact;
  return (
    <section className="card card-padding flex flex-col gap-3" aria-label="Artifact details" aria-busy={metadata.loading}>
      <div className="flex-between gap-2">
        <h2 className="text-sm-semibold truncate">{artifact?.name ?? state.selectedId}</h2>
        <button type="button" className="btn-ghost text-xs" onClick={() => state.select(null)} aria-label="Close details">
          ✕
        </button>
      </div>
      {metadata.error ? (
        <p className="field-error text-sm" role="alert">
          {metadata.error}
        </p>
      ) : null}
      {artifact ? (
        <>
          {artifact.redacted ? <p className="text-meta text-xs">Restricted: identifying metadata is masked for your role.</p> : null}
          <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1">
            <Row label="ID">{artifact.id}</Row>
            <Row label="Backend">
              {artifact.backend} · {artifact.bucket}
            </Row>
            <Row label="Key">{artifact.key}</Row>
            <Row label="Type">
              {artifact.type} ({artifact.contentType})
            </Row>
            <Row label="Size">{formatSize(artifact.sizeBytes)}</Row>
            <Row label="Created">
              {artifact.createdAt} by {artifact.createdBy.kind} {artifact.createdBy.id}
            </Row>
            <Row label="SHA-256">{artifact.checksums.sha256 ?? 'not recorded'}</Row>
            <Row label="Sensitivity">{artifact.sensitivity}</Row>
            <Row label="Tags">{artifact.tags.length > 0 ? artifact.tags.join(', ') : '—'}</Row>
            <Row label="Linked">
              <span className="flex flex-wrap gap-2">
                {artifact.runId ? (
                  <Link className="link" href={`/runs/${encodeURIComponent(artifact.runId)}`}>
                    {artifact.runId}
                  </Link>
                ) : null}
                {artifact.campaignId ? (
                  <Link className="link" href={`/campaigns/${encodeURIComponent(artifact.campaignId)}`}>
                    {artifact.campaignId}
                  </Link>
                ) : null}
                {artifact.crashId ? <span>{artifact.crashId}</span> : null}
                {artifact.reportId ? (
                  <Link className="link" href={`/reports/${encodeURIComponent(artifact.reportId)}`}>
                    {artifact.reportId}
                  </Link>
                ) : null}
                {!artifact.runId && !artifact.campaignId && !artifact.reportId ? '—' : null}
              </span>
            </Row>
            {artifact.source === 'demo' ? <Row label="Source">Demo catalog record (no stored bytes)</Row> : null}
          </dl>

          {data.holds.length > 0 ? (
            <p className="text-sm">
              <span className="ds-badge ds-badge-info">On hold</span> {data.holds.map((hold) => `${hold.name} (${hold.kind})`).join(', ')}
            </p>
          ) : null}
          {data.deletionRequests.length > 0 ? (
            <p className="text-sm">
              Deletion requests: {data.deletionRequests.map((entry) => `${entry.id} (${entry.status})`).join(', ')}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 items-center">
            {data.download ? (
              <a className="btn-primary text-xs" href={data.download.href} rel="noopener noreferrer" download>
                Download
              </a>
            ) : null}
            {data.download?.expiresAt ? <span className="text-meta text-xs">Signed link expires {data.download.expiresAt}</span> : null}
            {!data.access.canDownload && data.access.reason ? <span className="text-meta text-xs">{data.access.reason}</span> : null}
          </div>

          {data.preview ? (
            <div>
              <h3 className="text-sm-medium">Preview {data.preview.truncated ? '(truncated)' : ''}</h3>
              <pre className="text-xs whitespace-pre-wrap break-all surface-soft p-2 rounded max-h-64 overflow-auto" aria-label="Redacted preview">
                {data.preview.text}
              </pre>
            </div>
          ) : data.access.canPreview ? null : (
            <p className="text-meta text-xs">Preview unavailable for {artifact.contentType}.</p>
          )}
        </>
      ) : null}
    </section>
  );
}
