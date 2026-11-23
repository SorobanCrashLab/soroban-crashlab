import { Buffer } from 'buffer';
import { decode, inputBytes, type Decoded } from '@/lib/xdr/decode';
import { defaultNode, encodeDocument } from '@/lib/xdr/encode';
import { structuralDiff, rawDiff } from '@/lib/xdr/diff';
import { parseSchema, validateSchema } from '@/lib/xdr/schema';
import {
  MAX_BYTES,
  MAX_EDITOR_BYTES,
  PAGE_SIZE,
  type Inspection,
  type InspectorSchema,
  type Selection,
  type TreeRow,
  type Fixture,
  type XdrNode,
} from '@/lib/xdr/types';
import { replaceNode, type InspectorCommand } from './protocol';

function redact(node: XdrNode): XdrNode {
  switch (node.kind) {
    case 'struct':
      return {
        kind: 'struct',
        fields: Object.fromEntries(
          Object.entries(node.fields).map(([key, value]) => [key, redact(value)]),
        ),
      };
    case 'array':
      return { kind: 'array', items: node.items.map(redact) };
    case 'union':
      return { ...node, value: redact(node.value) };
    case 'option':
      return { ...node, value: node.value === null ? null : redact(node.value) };
    case 'enum':
      return node; // Wire-schema identifiers, not user-provided strings.
    case 'text':
      return { kind: 'text', value: '[REDACTED]' };
    case 'bytes':
      return { kind: 'bytes', value: '' };
    case 'integer':
      return { kind: 'integer', value: '0' };
    case 'scalar':
      return { kind: 'scalar', value: null };
  }
}
export function createInspectorEngine() {
  let left: Decoded | null = null;
  let right: Decoded | null = null;
  let opaque: Buffer | null = null;
  let revision = 0;
  let schema: InspectorSchema | null = null;
  const required = () => {
    if (!left) throw new Error('Decode a supported payload first');
    return left;
  };
  const info = (): Inspection => {
    const d = required();
    return {
      rootType: d.rootType,
      bytes: d.bytes.length,
      nodes: d.index.size,
      canonical: d.canonical,
      revision,
    };
  };
  function select(path: string, focusOffset?: number): Selection {
    if (!left && opaque) {
      const start = Math.max(0, (focusOffset ?? 0) - 16);
      const end = Math.min(opaque.length, start + 1024);
      return {
        row: {
          path: '',
          label: 'Raw payload',
          type: 'Unknown XDR',
          preview: 'Read-only fallback',
          depth: 0,
          start: 0,
          end: opaque.length,
          children: 0,
        },
        editor: null,
        choices: [],
        raw: opaque.subarray(start, end).toString('hex'),
        rawStart: start,
        rawEnd: end,
      };
    }
    const d = required();
    const item = d.index.get(path);
    if (!item) throw new Error('Node path does not exist in this payload');
    const json = JSON.stringify(item.node, null, 2);
    const start = Math.max(0, (focusOffset ?? item.row.start) - 16);
    const end = Math.min(d.bytes.length, start + 1024);
    const choices = (item.codec.switchOn?.values?.() ?? item.codec.values?.() ?? []).map(
      (value) => value.name,
    );
    return {
      row: item.row,
      editor: Buffer.byteLength(json) > MAX_EDITOR_BYTES ? null : json,
      choices,
      raw: d.bytes.subarray(start, end).toString('hex'),
      rawStart: start,
      rawEnd: end,
    };
  }
  function commit(document: XdrNode) {
    const d = required();
    const next = encodeDocument(document, d.rootType);
    validateSchema(next, schema);
    left = next;
    revision++;
    return info();
  }
  return {
    async handle(command: InspectorCommand): Promise<unknown> {
      switch (command.op) {
        case 'load': {
          const maximum = command.format === 'json' ? 32 * 1024 * 1024 : MAX_BYTES * 3;
          if (typeof command.input !== 'string' && command.input.size > maximum)
            throw new Error('Input file exceeds the encoded size limit');
          const text =
            typeof command.input === 'string' ? command.input : await command.input.text();
          if (text.length > maximum) throw new Error('Input exceeds the encoded size limit');
          let result: Decoded;
          if (command.format === 'json') {
            const raw: unknown = JSON.parse(text);
            if (!raw || typeof raw !== 'object')
              throw new Error('Expected typed XDR JSON or a version 1 fixture');
            if ('version' in raw) {
              const fixture = raw as Fixture;
              if (fixture.version !== 1 || fixture.redacted)
                throw new Error('Only unredacted version 1 fixtures can be re-encoded');
              result = encodeDocument(fixture.document, fixture.rootType);
            } else result = encodeDocument(raw as XdrNode, command.rootType);
          } else {
            const bytes = inputBytes(text, command.format);
            try {
              result = decode(bytes, command.rootType);
            } catch (error) {
              if (command.slot === 'left') {
                left = null;
                opaque = bytes;
                schema = null;
                revision++;
                return {
                  inspection: {
                    rootType: command.rootType,
                    bytes: bytes.length,
                    nodes: 0,
                    canonical: false,
                    revision,
                  },
                  warning: `Decode failed: ${error instanceof Error ? error.message : 'unknown type'}. Original bytes retained read-only.`,
                  selection: select(''),
                };
              }
              throw error;
            }
          }
          if (command.slot === 'right') {
            right = result;
            return {
              rootType: result.rootType,
              bytes: result.bytes.length,
              nodes: result.index.size,
            };
          }
          left = result;
          opaque = null;
          schema = null;
          revision++;
          return { inspection: info(), selection: select('') };
        }
        case 'page': {
          const d = required();
          if (command.query.length > 256 || command.expanded.length > 10000)
            throw new Error('Search or expansion limit exceeded');
          const expanded = new Set(command.expanded);
          const query = command.query.toLowerCase();
          const rows: TreeRow[] = [];
          let hiddenDepth: number | null = null;
          const labels = new Map(schema?.fields.map((field) => [field.path, field.label]));
          for (const { row } of d.index.values()) {
            if (query) {
              if (
                !`${row.path} ${row.label} ${row.type} ${row.preview} ${labels.get(row.path) ?? ''}`
                  .toLowerCase()
                  .includes(query)
              )
                continue;
            } else {
              if (hiddenDepth !== null && row.depth > hiddenDepth) continue;
              hiddenDepth = null;
              if (row.children && !expanded.has(row.path)) hiddenDepth = row.depth;
            }
            rows.push(labels.has(row.path) ? { ...row, label: labels.get(row.path)! } : row);
          }
          const start = Math.max(0, Math.min(rows.length, Math.trunc(command.start) || 0));
          const count = Math.max(1, Math.min(PAGE_SIZE, Math.trunc(command.count) || PAGE_SIZE));
          return { rows: rows.slice(start, start + count), total: rows.length, start, revision };
        }
        case 'select':
          return select(command.path);
        case 'offset': {
          if (
            !Number.isInteger(command.offset) ||
            command.offset < 0 ||
            command.offset >= (left?.bytes.length ?? opaque?.length ?? 0)
          )
            throw new Error('Byte offset is outside this payload');
          if (!left && opaque) return select('', command.offset);
          const d = required();
          let path = '';
          for (const { row } of d.index.values())
            if (
              row.start <= command.offset &&
              row.end > command.offset &&
              row.depth >= (d.index.get(path)?.row.depth ?? 0)
            )
              path = row.path;
          return select(path, command.offset);
        }
        case 'edit': {
          if (Buffer.byteLength(command.json) > MAX_EDITOR_BYTES)
            throw new Error('Edit exceeds 64 KiB; select a smaller subtree');
          const d = required();
          if (!d.index.has(command.path)) throw new Error('Node no longer exists');
          return commit(replaceNode(d.document, command.path, JSON.parse(command.json) as XdrNode));
        }
        case 'variant': {
          const d = required();
          const item = d.index.get(command.path);
          if (!item) throw new Error('Node not found');
          if (item.codec.switchOn) {
            const type = item.codec;
            const tag =
              typeof command.value === 'string'
                ? type.switchOn!.fromName!(command.value)
                : command.value;
            return commit(
              replaceNode(d.document, command.path, {
                kind: 'union',
                switch: command.value,
                value: defaultNode(type.armTypeForArm!(type.armForSwitch!(tag))),
              }),
            );
          }
          if (item.node.kind === 'enum' && typeof command.value === 'string')
            return commit(
              replaceNode(d.document, command.path, { kind: 'enum', value: command.value }),
            );
          throw new Error('Selected node has no variants');
        }
        case 'array': {
          const d = required();
          const item = d.index.get(command.path);
          if (item?.node.kind !== 'array' || !item.codec.childType)
            throw new Error('Select an array node');
          const items = item.node.items.slice();
          if (command.action === 'add') {
            const child = defaultNode(item.codec.childType);
            if (item.codec.childType.structName === 'ScMapEntry' && child.kind === 'struct')
              child.fields.key = {
                kind: 'union',
                switch: 'scvSymbol',
                value: { kind: 'text', value: `key_${items.length}` },
              };
            items.push(child);
          } else {
            const i = command.index ?? items.length - 1;
            if (!Number.isInteger(i) || i < 0 || i >= items.length)
              throw new Error('Choose an existing element index');
            items.splice(i, 1);
          }
          return commit(replaceNode(d.document, command.path, { kind: 'array', items }));
        }
        case 'option': {
          const d = required();
          const item = d.index.get(command.path);
          if (item?.node.kind !== 'option' || !item.codec.childType)
            throw new Error('Select an optional node');
          return commit(
            replaceNode(d.document, command.path, {
              kind: 'option',
              value: command.present ? defaultNode(item.codec.childType) : null,
            }),
          );
        }
        case 'schema': {
          const next = parseSchema(command.text, required());
          validateSchema(required(), next);
          schema = next;
          return next;
        }
        case 'diff': {
          if (!right) throw new Error('Load comparison payload B first');
          const d = required();
          return {
            ...structuralDiff(d.document, right.document),
            raw: rawDiff(d.bytes, right.bytes),
            rootTypesMatch: d.rootType === right.rootType,
          };
        }
        case 'export': {
          if (command.redact && (command.format === 'hex' || command.format === 'base64'))
            throw new Error(
              'Redacted exports are JSON/fixture only; raw encodings contain original values',
            );
          if (!left) {
            if (
              opaque &&
              !command.redact &&
              (command.format === 'hex' || command.format === 'base64')
            )
              return {
                blob: new Blob([opaque.toString(command.format)], { type: 'text/plain' }),
                filename: `xdr-opaque.${command.format}`,
              };
            throw new Error('Decode a supported payload before exporting JSON');
          }
          const fixture: Fixture = {
            version: 1,
            rootType: left.rootType,
            document: command.redact ? redact(left.document) : left.document,
            redacted: command.redact,
          };
          let text: string;
          if (command.format === 'hex' || command.format === 'base64')
            text = encodeDocument(left.document, left.rootType).bytes.toString(command.format);
          else if (command.format === 'fixture')
            text = command.redact
              ? `// Redacted evidence; not executable round-trip data\nexport const xdrFixture = ${JSON.stringify(fixture, null, 2)} as const;\n`
              : `// Exact reproducer fixture: contains all payload values\nimport { xdr } from '@stellar/stellar-sdk/base';\nexport const xdrBase64 = ${JSON.stringify(encodeDocument(left.document, left.rootType).bytes.toString('base64'))};\nexport const payload = xdr.${left.rootType}.fromXDR(xdrBase64, 'base64');\n`;
          else text = JSON.stringify(fixture, null, 2);
          return {
            blob: new Blob([text], {
              type: command.format === 'json' ? 'application/json' : 'text/plain',
            }),
            filename: `xdr-${command.redact ? 'redacted' : 'exact'}.${command.format === 'fixture' ? 'ts' : command.format}`,
          };
        }
      }
    },
  };
}
