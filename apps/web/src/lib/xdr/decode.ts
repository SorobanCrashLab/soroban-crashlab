import { codecForRoot } from './sdk';
import { Buffer } from 'buffer';
import {
  MAX_BYTES,
  MAX_DEPTH,
  MAX_NODES,
  ROOT_TYPES,
  type RootType,
  type TreeRow,
  type XdrNode,
  type InputFormat,
} from './types';

/** The visitor is confined to the pinned official SDK's public schemas. Payloads
 * never choose constructors, property accessors, modules, or executable code. */
export interface Codec {
  name?: string;
  structName?: string;
  unionName?: string;
  enumName?: string;
  create?: (...values: unknown[]) => unknown;
  fields?: [string, Codec][];
  switchOn?: Codec;
  childType?: Codec;
  arms?: Record<string, Codec>;
  readString?: unknown;
  fixedLength?: number;
  maxLength?: number;
  fromName?: (name: string) => unknown;
  fromValue?: (value: number) => unknown;
  fromString?: (value: string) => unknown;
  values?: () => { name: string; value: number }[];
  armForSwitch?: (value: unknown) => unknown;
  armTypeForArm?: (arm: unknown) => Codec;
  fromXDR: (bytes: Buffer, format?: 'raw') => unknown;
  toXDR: (value: unknown) => Buffer;
  isValid?: (value: unknown) => boolean;
}
export interface IndexedNode {
  row: TreeRow;
  node: XdrNode;
  codec: Codec;
}
export interface Decoded {
  rootType: RootType;
  document: XdrNode;
  bytes: Buffer;
  index: Map<string, IndexedNode>;
  canonical: boolean;
}
export function rootCodec(name: string): Codec {
  if (!(ROOT_TYPES as readonly string[]).includes(name))
    throw new Error('Unsupported XDR root type');
  return codecForRoot(name);
}
export function typeName(type: Codec): string {
  return type.structName ?? type.unionName ?? type.enumName ?? type.name ?? 'Unknown';
}
export function pointer(parent: string, key: string | number): string {
  return `${parent}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;
}
export function inputBytes(input: string, format: Exclude<InputFormat, 'json'>): Buffer {
  // Check the encoded size before allocation or whitespace normalization.
  if (input.length > MAX_BYTES * 3)
    throw new Error('Encoded input exceeds the 5 MiB payload limit');
  const text = input.replace(/\s/g, '');
  if (format === 'hex' && (text.length % 2 !== 0 || /[^a-fA-F0-9]/.test(text))) {
    throw new Error('Hex must contain complete hexadecimal byte pairs');
  }
  if (format === 'base64') {
    const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
    if (text.length % 4 !== 0 || /[^A-Za-z0-9+/]/.test(text.slice(0, text.length - padding))) {
      throw new Error('Invalid padded base64');
    }
  }
  const bytes = Buffer.from(text, format);
  if (bytes.length > MAX_BYTES) throw new Error('Payload exceeds 5 MiB');
  if (format === 'base64' && bytes.toString('base64') !== text)
    throw new Error('Non-canonical base64');
  return bytes;
}
export function preview(node: XdrNode): string {
  switch (node.kind) {
    case 'struct':
      return `${Object.keys(node.fields).length} fields`;
    case 'union':
      return String(node.switch);
    case 'array':
      return `${node.items.length} items`;
    case 'option':
      return node.value === null ? 'none' : 'some';
    case 'bytes':
      return `${node.value.length / 2} bytes: ${node.value.slice(0, 64)}${node.value.length > 64 ? '...' : ''}`;
    default:
      return String(node.value).slice(0, 160);
  }
}
export function childEntries(node: XdrNode): [string, XdrNode][] {
  if (node.kind === 'struct')
    return Object.entries(node.fields).map(([key, value]) => [
      `fields/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`,
      value,
    ]);
  if (node.kind === 'array') return node.items.map((value, i) => [`items/${i}`, value]);
  if (node.kind === 'union' || (node.kind === 'option' && node.value !== null))
    return [['value', node.value as XdrNode]];
  return [];
}
/** Count and bound the wire layout before the SDK allocates recursive objects.
 * A small hostile vector can otherwise allocate far more objects than its bytes. */
function preflight(bytes: Buffer, root: Codec): void {
  let offset = 0;
  let nodes = 0;
  function take(size: number): number {
    if (!Number.isSafeInteger(size) || size < 0 || size > bytes.length - offset) {
      throw new Error('Truncated or oversized XDR field');
    }
    const start = offset;
    offset += size;
    return start;
  }
  const uint = () => bytes.readUInt32BE(take(4));
  function visit(type: Codec, depth: number): void {
    if (++nodes > MAX_NODES) throw new Error(`Tree exceeds ${MAX_NODES} nodes`);
    if (depth > MAX_DEPTH) throw new Error(`Nesting exceeds ${MAX_DEPTH}`);
    if (type.fields) {
      for (const [, child] of type.fields) visit(child, depth + 1);
      return;
    }
    if (type.switchOn) {
      const start = take(4);
      const switchType = type.switchOn;
      const raw =
        typeName(switchType) === 'UnsignedInt'
          ? bytes.readUInt32BE(start)
          : bytes.readInt32BE(start);
      const tag = switchType.fromValue
        ? switchType.fromValue(raw)
        : typeName(switchType) === 'Bool'
          ? raw === 1
          : raw;
      if (!switchType.isValid?.(tag)) throw new Error('Invalid union discriminator');
      visit(type.armTypeForArm!(type.armForSwitch!(tag)), depth + 1);
      return;
    }
    const name = typeName(type);
    if (type.enumName) {
      type.fromValue!(bytes.readInt32BE(take(4)));
      return;
    }
    if (type.childType && name === 'Option') {
      const present = uint();
      if (present > 1) throw new Error('Invalid XDR optional presence flag');
      if (present) visit(type.childType, depth + 1);
      return;
    }
    if (type.childType) {
      const length = type.fixedLength ?? uint();
      if (length > MAX_NODES - nodes || (type.maxLength !== undefined && length > type.maxLength))
        throw new Error('Array exceeds node/schema limits');
      for (let i = 0; i < length; i++) visit(type.childType, depth + 1);
      return;
    }
    if (name === 'String' || name === 'Opaque' || name === 'VarOpaque') {
      const length = name === 'Opaque' ? type.fixedLength! : uint();
      if (type.maxLength !== undefined && length > type.maxLength)
        throw new Error('Byte length violates XDR schema');
      take(Math.ceil(length / 4) * 4);
      return;
    }
    if (name === 'Bool') {
      if (uint() > 1) throw new Error('Invalid XDR boolean');
      return;
    }
    take(name === 'Void' ? 0 : name === 'Hyper' || name === 'UnsignedHyper' ? 8 : 4);
  }
  visit(root, 0);
  if (offset !== bytes.length) throw new Error('Trailing bytes after XDR root');
}

export function decode(input: Uint8Array, rootType: RootType): Decoded {
  const bytes = Buffer.from(input);
  if (!bytes.length) throw new Error('Supply an XDR payload');
  if (bytes.length > MAX_BYTES) throw new Error('Payload exceeds 5 MiB');
  const codec = rootCodec(rootType);
  preflight(bytes, codec);
  const value = codec.fromXDR(bytes);
  const canonicalBytes = codec.toXDR(value);
  const index = new Map<string, IndexedNode>();
  let cursor = 0;
  function visit(type: Codec, item: unknown, path: string, depth: number, label: string): XdrNode {
    if (depth > MAX_DEPTH) throw new Error(`Nesting exceeds ${MAX_DEPTH} at ${path || '/'}`);
    if (index.size >= MAX_NODES) throw new Error(`Tree exceeds ${MAX_NODES} nodes`);
    const start = cursor;
    const row: TreeRow = {
      path,
      label,
      type: typeName(type),
      preview: '',
      depth,
      start,
      end: start,
      children: 0,
    };
    // Reserve before descending so limits apply to containers as well as leaves.
    const entry = { row, node: null as unknown as XdrNode, codec: type };
    index.set(path, entry);
    const name = typeName(type);
    let node: XdrNode;
    if (type.fields) {
      const attrs = (item as { _attributes: Record<string, unknown> })._attributes;
      const fields: Record<string, XdrNode> = Object.create(null);
      for (const [key, fieldType] of type.fields)
        fields[key] = visit(
          fieldType,
          attrs[key],
          pointer(pointer(path, 'fields'), key),
          depth + 1,
          key,
        );
      node = { kind: 'struct', fields };
    } else if (type.switchOn) {
      const union = item as {
        switch(): { name: string } | number;
        value(): unknown;
        armType(): Codec;
      };
      const discriminator = union.switch();
      cursor += 4;
      const switchValue = typeof discriminator === 'number' ? discriminator : discriminator.name;
      node = {
        kind: 'union',
        switch: switchValue,
        value: visit(
          union.armType(),
          union.value(),
          pointer(path, 'value'),
          depth + 1,
          String(switchValue),
        ),
      };
    } else if (type.enumName) {
      cursor += 4;
      node = { kind: 'enum', value: (item as { name: string }).name };
    } else if (type.childType && name === 'Option') {
      cursor += 4;
      node = {
        kind: 'option',
        value:
          item == null
            ? null
            : visit(type.childType, item, pointer(path, 'value'), depth + 1, 'some'),
      };
    } else if (type.childType && Array.isArray(item)) {
      if (name === 'VarArray') cursor += 4;
      node = {
        kind: 'array',
        items: item.map((child, i) =>
          visit(type.childType!, child, pointer(pointer(path, 'items'), i), depth + 1, String(i)),
        ),
      };
    } else if (name === 'Hyper' || name === 'UnsignedHyper') {
      cursor += 8;
      node = { kind: 'integer', value: String(item) };
    } else if (name === 'String' || name === 'Opaque' || name === 'VarOpaque') {
      const data = Buffer.from(item as Uint8Array);
      cursor += (name === 'Opaque' ? 0 : 4) + Math.ceil(data.length / 4) * 4;
      let text: string | null = null;
      if (name === 'String') {
        try {
          text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data);
        } catch {
          /* Preserve invalid UTF-8 as bytes. */
        }
      }
      node =
        text === null
          ? { kind: 'bytes', value: data.toString('hex') }
          : { kind: 'text', value: text };
    } else {
      cursor += name === 'Void' ? 0 : name === 'Double' ? 8 : 4;
      if (
        item !== undefined &&
        item !== null &&
        typeof item !== 'number' &&
        typeof item !== 'boolean'
      )
        throw new Error(`Unsupported SDK primitive: ${name}`);
      node = { kind: 'scalar', value: item == null ? null : (item as number | boolean) };
    }
    entry.node = node;
    row.end = cursor;
    row.children = childEntries(node).length;
    row.preview = preview(node);
    return node;
  }
  const document = visit(codec, value, '', 0, rootType);
  if (cursor !== bytes.length) throw new Error('SDK layout differs from the inspected byte layout');
  return { rootType, document, bytes, index, canonical: bytes.equals(canonicalBytes) };
}
