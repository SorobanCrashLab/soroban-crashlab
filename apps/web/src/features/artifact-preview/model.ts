/*
 * Secure Artifact Preview Sandbox (#2337).
 *
 * Content-type detection, script-free sandboxed document generation,
 * deterministic redaction, forensic helpers and download/trust policy checks.
 * This module never renders HTML itself — it produces strings for an inert
 * iframe `srcDoc`, so untrusted artifact content cannot execute scripts.
 */

export type ArtifactKind = 'text' | 'log' | 'json' | 'hex' | 'binary' | 'image' | 'html' | 'pdf' | 'archive';
export type ScanStatus = 'clean' | 'scanning' | 'infected' | 'unknown';

export interface Artifact {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  content: string;
  sha256: string;
  scanStatus: ScanStatus;
  quarantined: boolean;
  sensitive: boolean;
}

export interface RedactionRule {
  id: string;
  pattern: RegExp;
  replacement: string;
  label: string;
}

export interface RedactionFinding {
  ruleId: string;
  label: string;
  count: number;
}

export interface RedactionResult {
  text: string;
  findings: RedactionFinding[];
}

export interface PreviewPolicy {
  allowDownload: boolean;
  allowCopy: boolean;
  requireCleanScan: boolean;
  requireCanViewSensitive: boolean;
}

export interface AccessDecision {
  allowed: boolean;
  reasons: string[];
}

export interface ForensicSummary {
  lines: number;
  longestLine: number;
  byteLength: number;
  encoding: 'ascii' | 'utf-8' | 'binary';
  checksum: string;
  offsets: Array<{ line: number; startByte: number; endByte: number }>;
}

/** Default redaction rules. Patterns are deterministic and order-dependent. */
export const DEFAULT_REDACTION_RULES: RedactionRule[] = [
  { id: 'secret-key', pattern: /S[A-Z2-7]{55,}/g, replacement: '[REDACTED_SECRET]', label: 'Stellar secret key' },
  { id: 'api-key', pattern: /\b(?:sk_live|api_key|token)[A-Za-z0-9_\-]{8,}\b/gi, replacement: '[REDACTED_TOKEN]', label: 'API token' },
  { id: 'email', pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, replacement: '[REDACTED_EMAIL]', label: 'Email address' },
];

/** Strict sandbox policy applied to every generated preview document. */
export const SANDBOX_POLICY = {
  sandbox: 'allow-same-origin',
  csp: "default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; sandbox",
  allowScripts: false,
  allowPlugins: false,
  allowDownloads: false,
} as const;

export function detectContentType(name: string, mimeType: string, content: string): ArtifactKind {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (mimeType.includes('json') || extension === 'json') return 'json';
  if (mimeType.startsWith('text/html') || extension === 'html') return 'html';
  if (['zip', 'tar', 'gz', '7z'].includes(extension)) return 'archive';
  if (extension === 'wasm' || mimeType.includes('wasm')) return 'binary';
  if (extension === 'log' || /^\s*(?:\d{4}-\d{2}-\d{2}|\[.*?\])\s*(?:INFO|WARN|ERROR|DEBUG)/m.test(content)) return 'log';
  if (/^[\x20-\x7E\n\r\t]*$/.test(content)) return 'text';
  return 'binary';
}

/** Escape every HTML metacharacter so artifact content is inert text. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Build a script-free `srcDoc` document for a preview. */
export function buildSandboxDocument(artifact: Artifact, kind: ArtifactKind, body: string): string {
  const title = escapeHtml(artifact.name);
  const heading = escapeHtml(`${kind.toUpperCase()} preview · ${artifact.name}`);
  const csp = SANDBOX_POLICY.csp.replace(/'/g, '&#39;');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<title>${title}</title><style>body{font:13px ui-monospace,monospace;background:#0b1020;color:#d7e3f4;padding:12px;white-space:pre-wrap}h1{font-size:14px;color:#4fd1c5}</style>` +
    `</head><body><h1>${heading}</h1><div id="artifact">${escapeHtml(body)}</div></body></html>`;
}

/** Deterministic redaction with counts per rule. */
export function redact(text: string, rules: RedactionRule[] = DEFAULT_REDACTION_RULES): RedactionResult {
  let output = text;
  const findings: RedactionFinding[] = [];
  for (const rule of rules) {
    const matches = output.match(rule.pattern) ?? [];
    if (matches.length > 0) {
      output = output.replace(rule.pattern, rule.replacement);
      findings.push({ ruleId: rule.id, label: rule.label, count: matches.length });
    }
  }
  return { text: output, findings };
}

/** Simple deterministic FNV-1a checksum (not cryptographic; for display only). */
export function checksum(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Forensic metadata with line numbers and byte offsets. */
export function summarizeForForensics(text: string, declaredChecksum?: string): ForensicSummary {
  const lines = text.split(/\r?\n/);
  let offset = 0;
  const offsets = lines.map((line, index) => {
    const startByte = offset;
    offset += line.length + 1;
    return { line: index + 1, startByte, endByte: startByte + line.length - 1 };
  });
  const encoding = /[\x00-\x08\x0E-\x1F]/.test(text) ? 'binary' : /[^\x00-\x7F]/.test(text) ? 'utf-8' : 'ascii';
  return {
    lines: lines.length,
    longestLine: lines.reduce((max, line) => Math.max(max, line.length), 0),
    byteLength: text.length,
    encoding,
    checksum: declaredChecksum ?? checksum(text),
    offsets,
  };
}

/** Policy + trust decision for preview, copy and download actions. */
export function evaluateAccess(
  artifact: Artifact,
  policy: PreviewPolicy,
  permissions: { canViewSensitive: boolean; canDownload: boolean },
): AccessDecision {
  const reasons: string[] = [];
  if (artifact.quarantined) reasons.push('Artifact is quarantined');
  if (policy.requireCleanScan && artifact.scanStatus !== 'clean') reasons.push('Artifact has no clean scan result');
  if (artifact.sensitive && policy.requireCanViewSensitive && !permissions.canViewSensitive) {
    reasons.push('Sensitive artifact requires elevated permission');
  }
  if (artifact.sizeBytes <= 0) reasons.push('Artifact is empty');
  return { allowed: reasons.length === 0, reasons };
}

export function evaluateDownload(
  artifact: Artifact,
  policy: PreviewPolicy,
  permissions: { canViewSensitive: boolean; canDownload: boolean },
): AccessDecision {
  const preview = evaluateAccess(artifact, policy, permissions);
  const reasons = [...preview.reasons];
  if (!policy.allowDownload || !permissions.canDownload) reasons.push('Download is not permitted by policy');
  if (artifact.scanStatus !== 'clean') reasons.push('Only clean-scanned artifacts may be downloaded');
  return { allowed: reasons.length === 0, reasons };
}
