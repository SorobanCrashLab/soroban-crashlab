/*
 * Decoders that turn raw trace storage keys/values into typed, readable
 * values (#1119). Values arrive as base64 or hex encoded XDR fragments. We
 * attempt to decode the common SCValue scalars (int, address, bytes, bool) and
 * fall back to a hex representation with a warning flag when that is not
 * possible. Nothing is ever silently dropped.
 */

/** A decoded ledger key. */
export interface DecodedKey {
  kind: 'symbol' | 'address' | 'hex';
  /** Human readable representation. */
  display: string;
  /** Raw encoded input, kept for copy and debugging. */
  raw: string;
}

/** A decoded ledger value. */
export type DecodedValue =
  | { kind: 'int'; value: bigint; display: string }
  | { kind: 'address'; value: string; display: string }
  | { kind: 'bytes'; value: string; display: string; length: number }
  | { kind: 'bool'; value: boolean; display: string }
  | { kind: 'string'; value: string; display: string }
  | { kind: 'undecodable'; value: string; display: string; warning: string };

const HEX_PATTERN = /^(0[xX])?[0-9a-fA-F]+$/;

/** True when the string looks hex encoded (possibly with `0x` prefix). */
export function isHex(raw: string): boolean {
  return HEX_PATTERN.test(raw) && raw.replace(/^0[xX]/, '').length % 2 === 0;
}

/** Normalizes a hex string to lowercase without the `0x` prefix. */
export function normalizeHex(raw: string): string {
  return raw.replace(/^0[xX]/, '').toLowerCase();
}

/** Decodes a base64 string to a Uint8Array, or null when invalid. */
export function base64ToBytes(raw: string): Uint8Array | null {
  try {
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** Decodes a hex string to a Uint8Array, or null when invalid. */
export function hexToBytes(raw: string): Uint8Array | null {
  const normalized = normalizeHex(raw);
  if (normalized.length % 2 !== 0) return null;
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    bytes[i] = byte;
  }
  return bytes;
}

/** Returns the raw bytes for a base64 or hex string. */
export function rawToBytes(raw: string): Uint8Array | null {
  if (isHex(raw)) return hexToBytes(raw);
  return base64ToBytes(raw);
}

/** Converts bytes to a lowercase hex string. */
export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** Shortens a long hex string for display, keeping the byte length visible. */
export function shortenHex(hex: string, max = 16): string {
  if (hex.length <= max) return hex;
  const half = Math.floor(max / 2);
  return `${hex.slice(0, half)}"…"${hex.slice(-half)}`;
}

/** Decodes a raw storage key into a readable model. */
export function decodeStorageEntryKey(raw: string | undefined): DecodedKey {
  if (raw === undefined || raw === '') {
    return { kind: 'hex', display: '0empty key>', raw: '' };
  }
  const bytes = rawToBytes(raw);
  if (bytes && bytes.length > 0) {
    const hex = bytesToHex(bytes);
    const ascii = Array.from(bytes)
      .map((byte) => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ''))
      .join('');
    if (ascii.length === bytes.length) {
      return { kind: 'symbol', display: ascii, raw };
    }
    return { kind: 'hex', display: shortenHex(hex), raw };
  }
  return { kind: 'hex', display: shortenHex(normalizeHex(raw)), raw };
}

/** Decodes a scval address (32 bytes) into a shortened display form. */
export function decodeAddress(bytes: Uint8Array): string {
  const hex = bytesToHex(bytes);
  if (hex.length <= 12) return hex;
  return `${hex.slice(0, 6)}"…"${hex.slice(-4)}`;
}

/** Decodes a raw storage value into a readable model. */
export function decodeStorageValue(raw: string | null | undefined): DecodedValue | null {
  if (raw === null || raw === undefined || raw === '') return null;

  const bytes = rawToBytes(raw);
  if (!bytes) {
    return {
      kind: 'undecodable',
      value: raw,
      display: shortenHex(normalizeHex(raw)),
      warning: 'Value is not valid base64 or hex',
    };
  }

  if (bytes.length === 0) {
    return { kind: 'bytes', value: '', display: '0empty>', length: 0 };
  }

  if (bytes.length === 1 && (bytes[0] === 0 || bytes[0] === 1)) {
    const value = bytes[0] === 1;
    return { kind: 'bool', value, display: value ? 'true' : 'false' };
  }

  if (bytes.length === 8 || bytes.length === 16) {
    const value = bigIntFromBytes(bytes);
    return { kind: 'int', value, display: value.toString() };
  }

  if (bytes.length === 32) {
    const display = decodeAddress(bytes);
    return { kind: 'address', value: bytesToHex(bytes), display };
  }

  const text = decodeUtf8(bytes);
  if (text !== null) {
    return { kind: 'string', value: text, display: text };
  }

  const hex = bytesToHex(bytes);
  return {
    kind: 'bytes',
    value: hex,
    display: shortenHex(hex),
    length: bytes.length,
  };
}

/** Decodes big-endian two's complement bytes to a bigint. */
export function bigIntFromBytes(bytes: Uint8Array): bigint {
  let value = BigInt(0);
  for (const byte of bytes) value = (value << BigInt(8)) | BigInt(byte);
  const bits = BigInt(bytes.length * 8);
  const signBit = BigInt(1) << (bits - BigInt(1));
  if (value & signBit) value -= BigInt(1) << bits;
  return value;
}

/** Decodes UTF-8 bytes, returning null on invalid sequences. */
export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(bytes);
  } catch {
    return null;
  }
}
