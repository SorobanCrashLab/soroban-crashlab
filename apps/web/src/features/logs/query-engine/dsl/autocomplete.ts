/** Context-aware completions and editor decorations for the log query DSL (#075). */

import {
  BOOLEAN_KEYWORDS,
  FIELD_OPERATORS,
  LOG_FIELDS,
  QUERY_EXAMPLES,
  tokenizeQuery,
  type TokenKind,
} from './parser';
import type { FacetResult } from '@/lib/logs/types';

export type CompletionKind = 'field' | 'operator' | 'value' | 'keyword' | 'example';

export interface CompletionItem {
  label: string;
  insertText: string;
  kind: CompletionKind;
  detail?: string;
}

export interface CompletionContext {
  source: string;
  cursor: number;
  facets?: FacetResult[];
  recentValues?: Record<string, string[]>;
  limit?: number;
}

export interface CompletionResult {
  items: CompletionItem[];
  replaceRange: { start: number; end: number };
  activeField: string | null;
}

export interface QueryHighlight {
  start: number;
  end: number;
  kind: TokenKind;
}

const FIELD_DETAILS: Record<string, string> = {
  level: 'Severity: debug, info, warn, error',
  source: 'Emitting component, for example fuzz-worker or rpc',
  contract: 'Contract identifier associated with the event',
  run_id: 'Fuzzing run that produced the event',
  campaign_id: 'Campaign that owns the run',
  trace_id: 'Distributed trace identifier',
  span_id: 'Span within a trace',
  error_code: 'Stable failure classification code',
  incident_id: 'Linked incident record',
  artifact_id: 'Linked artifact record',
  message: 'Free-form log message',
  timestamp: 'Event time (epoch ms or ISO-8601)',
};

export function fieldDetail(field: string): string {
  return FIELD_DETAILS[field.toLowerCase()] ?? 'Structured attribute field';
}

function valueSuggestions(field: string, context: CompletionContext): CompletionItem[] {
  const normalized = field.toLowerCase();
  const facet = context.facets?.find((item) => item.field.toLowerCase() === normalized);
  const recent = context.recentValues?.[normalized] ?? [];
  const values = new Map<string, number>();
  for (const value of recent) values.set(value, (values.get(value) ?? 0) + 1);
  for (const item of facet?.values ?? []) values.set(item.value, item.count);
  return [...values.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({
      label: value,
      insertText: value,
      kind: 'value' as const,
      detail: count > 1 ? `${count} matches` : undefined,
    }));
}

/** Completions for the token under the cursor. */
export function getCompletions(context: CompletionContext): CompletionResult {
  const { source, cursor } = context;
  const limit = context.limit ?? 24;
  const start = Math.max(0, source.lastIndexOf(' ', cursor - 1) + 1);
  const token = source.slice(start, cursor);
  const previousText = source.slice(0, start).trimEnd();
  const previousToken = previousText.split(/\s+/).filter(Boolean).at(-1) ?? '';

  // Immediately after `field:` – offer operators or values.
  if (/^[A-Za-z_][\w.]*:?$/.test(token) && previousToken.endsWith(':')) {
    const field = previousToken.slice(0, -1);
    const items: CompletionItem[] = [
      ...valueSuggestions(field, context),
      ...FIELD_OPERATORS.filter((operator) => operator !== ':').map((operator) => ({
        label: operator,
        insertText: operator,
        kind: 'operator' as const,
        detail: 'Comparison operator',
      })),
    ];
    return { items: items.slice(0, limit), replaceRange: { start: cursor, end: cursor }, activeField: field };
  }

  // Typing `field:partial`.
  const fieldValueMatch = /^([A-Za-z_][\w.]*)([:=!~<>]+)(.*)$/.exec(token);
  if (fieldValueMatch) {
    const [, field, operator, partial] = fieldValueMatch;
    if (operator === ':' || operator === '=') {
      const items = valueSuggestions(field, context).filter((item) =>
        item.label.toLowerCase().includes(partial.toLowerCase()),
      );
      const withWildcard: CompletionItem[] = partial
        ? [{ label: `${partial}*`, insertText: `${partial}*`, kind: 'value', detail: 'Wildcard match' }]
        : [];
      return {
        items: [...items, ...withWildcard].slice(0, limit),
        replaceRange: { start: start + field.length + operator.length, end: cursor },
        activeField: field,
      };
    }
  }

  // Typing a bare field name.
  if (/^[A-Za-z_][\w.]*$/.test(token)) {
    const fields: CompletionItem[] = LOG_FIELDS
      .filter((field) => field.startsWith(token.toLowerCase()))
      .map((field) => ({ label: field, insertText: `${field}:`, kind: 'field', detail: fieldDetail(field) }));
    const keywords: CompletionItem[] = BOOLEAN_KEYWORDS
      .filter((keyword) => keyword.toLowerCase().startsWith(token.toLowerCase()))
      .map((keyword) => ({ label: keyword, insertText: `${keyword} `, kind: 'keyword', detail: 'Boolean operator' }));
    const items = [...fields, ...keywords];
    if (!token) {
      items.push(...QUERY_EXAMPLES.map((example) => ({
        label: example.label,
        insertText: example.query,
        kind: 'example' as const,
        detail: example.query,
      })));
    }
    return { items: items.slice(0, limit), replaceRange: { start, end: cursor }, activeField: null };
  }

  return { items: [], replaceRange: { start: cursor, end: cursor }, activeField: null };
}

/** Token spans for syntax highlighting in the query editor overlay. */
export function getQueryHighlights(source: string): QueryHighlight[] {
  return tokenizeQuery(source).map((token) => ({
    start: token.span.start,
    end: token.span.end,
    kind: token.kind,
  }));
}

/** Apply a completion item to a query string at the reported replace range. */
export function applyCompletion(
  source: string,
  range: { start: number; end: number },
  insertText: string,
): { source: string; cursor: number } {
  const next = `${source.slice(0, range.start)}${insertText}${source.slice(range.end)}`;
  return { source: next, cursor: range.start + insertText.length };
}
