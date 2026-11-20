/**
 * Bidirectional codec for serializing filter ASTs to/from URL query params (#2194).
 *
 * The AST is JSON-serialized, compressed with the inline base64url compressor,
 * and stored as the `f` query parameter. This keeps shareable URLs compact
 * while remaining bookmarkable.
 */

import type { FilterAST, FilterNode } from '../ast/FilterAST';
import { createEmptyAST, createCondition, createGroup, generateNodeId, isCondition, isGroup } from '../ast/FilterAST';
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from './compression';

export const URL_LENGTH_LIMIT = 2000;
const CODEC_VERSION = 1;
const PARAM_NAME = 'f';

interface SerializedNode {
  id: string;
  type: 'condition' | 'group';
  field?: string;
  operator?: string;
  value?: string | number | boolean | string[];
  groupType?: 'and' | 'or';
  children?: SerializedNode[];
}

function serializeNode(node: FilterNode): SerializedNode {
  if (isCondition(node)) {
    return { id: node.id, type: 'condition', field: node.field, operator: node.operator, value: node.value };
  }
  return {
    id: node.id,
    type: 'group',
    groupType: node.groupType,
    children: node.children.map(serializeNode),
  };
}

function deserializeNode(data: SerializedNode): FilterNode {
  if (data.type === 'condition') {
    return {
      id: data.id ?? generateNodeId(),
      type: 'condition',
      field: data.field ?? '',
      operator: (data.operator as any) ?? 'eq',
      value: data.value ?? '',
    };
  }
  return {
    id: data.id ?? generateNodeId(),
    type: 'group',
    groupType: data.groupType ?? 'and',
    children: (data.children ?? []).map(deserializeNode),
  };
}

/**
 * Encode a filter AST to a compressed URL-safe string.
 */
export function encodeFilterAST(ast: FilterAST): string {
  const json = JSON.stringify({ v: CODEC_VERSION, ast: serializeNode(ast) });
  return compressToEncodedURIComponent(json);
}

/**
 * Decode a compressed string back to a filter AST.
 */
export function decodeFilterAST(encoded: string): FilterAST | null {
  if (!encoded) return null;
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    const parsed = JSON.parse(json) as { v?: number; ast?: SerializedNode };
    if (!parsed || parsed.v !== CODEC_VERSION || !parsed.ast) return null;
    return deserializeNode(parsed.ast) as FilterAST;
  } catch {
    return null;
  }
}

/**
 * Build a shareable URL with the filter AST encoded as a query parameter.
 */
export function buildShareableURL(baseURL: string, ast: FilterAST): string {
  const encoded = encodeFilterAST(ast);
  const separator = baseURL.includes('?') ? '&' : '?';
  return `${baseURL}${separator}${PARAM_NAME}=${encoded}`;
}

/**
 * Extract a filter AST from a URL string (full URL or just query string).
 */
export function extractFilterASTFromURL(url: string): FilterAST | null {
  try {
    const u = new URL(url, 'http://localhost');
    const encoded = u.searchParams.get(PARAM_NAME);
    if (!encoded) return null;
    return decodeFilterAST(encoded);
  } catch {
    return null;
  }
}

/**
 * Check if a URL is within the length limit for safe sharing.
 */
export function isURLWithinLimit(url: string): boolean {
  return url.length <= URL_LENGTH_LIMIT;
}
