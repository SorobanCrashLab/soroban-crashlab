/**
 * Sanitization wrappers around the repository's shared utilities. Every piece
 * of report content rendered or exported goes through one of these helpers.
 */
import { escapeHtml, sanitizeHtml, sanitizeMarkdown, sanitizeUrl } from '@/lib/sanitize';
import { normalizeNewlines } from './serialization';

/**
 * The shared sanitizer stops at the first `)`. Report links can contain one
 * level of nested parentheses (e.g. `javascript:alert(1)`), so handle that case
 * before delegating to the shared helper.
 */
const NESTED_DANGEROUS_LINK = /\[([^\]]*)\]\((?:javascript|data|vbscript):(?:[^()]|\([^()]*\))*\)/gi;

/** Redaction markers must survive plain-text flattening for export labels. */
const REDACTION_MARKER = /\[REDACTED[^\]]*\]/g;
const MARKER_PLACEHOLDER = /\u0000(\d+)\u0000/g;

export function sanitizeReportMarkdown(markdown: string): string {
  return normalizeNewlines(sanitizeMarkdown(markdown.replace(NESTED_DANGEROUS_LINK, '$1')));
}

export function safeReportUrl(url: string): string {
  return sanitizeUrl(url.trim());
}

export function isSafeReportUrl(url: string): boolean {
  return safeReportUrl(url) !== '#';
}

export function escapeReportText(text: string): string {
  return escapeHtml(String(text));
}

/** Defense-in-depth for generated HTML before it reaches an export download. */
export function sanitizeReportHtml(html: string): string {
  return sanitizeHtml(html);
}

/** Compact plain text for evidence cards and export labels. */
export function reportPlainText(value: string | number | boolean | undefined): string {
  const markers: string[] = [];
  return String(value ?? '')
    .replace(REDACTION_MARKER, (marker) => {
      markers.push(marker);
      return `\u0000${markers.length - 1}\u0000`;
    })
    // A line break immediately before a bracketed fragment is part of the
    // Markdown delimiter, not a word separator (e.g. "`run`-1\n[link]").
    .replace(/\r?\n(?=\[)/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[`*_[\]<>]/g, '')
    .trim()
    .replace(MARKER_PLACEHOLDER, (_, index: string) => markers[Number(index)] ?? '');
}
