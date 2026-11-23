/** Deterministic query and URL-state serialization for shareable links (#075). */

import { parseQuery, type QueryNode } from './parser';
import type { QueryState } from '@/lib/logs/types';

const STATE_PREFIX = 'lq1.';

function quoteValue(value: string): string {
  if (value === '') return '""';
  if (/^[\w./:@\-]+$/.test(value)) return value;
  return `"${value.replace(/(["\\])/g, '\\$1')}"`;
}

function sortNodes(nodes: QueryNode[]): QueryNode[] {
  return [...nodes].sort((a, b) => serializeNode(a).localeCompare(serializeNode(b)));
}

/** Canonical, stable text form of an AST. Identical queries always serialize identically. */
export function serializeNode(node: QueryNode): string {
  switch (node.kind) {
    case 'match_all': return '';
    case 'term': {
      const prefix = node.negated ? '-' : '';
      if (!node.field) return `${prefix}${quoteValue(node.value)}`;
      return `${prefix}${node.field}${node.operator === ':' ? ':' : node.operator}${quoteValue(node.value)}`;
    }
    case 'range': {
      const prefix = node.negated ? '-' : '';
      const open = node.includeFrom ? '[' : '{';
      const close = node.includeTo ? ']' : '}';
      return `${prefix}${node.field}:${open}${quoteValue(node.from)} TO ${quoteValue(node.to)}${close}`;
    }
    case 'not': return `NOT ${node.child.kind === 'term' || node.child.kind === 'range' || node.child.kind === 'match_all' ? serializeNode(node.child) : `(${serializeNode(node.child)})`}`;
    case 'and': return sortNodes(node.children).map(serializeNode).filter(Boolean).join(' AND ');
    case 'or': return `(${sortNodes(node.children).map(serializeNode).filter(Boolean).join(' OR ')})`;
    default: return '';
  }
}

/** Parse then re-serialize, collapsing equivalent but differently written queries. */
export function normalizeQuery(source: string): { query: string; valid: boolean } {
  const parsed = parseQuery(source);
  return { query: serializeNode(parsed.ast), valid: parsed.valid };
}

/**
 * Canonicalize query state object key order so two states with the same logical
 * content produce byte-identical JSON (and therefore identical share links).
 */
export function canonicalStateJson(state: QueryState): string {
  const facets: Record<string, string[]> = {};
  for (const key of Object.keys(state.facets).sort()) {
    facets[key] = [...state.facets[key]].sort();
  }
  const ordered: QueryState = {
    query: normalizeQuery(state.query).query,
    from: state.from,
    to: state.to,
    facets,
    sort: state.sort,
    mode: state.mode,
    histogramRange: state.histogramRange ?? null,
  };
  return JSON.stringify(ordered);
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  const base64 = typeof btoa === 'function'
    ? btoa(binary)
    : Buffer.from(bytes).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = typeof atob === 'function'
    ? atob(padded)
    : Buffer.from(padded, 'base64').toString('binary');
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Encode the complete workbench state into an opaque, deterministic token. */
export function encodeQueryState(state: QueryState): string {
  return `${STATE_PREFIX}${toBase64Url(canonicalStateJson(state))}`;
}

/** Decode a share token. Returns null on malformed or unknown versions. */
export function decodeQueryState(token: string | null | undefined): QueryState | null {
  if (!token || !token.startsWith(STATE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(token.slice(STATE_PREFIX.length))) as QueryState;
    if (typeof parsed.query !== 'string' || typeof parsed.from !== 'number' || typeof parsed.to !== 'number') return null;
    return {
      query: parsed.query,
      from: parsed.from,
      to: parsed.to,
      facets: parsed.facets && typeof parsed.facets === 'object' ? parsed.facets : {},
      sort: parsed.sort === 'asc' ? 'asc' : 'desc',
      mode: parsed.mode === 'live' ? 'live' : 'historical',
      histogramRange: Array.isArray(parsed.histogramRange) && parsed.histogramRange.length === 2
        ? [Number(parsed.histogramRange[0]), Number(parsed.histogramRange[1])]
        : null,
    };
  } catch {
    return null;
  }
}

export function buildShareUrl(baseUrl: string, state: QueryState): string {
  const url = new URL(baseUrl, 'http://localhost');
  url.searchParams.set('state', encodeQueryState(state));
  return url.pathname + url.search + url.hash;
}

export function readStateFromUrl(search: string): QueryState | null {
  return decodeQueryState(new URLSearchParams(search).get('state'));
}

/** Stable fingerprint useful for deduplicating saved queries and history. */
export function queryFingerprint(state: QueryState): string {
  const json = canonicalStateJson(state);
  let hash = 2166136261;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
