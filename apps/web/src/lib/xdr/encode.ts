import { Buffer } from 'buffer';
import { decode, rootCodec, typeName, type Codec, type Decoded } from './decode';
import { MAX_BYTES, MAX_DEPTH, MAX_NODES, type RootType, type XdrNode } from './types';

function construct(type: Codec, ...args: unknown[]): unknown {
  if (!type.create) throw new Error('Unsupported codec constructor');
  return type.create(...args);
}
function fail(path: string, message: string): never {
  throw new Error(`${path || '/'}: ${message}`);
}
/** Validate against SDK metadata, not type names supplied by imported JSON. */
export function encodeDocument(document: XdrNode, rootType: RootType): Decoded {
  let count = 0;
  let approximateBytes = 0;
  function visit(type: Codec, raw: unknown, path: string, depth: number): unknown {
    if (++count > MAX_NODES || depth > MAX_DEPTH) fail(path, 'Document exceeds node/depth limits');
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
      fail(path, 'Expected a typed node');
    const node = raw as XdrNode;
    const name = typeName(type);
    const wanted = (kind: XdrNode['kind']) => {
      if (node.kind !== kind) fail(path, `Expected ${kind} for ${name}`);
    };
    if (type.fields) {
      wanted('struct');
      const fields = (node as Extract<XdrNode, { kind: 'struct' }>).fields;
      if (!fields || typeof fields !== 'object' || Array.isArray(fields))
        fail(path, 'Expected fields');
      const names = type.fields.map(([key]) => key);
      if (
        Object.keys(fields).length !== names.length ||
        names.some((key) => !Object.hasOwn(fields, key))
      )
        fail(path, 'Struct fields must match the XDR schema exactly');
      const values: Record<string, unknown> = Object.create(null);
      for (const [key, childType] of type.fields)
        values[key] = visit(childType, fields[key], `${path}/fields/${key}`, depth + 1);
      return construct(type, values);
    }
    if (type.switchOn) {
      wanted('union');
      const union = node as Extract<XdrNode, { kind: 'union' }>;
      const tag =
        typeof union.switch === 'string' && type.switchOn.fromName
          ? type.switchOn.fromName(union.switch)
          : union.switch;
      if (!type.switchOn.isValid?.(tag)) fail(path, 'Invalid union discriminator');
      const arm = type.armForSwitch!(tag);
      return construct(
        type,
        tag,
        visit(type.armTypeForArm!(arm), union.value, `${path}/value`, depth + 1),
      );
    }
    if (type.enumName) {
      wanted('enum');
      return type.fromName!((node as Extract<XdrNode, { kind: 'enum' }>).value);
    }
    if (type.childType && name === 'Option') {
      wanted('option');
      const child = (node as Extract<XdrNode, { kind: 'option' }>).value;
      return child === null ? undefined : visit(type.childType, child, `${path}/value`, depth + 1);
    }
    if (type.childType) {
      wanted('array');
      const items = (node as Extract<XdrNode, { kind: 'array' }>).items;
      if (!Array.isArray(items) || items.length > MAX_NODES)
        fail(path, 'Invalid or oversized array');
      if (type.fixedLength !== undefined && items.length !== type.fixedLength)
        fail(path, `Expected ${type.fixedLength} items`);
      if (type.maxLength !== undefined && items.length > type.maxLength)
        fail(path, `At most ${type.maxLength} items allowed`);
      const values = items.map((child, i) =>
        visit(type.childType!, child, `${path}/items/${i}`, depth + 1),
      );
      if (type.childType.structName === 'ScMapEntry') {
        const keys = values.map((value) =>
          rootCodec('ScVal')
            .toXDR((value as { key(): unknown }).key())
            .toString('hex'),
        );
        if (new Set(keys).size !== keys.length) fail(path, 'ScMap keys must be unique');
      }
      return values;
    }
    if (name === 'Hyper' || name === 'UnsignedHyper') {
      wanted('integer');
      const text = (node as { value: string }).value;
      if (typeof text !== 'string' || !/^-?(?:0|[1-9][0-9]*)$/.test(text) || text.length > 21)
        fail(path, 'Expected a decimal 64-bit integer string');
      return type.fromString!(text);
    }
    if (name === 'String' || name === 'Opaque' || name === 'VarOpaque') {
      if (node.kind !== 'bytes' && !(node.kind === 'text' && name === 'String'))
        fail(path, 'Expected bytes, or UTF-8 text for an XDR string');
      const text = (node as { value: string }).value;
      if (typeof text !== 'string' || text.length > MAX_BYTES * 2)
        fail(path, 'Invalid or oversized byte value');
      if (node.kind === 'bytes' && (text.length % 2 !== 0 || /[^a-fA-F0-9]/.test(text)))
        fail(path, 'Bytes must be hexadecimal pairs');
      const data = Buffer.from(text, node.kind === 'bytes' ? 'hex' : 'utf8');
      if (
        node.kind === 'text' &&
        new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data) !== text
      )
        fail(path, 'Text contains an unpaired surrogate');
      approximateBytes += data.length;
      if (approximateBytes > MAX_BYTES) fail(path, 'Payload exceeds 5 MiB');
      if (!type.isValid?.(data)) fail(path, 'Byte length violates XDR constraints');
      return data;
    }
    wanted('scalar');
    const value = (node as Extract<XdrNode, { kind: 'scalar' }>).value;
    if (name === 'Void') {
      if (value !== null) fail(path, 'Void must be null');
      return undefined;
    }
    if (
      typeof value === 'number' &&
      (!Number.isFinite(value) || (!['Float', 'Double'].includes(name) && !Number.isInteger(value)))
    )
      fail(path, 'Expected a finite integer');
    if (!type.isValid?.(value)) fail(path, `Invalid ${name} value`);
    return value;
  }
  const type = rootCodec(rootType);
  const value = visit(type, document, '', 0);
  const bytes = type.toXDR(value);
  if (bytes.length > MAX_BYTES) fail('', 'Payload exceeds 5 MiB');
  const decoded = decode(bytes, rootType);
  // Decode-encode-decode verifies the actual SDK serialization, not a preview.
  if (!bytes.equals(type.toXDR(type.fromXDR(bytes)))) fail('', 'Round-trip verification failed');
  return decoded;
}
export function defaultNode(type: Codec, depth = 0): XdrNode {
  if (depth > MAX_DEPTH) throw new Error('Cannot create a recursive default');
  if (type.fields)
    return {
      kind: 'struct',
      fields: Object.fromEntries(
        type.fields.map(([key, child]) => [key, defaultNode(child, depth + 1)]),
      ),
    };
  if (type.switchOn) {
    const tag = type.switchOn.values?.()[0];
    const value = tag ?? 0;
    return {
      kind: 'union',
      switch: tag?.name ?? 0,
      value: defaultNode(type.armTypeForArm!(type.armForSwitch!(value)), depth + 1),
    };
  }
  if (type.enumName) return { kind: 'enum', value: type.values!()[0].name };
  const name = typeName(type);
  if (name === 'Option') return { kind: 'option', value: null };
  if (type.childType)
    return {
      kind: 'array',
      items: Array.from({ length: type.fixedLength ?? 0 }, () =>
        defaultNode(type.childType!, depth + 1),
      ),
    };
  if (name === 'Hyper' || name === 'UnsignedHyper') return { kind: 'integer', value: '0' };
  if (name === 'String') return { kind: 'text', value: '' };
  if (name === 'Opaque' || name === 'VarOpaque')
    return { kind: 'bytes', value: '00'.repeat(type.fixedLength ?? 0) };
  return { kind: 'scalar', value: name === 'Bool' ? false : name === 'Void' ? null : 0 };
}
