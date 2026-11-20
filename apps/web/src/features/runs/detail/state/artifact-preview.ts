/**
 * Safe artifact preview classification for the unified run workspace (#2257).
 * Previews are text-only: binary artifacts are offered as a download link
 * instead of being injected into the DOM.
 */

export type ArtifactPreviewKind = 'text' | 'json' | 'log' | 'binary';

export interface ArtifactMetadata {
  name: string;
  contentType?: string | null;
  sizeBytes?: number | null;
}

export interface ArtifactPreview {
  kind: ArtifactPreviewKind;
  text: string;
  truncated: boolean;
  byteCount: number;
}

const TEXT_EXTENSIONS = ['.txt', '.log', '.text', '.md', '.csv', '.jsonl', '.toml', '.yaml', '.yml'];
const JSON_EXTENSIONS = ['.json', '.json.gz'];
const MAX_PREVIEW_BYTES = 16 * 1024;

export function classifyArtifact(artifact: ArtifactMetadata): ArtifactPreviewKind {
  const name = artifact.name.toLowerCase();
  const contentType = (artifact.contentType ?? '').toLowerCase();

  if (contentType.includes('json') || JSON_EXTENSIONS.some((ext) => name.endsWith(ext))) return 'json';
  if (contentType.startsWith('text/') || TEXT_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return name.endsWith('.log') || name.endsWith('.jsonl') ? 'log' : 'text';
  }
  return 'binary';
}

export function createArtifactPreview(artifact: ArtifactMetadata, content: string, limit = MAX_PREVIEW_BYTES): ArtifactPreview {
  const kind = classifyArtifact(artifact);
  if (kind === 'binary') {
    return { kind, text: 'Binary artifact — download to inspect', truncated: false, byteCount: artifact.sizeBytes ?? 0 };
  }

  const safeLimit = Math.max(0, Math.min(limit, MAX_PREVIEW_BYTES));
  const truncated = content.length > safeLimit;
  const text = truncated ? content.slice(0, safeLimit) : content;
  return { kind, text, truncated, byteCount: content.length };
}

/** Format byte counts with stable units for artifact lists. */
export function formatArtifactSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
