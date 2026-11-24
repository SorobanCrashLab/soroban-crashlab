import type { InputFormat, RootType, XdrNode } from '@/lib/xdr/types';
export type Slot = 'left' | 'right';
export type InspectorCommand =
  | { op: 'load'; slot: Slot; rootType: RootType; format: InputFormat; input: string | File }
  | { op: 'page'; query: string; expanded: string[]; start: number; count: number }
  | { op: 'select'; path: string }
  | { op: 'offset'; offset: number }
  | { op: 'edit'; path: string; json: string }
  | { op: 'variant'; path: string; value: string | number }
  | { op: 'array'; path: string; action: 'add' | 'remove'; index?: number }
  | { op: 'option'; path: string; present: boolean }
  | { op: 'schema'; text: string }
  | { op: 'diff' }
  | { op: 'export'; format: 'json' | 'hex' | 'base64' | 'fixture'; redact: boolean };
export interface InspectorRequest {
  id: number;
  command: InspectorCommand;
}
export interface InspectorResponse {
  id: number;
  ok: boolean;
  value?: unknown;
  error?: string;
}
export function replaceNode(document: XdrNode, path: string, node: XdrNode): XdrNode {
  if (path === '') return node;
  if (!path.startsWith('/') || path.length > 2048) throw new Error('Invalid node path');
  const copy = structuredClone(document);
  const keys = path
    .slice(1)
    .split('/')
    .map((key) => key.replace(/~1/g, '/').replace(/~0/g, '~'));
  let parent: unknown = copy;
  for (const key of keys.slice(0, -1)) {
    if (
      !parent ||
      typeof parent !== 'object' ||
      ['__proto__', 'prototype', 'constructor'].includes(key) ||
      !Object.hasOwn(parent, key)
    )
      throw new Error('Node path does not exist');
    parent = (parent as Record<string, unknown>)[key];
  }
  const key = keys[keys.length - 1];
  if (
    !parent ||
    typeof parent !== 'object' ||
    ['__proto__', 'prototype', 'constructor'].includes(key) ||
    !Object.hasOwn(parent, key)
  )
    throw new Error('Node path does not exist');
  (parent as Record<string, unknown>)[key] = node;
  return copy;
}
