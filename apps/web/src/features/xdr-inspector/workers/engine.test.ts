import { describe, it, expect } from 'vitest';
import { xdr } from '@stellar/stellar-sdk/base';
import { Buffer } from 'buffer';
import { createInspectorEngine } from './engine';
import type { Inspection, Selection, Fixture } from '@/lib/xdr/types';
import { MAX_BYTES } from '@/lib/xdr/types';
const load = (value: xdr.ScVal) => ({
  op: 'load' as const,
  slot: 'left' as const,
  rootType: 'ScVal' as const,
  format: 'base64' as const,
  input: value.toXDR('base64'),
});
async function exported(engine: ReturnType<typeof createInspectorEngine>, redact = false) {
  return (await engine.handle({ op: 'export', format: 'json', redact })) as {
    blob: Blob;
    filename: string;
  };
}
describe('worker inspection transactions', () => {
  it('commits valid edits and keeps bytes unchanged after invalid edits', async () => {
    const engine = createInspectorEngine();
    await engine.handle(load(xdr.ScVal.scvU32(7)));
    const before = await (await exported(engine)).blob.text();
    await expect(
      engine.handle({
        op: 'edit',
        path: '/value',
        json: JSON.stringify({ kind: 'scalar', value: -1 }),
      }),
    ).rejects.toThrow();
    expect(await (await exported(engine)).blob.text()).toBe(before);
    await engine.handle({
      op: 'edit',
      path: '/value',
      json: JSON.stringify({ kind: 'scalar', value: 9 }),
    });
    const result = (await engine.handle({ op: 'select', path: '/value' })) as Selection;
    expect(JSON.parse(result.editor!).value).toBe(9);
  });
  it('returns bounded pages and synchronizes raw offsets with tree paths', async () => {
    const engine = createInspectorEngine();
    await engine.handle(
      load(xdr.ScVal.scvVec(Array.from({ length: 250 }, (_, i) => xdr.ScVal.scvU32(i)))),
    );
    const page = (await engine.handle({
      op: 'page',
      query: 'ScVal',
      expanded: [],
      start: 50,
      count: 999,
    })) as { rows: unknown[]; total: number; start: number };
    expect(page.rows).toHaveLength(50);
    expect(page.total).toBe(251);
    expect(page.start).toBe(50);
    const selection = (await engine.handle({ op: 'offset', offset: 16 })) as Selection;
    expect(selection.row.path).toBe('/value/value/items/0/value');
    expect(selection.raw.length).toBeLessThanOrEqual(2048);
  });
  it('supports optional vectors and unique map-entry creation', async () => {
    const engine = createInspectorEngine();
    await engine.handle(load(xdr.ScVal.scvMap(null)));
    await engine.handle({ op: 'option', path: '/value', present: true });
    await engine.handle({ op: 'array', path: '/value/value', action: 'add' });
    await engine.handle({ op: 'array', path: '/value/value', action: 'add' });
    const page = (await engine.handle({ op: 'select', path: '/value/value' })) as Selection;
    expect(JSON.parse(page.editor!).items).toHaveLength(2);
    await engine.handle({ op: 'array', path: '/value/value', action: 'remove', index: 0 });
    expect(
      JSON.parse(
        ((await engine.handle({ op: 'select', path: '/value/value' })) as Selection).editor!,
      ).items,
    ).toHaveLength(1);
  });
  it('enforces attached actual contract-spec argument types atomically', async () => {
    const engine = createInspectorEngine();
    await engine.handle(load(xdr.ScVal.scvVec([xdr.ScVal.scvU32(7)])));
    const spec = xdr.ScSpecEntry.scSpecEntryFunctionV0(
      new xdr.ScSpecFunctionV0({
        doc: '',
        name: 'set_count',
        inputs: [
          new xdr.ScSpecFunctionInputV0({
            doc: 'Count',
            name: 'count',
            type: xdr.ScSpecTypeDef.scSpecTypeU32(),
          }),
        ],
        outputs: [],
      }),
    );
    await engine.handle({
      op: 'schema',
      text: JSON.stringify({ spec: [spec.toXDR('base64')], name: 'set_count' }),
    });
    const before = await (await exported(engine)).blob.text();
    await expect(
      engine.handle({ op: 'variant', path: '/value/value/items/0', value: 'scvBool' }),
    ).rejects.toThrow(/expects ScVal:scvU32/);
    expect(await (await exported(engine)).blob.text()).toBe(before);
  });
  it('exports redacted evidence without embedded original binary or leaf secrets', async () => {
    const engine = createInspectorEngine();
    const secret = 'private-key-for-test';
    const value = xdr.ScVal.scvString(secret);
    await engine.handle(load(value));
    const redacted = await (await exported(engine, true)).blob.text();
    expect(redacted).not.toContain(secret);
    expect(redacted).not.toContain(value.toXDR('base64'));
    expect((JSON.parse(redacted) as Fixture).redacted).toBe(true);
    await expect(engine.handle({ op: 'export', format: 'base64', redact: true })).rejects.toThrow(
      /contain original/,
    );
    await expect(
      engine.handle({
        op: 'load',
        slot: 'right',
        rootType: 'ScVal',
        format: 'json',
        input: redacted,
      }),
    ).rejects.toThrow(/unredacted/);
    const exact = await (await exported(engine)).blob.text();
    await engine.handle({
      op: 'load',
      slot: 'right',
      rootType: 'ScVal',
      format: 'json',
      input: exact,
    });
    expect(await engine.handle({ op: 'diff' })).toMatchObject({
      changes: [],
      raw: { differentBytes: 0 },
    });
  });
  it('retains unknown/malformed XDR bytes in an explicit read-only fallback', async () => {
    const engine = createInspectorEngine();
    const result = (await engine.handle({
      op: 'load',
      slot: 'left',
      rootType: 'ScVal',
      format: 'hex',
      input: '7fffffff',
    })) as { inspection: Inspection; warning: string };
    expect(result.inspection.nodes).toBe(0);
    expect(result.warning).toContain('read-only');
    const raw = (await engine.handle({ op: 'select', path: '' })) as Selection;
    expect(raw.raw).toBe('7fffffff');
    expect(raw.editor).toBeNull();
    await expect(engine.handle({ op: 'edit', path: '', json: '{}' })).rejects.toThrow(
      /supported payload/,
    );
  });
  it('handles an exact 5 MiB wire payload with bounded UI responses', async () => {
    const engine = createInspectorEngine();
    const value = xdr.ScVal.scvBytes(Buffer.alloc(MAX_BYTES - 8, 65));
    const result = (await engine.handle(load(value))) as {
      inspection: Inspection;
      selection: Selection;
    };
    expect(result.inspection.bytes).toBe(MAX_BYTES);
    expect(result.selection.editor).toBeNull();
    expect(result.selection.raw.length).toBeLessThanOrEqual(2048);
    expect(result.inspection.nodes).toBe(2);
    const selection = (await engine.handle({ op: 'offset', offset: MAX_BYTES - 1 })) as Selection;
    expect(selection.row.path).toBe('/value');
  }, 30000);
});

it('attaches struct ABI fields and rejects renaming required map keys', async () => {
  const engine = createInspectorEngine();
  await engine.handle(
    load(
      xdr.ScVal.scvMap([
        new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol('count'), val: xdr.ScVal.scvU32(7) }),
      ]),
    ),
  );
  const spec = xdr.ScSpecEntry.scSpecEntryUdtStructV0(
    new xdr.ScSpecUdtStructV0({
      doc: '',
      lib: '',
      name: 'Counter',
      fields: [
        new xdr.ScSpecUdtStructFieldV0({
          doc: 'Counter amount',
          name: 'count',
          type: xdr.ScSpecTypeDef.scSpecTypeU32(),
        }),
      ],
    }),
  );
  await engine.handle({
    op: 'schema',
    text: JSON.stringify({ spec: [spec.toXDR('base64')], name: 'Counter' }),
  });
  const before = await (await exported(engine)).blob.text();
  await expect(
    engine.handle({
      op: 'edit',
      path: '/value/value/items/0/fields/key/value',
      json: JSON.stringify({ kind: 'text', value: 'other' }),
    }),
  ).rejects.toThrow(/expected struct key/);
  expect(await (await exported(engine)).blob.text()).toBe(before);
});
