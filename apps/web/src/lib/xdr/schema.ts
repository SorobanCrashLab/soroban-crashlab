import { decode, inputBytes, pointer, type Decoded } from './decode';
import type { InspectorSchema, SchemaField, XdrNode } from './types';
const SCALARS: Record<string, string> = {
  Bool: 'Bool',
  Void: 'Void',
  Error: 'Error',
  U32: 'U32',
  I32: 'I32',
  U64: 'U64',
  I64: 'I64',
  Timepoint: 'Timepoint',
  Duration: 'Duration',
  U128: 'U128',
  I128: 'I128',
  U256: 'U256',
  I256: 'I256',
  Bytes: 'Bytes',
  String: 'String',
  Symbol: 'Symbol',
  Address: 'Address',
  Vec: 'Vec',
  Map: 'Map',
  Tuple: 'Vec',
};
function struct(node: XdrNode): Record<string, XdrNode> {
  if (node.kind !== 'struct') schemaError('expected a contract-spec struct');
  return node.fields;
}
function stringValue(node: XdrNode): string {
  if (node.kind !== 'text') schemaError('contract-spec names/docs must be UTF-8');
  return node.value;
}
function array(node: XdrNode): XdrNode[] {
  if (node.kind !== 'array') schemaError('expected contract-spec fields');
  return node.items;
}
function expected(type: XdrNode): string | undefined {
  if (type.kind !== 'union') return undefined;
  const suffix = String(type.switch).replace('scSpecType', '');
  return SCALARS[suffix] ? `ScVal:scv${SCALARS[suffix]}` : undefined;
}
function schemaError(message: string): never {
  throw new Error(`Schema: ${message}`);
}
/** Accept path annotations or actual base64 ScSpecEntry records from an ABI.
 * Unknown UDT/extension semantics retain the generic, lossless XDR view. */
export function parseSchema(text: string, decoded: Decoded): InspectorSchema {
  if (text.length > 256 * 1024) schemaError('metadata exceeds 256 KiB');
  const raw: unknown = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) schemaError('expected an object');
  const obj = raw as Record<string, unknown>;
  if (obj.version === 1 && Array.isArray(obj.fields)) {
    if (obj.fields.length > 1000) schemaError('too many path annotations');
    const fields: SchemaField[] = obj.fields.map((field: unknown) => {
      if (!field || typeof field !== 'object') schemaError('invalid field');
      const f = field as Record<string, unknown>;
      if (
        typeof f.path !== 'string' ||
        f.path.length > 2048 ||
        typeof f.label !== 'string' ||
        f.label.length > 160
      )
        schemaError('invalid path or label');
      if (
        f.expectedType !== undefined &&
        (typeof f.expectedType !== 'string' || f.expectedType.length > 100)
      )
        schemaError('invalid expectedType');
      if (
        f.description !== undefined &&
        (typeof f.description !== 'string' || f.description.length > 1024)
      )
        schemaError('invalid description');
      return {
        path: f.path,
        label: f.label,
        expectedType: f.expectedType as string | undefined,
        description: f.description as string | undefined,
      };
    });
    return { version: 1, fields };
  }
  if (!Array.isArray(obj.spec) || obj.spec.length > 256 || typeof obj.name !== 'string')
    schemaError(
      'use version:1 path metadata, or {spec:[base64 ScSpecEntry...],name:"function or struct"}',
    );
  const entries = obj.spec.map((value) => {
    if (typeof value !== 'string' || value.length > 65536) schemaError('invalid spec entry');
    // The same bounded/depth-checked adapter is used for metadata as payloads.
    const bytes = inputBytes(value, 'base64');
    return decode(bytes, 'ScSpecEntry').document;
  });
  const fields: SchemaField[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'union') continue;
    if (entry.switch === 'scSpecEntryFunctionV0') {
      const fn = struct(entry.value);
      if (stringValue(fn.name) !== obj.name) continue;
      array(fn.inputs).forEach((node, i) => {
        const input = struct(node);
        fields.push({
          path: `/value/value/items/${i}`,
          label: stringValue(input.name),
          description: stringValue(input.doc),
          expectedType: expected(input.type),
        });
      });
      return {
        version: 1,
        fields,
        collection: { path: '/value/value', length: array(fn.inputs).length },
      };
    }
    if (entry.switch === 'scSpecEntryUdtStructV0') {
      const specStruct = struct(entry.value);
      if (stringValue(specStruct.name) !== obj.name) continue;
      const root = decoded.document;
      const payloadItems =
        root.kind === 'union' && root.value.kind === 'option' && root.value.value?.kind === 'array'
          ? root.value.value
          : null;
      if (!payloadItems) schemaError('struct annotations require a ScVal map or tuple');
      for (const node of array(specStruct.fields)) {
        const field = struct(node);
        const name = stringValue(field.name);
        let path: string | undefined;
        if (root.kind === 'union' && root.switch === 'scvMap') {
          const i = payloadItems.items.findIndex(
            (item) => item.kind === 'struct' && symbol(item.fields.key) === name,
          );
          if (i >= 0) path = `/value/value/items/${i}/fields/val`;
        } else if (/^\d+$/.test(name)) path = `/value/value/items/${Number(name)}`;
        if (!path) schemaError(`missing struct field ${name}`);
        fields.push({
          path,
          label: name,
          description: stringValue(field.doc),
          expectedType: expected(field.type),
        });
        if (root.kind === 'union' && root.switch === 'scvMap')
          fields.push({
            path: path.replace(/\/fields\/val$/, '/fields/key'),
            label: `${name} (key)`,
            symbol: name,
          });
      }
      return {
        version: 1,
        fields,
        collection: { path: '/value/value', length: array(specStruct.fields).length },
      };
    }
  }
  schemaError(
    'requested function/struct is not present; keep the generic XDR view for unsupported metadata',
  );
}
function symbol(node: XdrNode): string | undefined {
  return node.kind === 'union' && node.switch === 'scvSymbol' && node.value.kind === 'text'
    ? node.value.value
    : undefined;
}
export function validateSchema(decoded: Decoded, schema: InspectorSchema | null): void {
  if (schema?.collection) {
    const node = decoded.index.get(schema.collection.path)?.node;
    if (node?.kind !== 'array' || node.items.length !== schema.collection.length)
      schemaError(`expected ${schema.collection.length} contract fields/arguments`);
  }
  for (const field of schema?.fields ?? []) {
    const item = decoded.index.get(field.path);
    if (!item) schemaError(`missing field ${field.label} (${field.path})`);
    if (field.symbol !== undefined && symbol(item.node) !== field.symbol)
      schemaError(`expected struct key ${field.symbol}`);
    if (field.expectedType?.startsWith('ScVal:')) {
      if (item.node.kind !== 'union' || item.node.switch !== field.expectedType.slice(6))
        schemaError(`${field.label} expects ${field.expectedType}`);
    } else if (field.expectedType && item.row.type !== field.expectedType)
      schemaError(`${field.label} expects ${field.expectedType}, got ${item.row.type}`);
  }
}
export function pathAncestors(path: string): string[] {
  const result = [''];
  const parts = path.split('/').slice(1);
  let current = '';
  for (let i = 0; i < parts.length - 1; i++) {
    current = pointer(current, parts[i].replace(/~1/g, '/').replace(/~0/g, '~'));
    result.push(current);
  }
  return result;
}
