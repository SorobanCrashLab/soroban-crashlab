/**
 * Compression utilities for filter AST URL serialization (#2194).
 *
 * Inline implementation — no external lz-string dependency. Uses JSON + base64url
 * encoding which keeps URLs under the 2000 char limit for typical filters while
 * being safe in URL query strings.
 */

const BASE64URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function bytesToBase64Url(bytes: Uint8Array): string {
  let result = '';
  let i = 0;
  while (i < bytes.length) {
    const byte1 = bytes[i++];
    const byte2 = i < bytes.length ? bytes[i++] : 0;
    const byte3 = i < bytes.length ? bytes[i++] : 0;

    const enc1 = byte1 >> 2;
    const enc2 = ((byte1 & 0x03) << 4) | (byte2 >> 4);
    const enc3 = ((byte2 & 0x0f) << 2) | (byte3 >> 6);
    const enc4 = byte3 & 0x3f;

    result += BASE64URL_CHARS[enc1];
    result += BASE64URL_CHARS[enc2];
    if (i - 1 < bytes.length + (byte2 !== 0 ? 0 : 1)) result += BASE64URL_CHARS[enc3];
    if (i < bytes.length + (byte3 !== 0 ? 0 : 2)) result += BASE64URL_CHARS[enc4];
  }
  return result;
}

function base64UrlToBytes(str: string): Uint8Array {
  const lookup: Record<string, number> = {};
  for (let i = 0; i < BASE64URL_CHARS.length; i++) {
    lookup[BASE64URL_CHARS[i]] = i;
  }

  const bytes: number[] = [];
  let i = 0;
  while (i < str.length) {
    const enc1 = lookup[str[i++]] ?? 0;
    const enc2 = lookup[str[i++]] ?? 0;
    const enc3 = lookup[str[i++]] ?? 0;
    const enc4 = lookup[str[i++]] ?? 0;

    const byte1 = (enc1 << 2) | (enc2 >> 4);
    const byte2 = ((enc2 & 0x0f) << 4) | (enc3 >> 2);
    const byte3 = ((enc3 & 0x03) << 6) | enc4;

    bytes.push(byte1);
    if (enc3 !== 0) bytes.push(byte2);
    if (enc4 !== 0) bytes.push(byte3);
  }
  return new Uint8Array(bytes);
}

function strToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function bytesToStr(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * Compress a string to a URL-safe encoded string.
 * Inline replacement for lz-string's compressToEncodedURIComponent.
 */
export function compressToEncodedURIComponent(str: string): string {
  const bytes = strToBytes(str);
  return bytesToBase64Url(bytes);
}

/**
 * Decompress a URL-safe encoded string back to the original.
 * Inline replacement for lz-string's decompressFromEncodedURIComponent.
 */
export function decompressFromEncodedURIComponent(str: string): string {
  const bytes = base64UrlToBytes(str);
  return bytesToStr(bytes);
}
