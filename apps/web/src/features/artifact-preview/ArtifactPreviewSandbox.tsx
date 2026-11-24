'use client';

/*
 * Secure Artifact Preview Sandbox UI (#2337).
 *
 * Renders untrusted artifact text inside an inert, sandboxed iframe using an
 * escaped srcDoc. Redaction, trust indicators and download controls are driven
 * by the pure policy model.
 */
import { useMemo, useState } from 'react';
import {
  DEFAULT_REDACTION_RULES,
  SANDBOX_POLICY,
  buildSandboxDocument,
  detectContentType,
  evaluateAccess,
  evaluateDownload,
  redact,
  summarizeForForensics,
  type Artifact,
  type PreviewPolicy,
} from './model';

interface ArtifactPreviewSandboxProps {
  artifact: Artifact;
  policy?: PreviewPolicy;
  permissions?: { canViewSensitive: boolean; canDownload: boolean };
  onAudit?: (action: string, artifactId: string) => void;
}

const DEFAULT_POLICY: PreviewPolicy = {
  allowDownload: true,
  allowCopy: false,
  requireCleanScan: true,
  requireCanViewSensitive: true,
};

export function ArtifactPreviewSandbox({
  artifact,
  policy = DEFAULT_POLICY,
  permissions = { canViewSensitive: true, canDownload: true },
  onAudit,
}: ArtifactPreviewSandboxProps) {
  const [reveal, setReveal] = useState(false);
  const kind = useMemo(
    () => detectContentType(artifact.name, artifact.mimeType, artifact.content),
    [artifact],
  );
  const redacted = useMemo(
    () => (reveal ? { text: artifact.content, findings: [] } : redact(artifact.content, DEFAULT_REDACTION_RULES)),
    [artifact.content, reveal],
  );
  const forensics = useMemo(
    () => summarizeForForensics(artifact.content, artifact.sha256),
    [artifact.content, artifact.sha256],
  );
  const access = evaluateAccess(artifact, policy, permissions);
  const download = evaluateDownload(artifact, policy, permissions);
  const srcDoc = useMemo(
    () => buildSandboxDocument(artifact, kind, redacted.text),
    [artifact, kind, redacted.text],
  );

  return (
    <section aria-labelledby="artifact-preview-heading" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-mono">{artifact.name}</span>
        <span>{kind}</span>
        <span>scan: {artifact.scanStatus}</span>
        <span>sha256: {artifact.sha256.slice(0, 12)}…</span>
        {artifact.quarantined && <span className="text-rose-300">QUARANTINED</span>}
      </div>

      {redacted.findings.length > 0 && (
        <div>
          <p className="text-meta">
            Redacted: {redacted.findings.map((item) => `${item.label} ×${item.count}`).join(', ')}
          </p>
          {permissions.canViewSensitive && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={reveal} onChange={(event) => setReveal(event.target.checked)} />
              Reveal masked values
            </label>
          )}
        </div>
      )}

      {access.allowed ? (
        <iframe
          title={`Sandboxed preview of ${artifact.name}`}
          srcDoc={srcDoc}
          sandbox={SANDBOX_POLICY.sandbox}
          referrerPolicy="no-referrer"
          className="h-96 w-full rounded border border-slate-800 bg-slate-950"
        />
      ) : (
        <p role="alert" className="text-rose-300">Preview blocked: {access.reasons.join('; ')}</p>
      )}

      <div className="text-xs text-slate-400">
        <p>Lines: {forensics.lines} · Longest line: {forensics.longestLine} · Bytes: {forensics.byteLength}</p>
        <p>Encoding: {forensics.encoding} · Integrity: {forensics.checksum}</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="rounded border border-slate-700 px-3 py-1 disabled:opacity-50"
          disabled={!download.allowed}
          onClick={() => onAudit?.('download', artifact.id)}
        >
          Download
        </button>
        <button
          type="button"
          className="rounded border border-slate-700 px-3 py-1 disabled:opacity-50"
          disabled={!access.allowed || !policy.allowCopy}
          onClick={() => onAudit?.('copy', artifact.id)}
        >
          Copy
        </button>
        {!download.allowed && (
          <span className="text-sm text-amber-300" role="status">
            Download restricted: {download.reasons.join('; ')}
          </span>
        )}
      </div>
    </section>
  );
}
