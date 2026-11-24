/**
 * Integrity, security and access decisions (#2342, builds on #023).
 *
 * `assessIntegrity` folds checksum, signature, malware scan, quarantine and
 * provenance into one trust level with per-check evidence. `accessDecision`
 * turns that plus the viewer's role into what the UI may offer. Downloads of
 * blocked artifacts are refused here, server-side, not just hidden.
 */

import { redactArtifactText } from '@/lib/redaction';
import type { ManagedArtifact } from './model';
import { permissionsForRole, type ArtifactRole } from './permissions';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';
export type TrustLevel = 'trusted' | 'warning' | 'blocked';

export interface IntegrityCheck {
  id: 'checksum' | 'signature' | 'scan' | 'quarantine' | 'provenance';
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface IntegrityAssessment {
  level: TrustLevel;
  checks: IntegrityCheck[];
  reasons: string[];
}

export function assessIntegrity(artifact: ManagedArtifact): IntegrityAssessment {
  const checks: IntegrityCheck[] = [];

  if (!artifact.checksums.sha256) {
    checks.push({ id: 'checksum', label: 'Checksum', status: 'unknown', detail: 'No SHA-256 recorded.' });
  } else if (artifact.checksumMatches === false) {
    checks.push({ id: 'checksum', label: 'Checksum', status: 'fail', detail: 'Stored bytes do not match the recorded SHA-256.' });
  } else if (artifact.checksumMatches === true) {
    checks.push({ id: 'checksum', label: 'Checksum', status: 'pass', detail: `SHA-256 verified ${artifact.checksumVerifiedAt ?? ''}`.trim() });
  } else {
    checks.push({ id: 'checksum', label: 'Checksum', status: 'warn', detail: 'SHA-256 recorded but not re-verified.' });
  }

  const signature = artifact.signature;
  checks.push(
    signature.status === 'verified'
      ? { id: 'signature', label: 'Signature', status: 'pass', detail: `Signed by ${signature.keyId ?? 'unknown key'}.` }
      : signature.status === 'unsigned'
        ? { id: 'signature', label: 'Signature', status: 'warn', detail: 'Artifact is not signed.' }
        : signature.status === 'expired'
          ? { id: 'signature', label: 'Signature', status: 'warn', detail: `Signing key ${signature.keyId ?? ''} has expired.`.trim() }
          : { id: 'signature', label: 'Signature', status: 'fail', detail: 'Signature does not verify against the trusted keys.' },
  );

  const scan = artifact.scan;
  checks.push(
    scan.status === 'clean'
      ? { id: 'scan', label: 'Malware scan', status: 'pass', detail: `Clean (${scan.engine ?? 'scanner'}).` }
      : scan.status === 'infected'
        ? { id: 'scan', label: 'Malware scan', status: 'fail', detail: `Infected: ${scan.findings.join(', ') || 'see findings'}.` }
        : scan.status === 'suspicious'
          ? { id: 'scan', label: 'Malware scan', status: 'warn', detail: `Suspicious: ${scan.findings.join(', ') || 'heuristic match'}.` }
          : scan.status === 'pending'
            ? { id: 'scan', label: 'Malware scan', status: 'unknown', detail: 'Scan pending.' }
            : { id: 'scan', label: 'Malware scan', status: 'warn', detail: 'Scanner errored; result unknown.' },
  );

  checks.push(
    artifact.quarantine.active
      ? { id: 'quarantine', label: 'Quarantine', status: 'fail', detail: artifact.quarantine.reason ?? 'Quarantined.' }
      : { id: 'quarantine', label: 'Quarantine', status: 'pass', detail: 'Not quarantined.' },
  );

  const provenance = artifact.provenance;
  checks.push(
    provenance.slsaLevel >= 2 && provenance.attestationUrl
      ? { id: 'provenance', label: 'Provenance', status: 'pass', detail: `SLSA L${provenance.slsaLevel} attestation from ${provenance.builder}.` }
      : provenance.slsaLevel >= 1
        ? { id: 'provenance', label: 'Provenance', status: 'warn', detail: `SLSA L${provenance.slsaLevel}; no verifiable attestation.` }
        : { id: 'provenance', label: 'Provenance', status: 'warn', detail: 'No provenance recorded.' },
  );

  const failed = checks.filter((check) => check.status === 'fail');
  const warned = checks.filter((check) => check.status === 'warn' || check.status === 'unknown');
  const level: TrustLevel = failed.length > 0 ? 'blocked' : warned.length > 0 ? 'warning' : 'trusted';
  return { level, checks, reasons: [...failed, ...warned].map((check) => `${check.label}: ${check.detail}`) };
}

export type PreviewMode = 'text' | 'json' | 'image' | 'none';

const TEXT_TYPES = /^(text\/|application\/(x-ndjson|xml|x-yaml|yaml))/;
/** Types that are active content in a browser: shown as escaped text, never rendered. */
const ACTIVE_TYPES = /^(text\/html|image\/svg\+xml|application\/(javascript|xhtml\+xml)|text\/javascript)/;
const IMAGE_TYPES = /^image\/(png|jpeg|gif|webp)$/;

export function previewMode(contentType: string): PreviewMode {
  const type = contentType.toLowerCase().split(';')[0].trim();
  if (type === 'application/json') return 'json';
  if (ACTIVE_TYPES.test(type)) return 'text';
  if (IMAGE_TYPES.test(type)) return 'image';
  if (TEXT_TYPES.test(type)) return 'text';
  return 'none';
}

export const PREVIEW_BYTE_LIMIT = 64 * 1024;

/** Redacted, truncated preview text. Secrets never leave the server unmasked. */
export function safePreviewText(text: string): { text: string; truncated: boolean } {
  const truncated = text.length > PREVIEW_BYTE_LIMIT;
  return { text: redactArtifactText(truncated ? text.slice(0, PREVIEW_BYTE_LIMIT) : text), truncated };
}

export interface AccessDecision {
  canPreview: boolean;
  canDownload: boolean;
  reason: string | null;
  previewMode: PreviewMode;
}

export function accessDecision(artifact: ManagedArtifact, role: ArtifactRole): AccessDecision {
  const permissions = permissionsForRole(role);
  const integrity = assessIntegrity(artifact);
  const mode = previewMode(artifact.contentType);
  let reason: string | null = null;
  if (!permissions.download) reason = 'Sign in as an analyst to preview or download.';
  else if (artifact.sensitivity === 'restricted' && !permissions.viewRestricted) reason = 'Restricted artifact: maintainer role required.';
  else if (integrity.level === 'blocked') reason = `Blocked by integrity checks — ${integrity.reasons[0] ?? 'failed verification'}`;
  else if (artifact.source === 'demo') reason = 'Demo catalog entry: no stored bytes to serve.';
  const allowed = reason === null;
  return {
    canDownload: allowed,
    canPreview: allowed && permissions.preview && mode !== 'none',
    reason,
    previewMode: mode,
  };
}
