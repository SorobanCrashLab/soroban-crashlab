import { describe, it, expect } from 'vitest';
import { Address, nativeToScVal, xdr } from '@stellar/stellar-sdk/base';
import { Buffer } from 'buffer';
import { decode, inputBytes, rootCodec } from './decode';
import { encodeDocument, defaultNode } from './encode';
import { MAX_BYTES, ROOT_TYPES, type XdrNode } from './types';
import { structuralDiff, rawDiff } from './diff';
import { replaceNode } from '@/features/xdr-inspector/workers/protocol';

const values = [
  xdr.ScVal.scvVoid(),
  xdr.ScVal.scvBool(true),
  xdr.ScVal.scvU32(4294967295),
  xdr.ScVal.scvI32(-2147483648),
  xdr.ScVal.scvU64(xdr.Uint64.fromString('18446744073709551615')),
  xdr.ScVal.scvI64(xdr.Int64.fromString('-9223372036854775808')),
  nativeToScVal('340282366920938463463374607431768211455', { type: 'u128' }),
  nativeToScVal('-170141183460469231731687303715884105728', { type: 'i128' }),
  nativeToScVal('115792089237316195423570985008687907853269984665640564039457584007913129639935', {
    type: 'u256',
  }),
  nativeToScVal('-57896044618658097711785492504343953926634992332820282019728792003956564819968', {
    type: 'i256',
  }),
  xdr.ScVal.scvTimepoint(123456789n),
  xdr.ScVal.scvDuration(3600n),
  xdr.ScVal.scvBytes(Buffer.from([0, 255, 1])),
  xdr.ScVal.scvString('hello ??'),
  xdr.ScVal.scvString('\ufeffpreserve BOM'),
  xdr.ScVal.scvString(Buffer.from([255, 254])),
  xdr.ScVal.scvSymbol('transfer'),
  xdr.ScVal.scvVec(null),
  xdr.ScVal.scvVec([]),
  nativeToScVal({ amount: 123n, items: [true, 'nested'] }),
  Address.contract(Buffer.alloc(32, 1)).toScVal(),
  xdr.ScVal.scvError(xdr.ScError.sceContract(42)),
  xdr.ScVal.scvLedgerKeyContractInstance(),
  xdr.ScVal.scvLedgerKeyNonce(new xdr.ScNonceKey({ nonce: xdr.Int64.fromString('42') })),
];
describe('official SDK XDR round trips', () => {
  values.forEach((value, i) =>
    it(`preserves ScVal case ${i}: ${value.type}`, () => {
      const original = value.toXDR();
      const decoded = decode(original, 'ScVal');
      expect(encodeDocument(decoded.document, 'ScVal').bytes.equals(original)).toBe(true);
      expect(decoded.index.get('')?.row.end).toBe(original.length);
      expect(
        [...decoded.index.values()].every(
          (item) => item.row.start >= 0 && item.row.end <= original.length,
        ),
      ).toBe(true);
    }),
  );
  it('preserves nested ledger keys with typed address/ScVal fields', () => {
    const key = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: Address.contract(Buffer.alloc(32, 2)).toScAddress(),
        key: xdr.ScVal.scvSymbol('counter'),
        durability: xdr.ContractDataDurability.persistent,
      }),
    );
    const decoded = decode(key.toXDR(), 'LedgerKey');
    expect(encodeDocument(decoded.document, 'LedgerKey').bytes.equals(key.toXDR())).toBe(true);
    expect([...decoded.index.values()].some((item) => item.row.type === 'ScVal')).toBe(true);
  });
  it('rejects malformed encodings and base64 with nonzero unused bits', () => {
    for (const value of ['0', 'xz', 'ab0']) expect(() => inputBytes(value, 'hex')).toThrow();
    for (const value of ['AB==', 'AAAA=', '@AAA', 'AA'])
      expect(() => inputBytes(value, 'base64')).toThrow();
    expect(inputBytes('00 ff\n01', 'hex').toString('hex')).toBe('00ff01');
  });
  it('rejects trailing data and hostile lengths without allocating claimed arrays', () => {
    expect(() => decode(Buffer.concat([values[1].toXDR(), Buffer.alloc(4)]), 'ScVal')).toThrow();
    expect(() => decode(Buffer.from('0000001000000001ffffffff', 'hex'), 'ScVal')).toThrow();
    expect(() => decode(Buffer.alloc(MAX_BYTES + 1), 'ScVal')).toThrow(/5 MiB/);
  });
  it('bounds hostile vector counts before the SDK allocates objects', () => {
    const bytes = Buffer.alloc(12);
    bytes.writeUInt32BE(16, 0); // SCV_VEC
    bytes.writeUInt32BE(1, 4); // present
    bytes.writeUInt32BE(100001, 8);
    expect(() => decode(bytes, 'ScVal')).toThrow(/node/);
  });
  it('rejects deep trees and invalid typed JSON', () => {
    let value: xdr.ScVal = xdr.ScVal.scvVoid();
    for (let i = 0; i < 40; i++) value = xdr.ScVal.scvVec([value]);
    expect(() => decode(value.toXDR(), 'ScVal')).toThrow(/Nesting|depth/);
    expect(() =>
      encodeDocument(
        { kind: 'union', switch: 'scvU32', value: { kind: 'scalar', value: -1 } },
        'ScVal',
      ),
    ).toThrow();
    expect(() =>
      encodeDocument(
        {
          kind: 'union',
          switch: 'scvU64',
          value: { kind: 'integer', value: '18446744073709551616' },
        },
        'ScVal',
      ),
    ).toThrow();
    expect(() =>
      encodeDocument(
        { kind: 'union', switch: 'scvString', value: { kind: 'text', value: '\ud800' } },
        'ScVal',
      ),
    ).toThrow(/surrogate/);
  });
  it('rejects duplicate ScMap keys', () => {
    const map = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({ key: xdr.ScVal.scvU32(1), val: xdr.ScVal.scvVoid() }),
      new xdr.ScMapEntry({ key: xdr.ScVal.scvU32(1), val: xdr.ScVal.scvBool(true) }),
    ]);
    expect(() => encodeDocument(decode(map.toXDR(), 'ScVal').document, 'ScVal')).toThrow(/unique/);
  });
  it('cannot mutate prototypes or traverse an invented JSON pointer', () => {
    const doc = decode(values[1].toXDR(), 'ScVal').document;
    expect(() =>
      replaceNode(doc, '/__proto__/polluted', { kind: 'scalar', value: true }),
    ).toThrow();
    expect(() => replaceNode(doc, '/value/absent', { kind: 'scalar', value: true })).toThrow();
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });
  it('produces deterministic structural and raw diffs', () => {
    const a = decode(xdr.ScVal.scvU32(1).toXDR(), 'ScVal');
    const b = decode(xdr.ScVal.scvU32(2).toXDR(), 'ScVal');
    expect(structuralDiff(a.document, b.document)).toEqual(structuralDiff(a.document, b.document));
    expect(structuralDiff(a.document, b.document).changes).toEqual([
      { path: '/value', kind: 'changed', before: '1', after: '2' },
    ]);
    expect(rawDiff(a.bytes, b.bytes)).toMatchObject({ differentBytes: 1, firstOffset: 7 });
    const array = (n: number): XdrNode => ({
      kind: 'array',
      items: Array.from({ length: n }, (_, i) => ({ kind: 'scalar', value: i })),
    });
    expect(structuralDiff(array(0), array(10), 3)).toMatchObject({
      truncated: true,
      changes: expect.any(Array),
    });
    expect(structuralDiff(array(0), array(10), 3).changes).toHaveLength(3);
  });
});

describe('supported root schemas', () => {
  for (const root of ROOT_TYPES)
    it(`constructs and round trips ${root}`, () => {
      const first = encodeDocument(defaultNode(rootCodec(root)), root);
      const second = encodeDocument(decode(first.bytes, root).document, root);
      expect(second.bytes.equals(first.bytes)).toBe(true);
    });
});
