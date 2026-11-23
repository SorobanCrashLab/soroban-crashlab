/** Pure Markdown/HTML/PDF-ready export helpers with resolved embeds and redaction. */
import { redactSecrets, redactSnapshot } from './redaction';
import {
  parseBlocks,
  type ReportBlock,
} from './markdown-blocks';
import { evidenceSourceUrl } from './embeds';
import { safeMermaidText, validateMermaid } from './mermaid';
import {
  escapeReportText,
  isSafeReportUrl,
  reportPlainText,
  safeReportUrl,
  sanitizeReportHtml,
  sanitizeReportMarkdown,
} from './sanitize';
import type { CalloutBlockData, EntitySnapshot, EvidenceRef, MermaidBlockData, ReportDocument } from './types';
import { markdownToSafeHtml } from './markdown-html';

export type ReportExportFormat = 'markdown' | 'html' | 'pdf-html';

export interface ExportOptions {
  /** Live snapshots captured at export time, keyed by evidence block id. */
  snapshots?: Record<string, EntitySnapshot | null>;
  /** Defaults to true. */
  redact?: boolean;
}

function shouldRedact(options: ExportOptions): boolean {
  return options.redact !== false;
}

function redactText(text: string, options: ExportOptions): string {
  return shouldRedact(options) ? redactSecrets(text) : text;
}

/** Keep timestamps stable across timezones while remaining human readable. */
function formatTimestamp(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value);
  return match ? `${match[1]} ${match[2]}` : reportPlainText(value);
}

function evidenceMarkdown(
  ref: EvidenceRef,
  options: ExportOptions,
): string {
  const snapshots = options.snapshots ?? {};
  const raw = Object.prototype.hasOwnProperty.call(snapshots, ref.id) ? snapshots[ref.id] : ref.snapshot;
  const snapshot = raw && shouldRedact(options) ? redactSnapshot(raw) : raw;
  const label = reportPlainText(redactText(ref.label || ref.type, options));
  if (!snapshot) {
    return `> **Evidence unavailable** — ${reportPlainText(ref.type)} \`${reportPlainText(ref.entityId)}\``;
  }
  const lines = [
    `**Evidence · ${label} — ${reportPlainText(snapshot.title)}**`,
    `- ID: \`${reportPlainText(snapshot.id)}\``,
    `- Type: ${reportPlainText(snapshot.type)}`,
    `- Status: ${reportPlainText(snapshot.status)}`,
    `- Captured: ${formatTimestamp(snapshot.timestamp)}`,
  ];
  const source = evidenceSourceUrl(snapshot);
  if (source && isSafeReportUrl(source)) {
    lines.push(`- Source: [view source](${safeReportUrl(source)})`);
  }
  if (snapshot.summary) lines.push('', reportPlainText(snapshot.summary));
  if (snapshot.fields) {
    const entries = Object.entries(snapshot.fields);
    if (entries.length > 0) {
      lines.push('', '| Field | Value |', '| --- | --- |');
      for (const [key, value] of entries) {
        lines.push(`| ${reportPlainText(key)} | ${reportPlainText(value)} |`);
      }
    }
  }
  return lines.join('\n');
}

function mermaidMarkdown(data: MermaidBlockData, options: ExportOptions): string {
  const code = redactText(data.code, options);
  const safe = safeMermaidText(code);
  const validation = validateMermaid(code);
  const caption = data.caption ? `\n\n*${reportPlainText(redactText(data.caption, options))}*` : '';
  if (!validation.valid) {
    return `> **Diagram unavailable:** ${reportPlainText(validation.diagnostics.join('; '))}\n\n\`\`\`text\n${safe}\n\`\`\`${caption}`;
  }
  return `\`\`\`mermaid\n${safe}\n\`\`\`${caption}`;
}

function calloutMarkdown(data: CalloutBlockData, options: ExportOptions): string {
  const heading = `**${reportPlainText(data.variant.toUpperCase())} — ${reportPlainText(redactText(data.title, options))}**`;
  const body = reportPlainText(redactText(data.body, options))
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
  return `> ${heading}\n>\n${body}`;
}

/** Resolve directives into self-contained Markdown with no hidden references. */
export function buildExportMarkdown(document: ReportDocument, options: ExportOptions = {}): string {
  // Parse first: redacting raw directive JSON can corrupt its escaped quotes.
  // Each block type is redacted at its own rendered boundary instead.
  const blocks = parseBlocks(sanitizeReportMarkdown(document.markdown));
  const rendered = blocks.map((block: ReportBlock) => {
    switch (block.kind) {
      case 'evidence':
        return evidenceMarkdown(block.data as EvidenceRef, options);
      case 'mermaid':
        return mermaidMarkdown(block.data as MermaidBlockData, options);
      case 'callout':
        return calloutMarkdown(block.data as CalloutBlockData, options);
      case 'invalid':
        return `> **Unrenderable block:** ${reportPlainText(block.error ?? 'unknown error')}`;
      default:
        return redactText(block.source, options);
    }
  });
  return rendered.join('\n\n').trim();
}

export function exportMarkdown(document: ReportDocument, options: ExportOptions = {}): string {
  const title = shouldRedact(options) ? redactSecrets(document.title) : document.title;
  return `# ${reportPlainText(title)}\n\n${buildExportMarkdown(document, options)}\n`;
}

export function exportHtml(document: ReportDocument, options: ExportOptions = {}): string {
  const title = shouldRedact(options) ? redactSecrets(document.title) : document.title;
  const body = markdownToSafeHtml(buildExportMarkdown(document, options));
  return sanitizeReportHtml(
    `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>${escapeReportText(reportPlainText(title))}</title></head>\n<body>\n<main>\n${body}\n</main>\n</body>\n</html>\n`,
  );
}

/** Static HTML intended to be printed to PDF by a browser or headless runner. */
export function exportPdfHtml(document: ReportDocument, options: ExportOptions = {}): string {
  const title = shouldRedact(options) ? redactSecrets(document.title) : document.title;
  const body = markdownToSafeHtml(buildExportMarkdown(document, options));
  const styles = [
    '@page { size: A4; margin: 18mm; }',
    'body { font-family: system-ui, sans-serif; font-size: 11pt; line-height: 1.5; color: #111; }',
    'h1, h2, h3 { break-after: avoid; }',
    'pre, table, blockquote { break-inside: avoid; }',
    'pre { white-space: pre-wrap; border: 1px solid #ccc; padding: 8pt; }',
    'table { border-collapse: collapse; width: 100%; }',
    'th, td { border: 1px solid #ccc; padding: 4pt; text-align: left; }',
    '@media print { a { color: inherit; text-decoration: none; } }',
  ].join('\n');
  return sanitizeReportHtml(
    `<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>${escapeReportText(reportPlainText(title))}</title><style>${styles}</style></head>\n<body>\n<article>\n<h1>${escapeReportText(reportPlainText(title))}</h1>\n${body}\n</article>\n</body>\n</html>\n`,
  );
}

export function exportReport(
  document: ReportDocument,
  format: ReportExportFormat,
  options: ExportOptions = {},
): string {
  if (format === 'markdown') return exportMarkdown(document, options);
  if (format === 'html') return exportHtml(document, options);
  return exportPdfHtml(document, options);
}
