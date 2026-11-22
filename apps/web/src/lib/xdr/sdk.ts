/** Normalize the maintained SDK's PUBLIC schema API into a small visitor API.
 * No protocol constructor or property name is selected by untrusted documents. */
import { xdr } from '@stellar/stellar-sdk/base';
import { Buffer } from 'buffer';
import type { Codec } from './decode';
interface Arm {
  kind: string;
  name?: string;
  schema?: Schema;
}
interface Schema {
  kind: string;
  name?: string;
  entries?: [string, Schema][];
  switchOn?: Schema;
  cases?: { name: string; discriminant: number; arm: Arm }[];
  defaultArm?: Arm;
  switchKey?: string;
  nameByValue?: Map<number, string>;
  element?: Schema;
  length?: number;
  maxLength?: number;
  getSchema?: () => Schema;
  decode: (bytes: Uint8Array, options?: { maxDepth: number }) => unknown;
  encode: (value: unknown, options?: { maxDepth: number }) => Uint8Array;
}
interface Enum {
  name: string;
  value: number;
}
interface Union {
  switch(): Enum | number;
  value(): unknown;
  armType(): Codec;
}
const cache = new WeakMap<Schema, Codec>();
const NAMES: Record<string, string> = {
  int32: 'Int',
  uint32: 'UnsignedInt',
  int64: 'Hyper',
  uint64: 'UnsignedHyper',
  bool: 'Bool',
  void: 'Void',
  string: 'String',
  opaque: 'Opaque',
  varOpaque: 'VarOpaque',
  array: 'VarArray',
  fixedArray: 'Array',
  option: 'Option',
};
const voidSchema = (xdr.ScVal.schema as unknown as Schema).cases!.find(
  (value) => value.name === 'scvVoid',
)!.arm as Schema;
function adapt(raw: Schema): Codec {
  const schema = raw.kind === 'lazy' ? raw.getSchema!() : raw;
  const existing = cache.get(schema);
  if (existing) return existing;
  const codec = { name: NAMES[schema.kind] ?? schema.name ?? schema.kind } as Codec;
  cache.set(schema, codec);
  if (schema.kind === 'struct')
    codec.fields = schema.entries!.map(([name, type]) => [name, adapt(type)]);
  if (schema.kind === 'struct') codec.structName = schema.name;
  if (schema.kind === 'union') {
    codec.unionName = schema.name;
    codec.switchOn = adapt(schema.switchOn!);
    codec.armForSwitch = (tag: unknown) => {
      const value = typeof tag === 'object' && tag !== null ? (tag as Enum).value : tag;
      const arm =
        schema.cases!.find((item) => item.discriminant === value)?.arm ?? schema.defaultArm;
      if (!arm) throw new Error(`Invalid ${schema.name} discriminator`);
      return arm;
    };
    codec.armTypeForArm = (rawArm: unknown) => {
      const arm = rawArm as Arm;
      if (arm.kind === 'void') return adapt(voidSchema);
      if (arm.kind !== 'field' || !arm.schema) throw new Error('Unsupported SDK union arm schema');
      return adapt(arm.schema);
    };
  }
  if (schema.kind === 'enum') {
    codec.enumName = schema.name;
    codec.values = () => [...schema.nameByValue!].map(([value, name]) => ({ name, value }));
    codec.fromValue = (value: number) => {
      const name = schema.nameByValue!.get(value);
      if (name === undefined) throw new Error(`Unknown ${schema.name} member`);
      return { name, value };
    };
    codec.fromName = (name: string) => {
      const item = codec.values!().find((item) => item.name === name);
      if (!item) throw new Error(`Unknown ${schema.name} member`);
      return item;
    };
  }
  if (schema.element) codec.childType = adapt(schema.element);
  if (schema.kind === 'opaque' || schema.kind === 'fixedArray') codec.fixedLength = schema.length;
  if (schema.kind === 'string' || schema.kind === 'varOpaque' || schema.kind === 'array')
    codec.maxLength = schema.maxLength;
  if (schema.kind === 'string') codec.readString = true;
  codec.isValid = (value: unknown): boolean => {
    switch (schema.kind) {
      case 'void':
        return value === undefined;
      case 'bool':
        return typeof value === 'boolean';
      case 'int32':
        return (
          typeof value === 'number' &&
          Number.isInteger(value) &&
          value >= -2147483648 &&
          value <= 2147483647
        );
      case 'uint32':
        return (
          typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 4294967295
        );
      case 'int64':
        return typeof value === 'bigint' && value >= -(1n << 63n) && value < 1n << 63n;
      case 'uint64':
        return typeof value === 'bigint' && value >= 0n && value < 1n << 64n;
      case 'enum':
        return (
          typeof value === 'object' &&
          value !== null &&
          schema.nameByValue!.has((value as Enum).value) &&
          schema.nameByValue!.get((value as Enum).value) === (value as Enum).name
        );
      case 'string':
      case 'varOpaque':
        return value instanceof Uint8Array && value.length <= (schema.maxLength ?? 4294967295);
      case 'opaque':
        return value instanceof Uint8Array && value.length === schema.length;
      default:
        return true;
    }
  };
  if (schema.kind === 'int64' || schema.kind === 'uint64')
    codec.fromString = (text: string) => {
      const value = BigInt(text);
      if (!codec.isValid!(value)) throw new Error('64-bit integer out of range');
      return value;
    };
  codec.create = (first: unknown, second?: unknown): unknown => {
    if (codec.fields) {
      const attributes = first as Record<string, unknown>;
      const result: Record<string, unknown> = { _attributes: attributes };
      for (const [name] of codec.fields) result[name] = () => attributes[name];
      return result;
    }
    if (codec.switchOn)
      return {
        switch: () => first,
        value: () => second,
        armType: () => codec.armTypeForArm!(codec.armForSwitch!(first)),
      };
    throw new Error('Cannot construct this codec value');
  };
  function wrap(value: unknown): unknown {
    if (codec.fields) {
      const attrs: Record<string, unknown> = Object.create(null);
      for (const [name, type] of codec.fields)
        attrs[name] = wrappers(type).wrap((value as Record<string, unknown>)[name]);
      return codec.create!(attrs);
    }
    if (codec.switchOn) {
      const obj = value as Record<string, unknown>;
      const discriminant = obj[schema.switchKey!];
      const tag = codec.switchOn.enumName
        ? codec.switchOn.fromValue!(discriminant as number)
        : discriminant;
      const arm = codec.armForSwitch!(tag) as Arm;
      return codec.create!(
        tag,
        arm.kind === 'void' ? undefined : wrappers(codec.armTypeForArm!(arm)).wrap(obj[arm.name!]),
      );
    }
    if (codec.enumName) return codec.fromValue!(value as number);
    if (codec.childType) {
      if (schema.kind === 'option')
        return value === null ? undefined : wrappers(codec.childType).wrap(value);
      return (value as unknown[]).map((item) => wrappers(codec.childType!).wrap(item));
    }
    if (schema.kind === 'string') return Buffer.from((value as { bytes: Uint8Array }).bytes);
    return value;
  }
  function unwrap(value: unknown): unknown {
    if (codec.fields) {
      const obj: Record<string, unknown> = Object.create(null);
      const attrs = (value as { _attributes: Record<string, unknown> })._attributes;
      for (const [name, type] of codec.fields) obj[name] = wrappers(type).unwrap(attrs[name]);
      return obj;
    }
    if (codec.switchOn) {
      const union = value as Union;
      const tag = union.switch();
      const arm = codec.armForSwitch!(tag) as Arm;
      const obj: Record<string, unknown> = {
        [schema.switchKey!]: typeof tag === 'object' ? tag.value : tag,
      };
      if (arm.kind !== 'void')
        obj[arm.name!] = wrappers(codec.armTypeForArm!(arm)).unwrap(union.value());
      return obj;
    }
    if (codec.enumName) return (value as Enum).value;
    if (codec.childType) {
      if (schema.kind === 'option')
        return value == null ? null : wrappers(codec.childType).unwrap(value);
      return (value as unknown[]).map((item) => wrappers(codec.childType!).unwrap(item));
    }
    if (schema.kind === 'string') return new xdr.XdrString(value as Uint8Array);
    return value;
  }
  wireWrappers.set(codec, { wrap, unwrap });
  codec.fromXDR = (bytes: Buffer) => wrap(schema.decode(bytes, { maxDepth: 200 }));
  codec.toXDR = (value: unknown) => Buffer.from(schema.encode(unwrap(value), { maxDepth: 200 }));
  return codec;
}
const wireWrappers = new WeakMap<
  Codec,
  { wrap: (value: unknown) => unknown; unwrap: (value: unknown) => unknown }
>();
function wrappers(codec: Codec) {
  const value = wireWrappers.get(codec);
  if (!value) throw new Error('Incomplete SDK schema adapter');
  return value;
}
export function codecForRoot(name: string): Codec {
  const root = (xdr as unknown as Record<string, { schema: Schema }>)[name];
  if (!root?.schema) throw new Error('Unsupported SDK root schema');
  return adapt(root.schema);
}
