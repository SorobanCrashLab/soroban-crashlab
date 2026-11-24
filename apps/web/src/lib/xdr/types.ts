/** Versioned, lossless XDR JSON. Integers wider than 32 bits are decimal strings. */
export type XdrNode =
  | { kind: 'struct'; fields: Record<string, XdrNode> }
  | { kind: 'union'; switch: string | number; value: XdrNode }
  | { kind: 'enum'; value: string }
  | { kind: 'array'; items: XdrNode[] }
  | { kind: 'option'; value: XdrNode | null }
  | { kind: 'integer' | 'bytes' | 'text'; value: string }
  | { kind: 'scalar'; value: number | boolean | null };

export const ROOT_TYPES = [
  'ScVal',
  'LedgerEntry',
  'LedgerKey',
  'ContractEvent',
  'SorobanAuthorizationEntry',
  'HostFunction',
  'SorobanTransactionData',
  'ScSpecEntry',
] as const;
export type RootType = (typeof ROOT_TYPES)[number];
export type InputFormat = 'hex' | 'base64' | 'json';
export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_NODES = 100_000;
export const MAX_DEPTH = 64;
export const MAX_EDITOR_BYTES = 64 * 1024;
export const PAGE_SIZE = 50;
export interface TreeRow {
  path: string;
  label: string;
  type: string;
  preview: string;
  depth: number;
  start: number;
  end: number;
  children: number;
}
export interface Inspection {
  rootType: RootType;
  bytes: number;
  nodes: number;
  canonical: boolean;
  revision: number;
}
export interface Selection {
  row: TreeRow;
  editor: string | null;
  choices: (string | number)[];
  raw: string;
  rawStart: number;
  rawEnd: number;
  textPreview?: string;
}
export interface Fixture {
  version: 1;
  rootType: RootType;
  document: XdrNode;
  redacted: boolean;
}
export interface SchemaField {
  path: string;
  label: string;
  expectedType?: string;
  description?: string;
  symbol?: string;
}
export interface InspectorSchema {
  version: 1;
  fields: SchemaField[];
  collection?: { path: string; length: number };
}
export interface Change {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  before?: string;
  after?: string;
}
