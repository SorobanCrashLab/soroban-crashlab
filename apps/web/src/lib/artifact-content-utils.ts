/**
 * Utility functions for detecting and formatting artifact file content
 * for JSON, text, and hex previews.
 */

import type { ContentType } from '@/app/types';

/**
 * Detect the content type of a byte buffer by examining its contents.
 *
 * - Returns `'json'` if the buffer parses as valid JSON.
 * - Returns `'text'` if all bytes are printable ASCII / common whitespace / UTF-8.
 * - Returns `'hex'` if the buffer appears to be binary (non-text bytes).
 */
export function detectContentType(buffer: ArrayBuffer): ContentType {
  const bytes = new Uint8Array(buffer);

  // Try JSON detection first (cheapest for payloads that start with { or [)
  if (bytes.length > 0 && (bytes[0] === 0x7b || bytes[0] === 0x5b)) {
    try {
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const text = decoder.decode(buffer);
      JSON.parse(text);
      return 'json';
    } catch {
      // Not valid JSON — fall through to text/hex detection
    }
  }

  // Check if content is printable text
  if (isTextContent(bytes)) {
    return 'text';
  }

  // Otherwise treat as binary -> hex preview
  return 'hex';
}

/**
 * Check whether a byte array consists entirely of printable ASCII / UTF-8 text.
 * Allows common whitespace (tab, newline, carriage return) and null bytes
 * (which sometimes appear in text files).
 */
function isTextContent(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return true;

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    // Allow: printable ASCII (0x20-0x7E), tab (0x09), LF (0x0A), CR (0x0D), null (0x00)
    if (
      !(b >= 0x20 && b <= 0x7e) &&
      b !== 0x09 && b !== 0x0a && b !== 0x0d && b !== 0x00
    ) {
      // For UTF-8 multi-byte sequences, check continuation bytes
      if (b >= 0xc2 && b <= 0xf4) {
        // Multi-byte UTF-8 — skip continuation bytes
        i += getUtf8SequenceLength(b) - 1;
        continue;
      }
      return false;
    }
  }
  return true;
}

/**
 * Determine the byte length of a UTF-8 sequence from its leading byte.
 */
function getUtf8SequenceLength(leadingByte: number): number {
  if ((leadingByte & 0xe0) === 0xc0) return 2;
  if ((leadingByte & 0xf0) === 0xe0) return 3;
  if ((leadingByte & 0xf8) === 0xf0) return 4;
  return 1;
}

/**
 * Format JSON string for display with indentation.
 * If the input is not valid JSON, returns the original string.
 */
export function formatJsonContent(input: string): string {
  try {
    const parsed = JSON.parse(input);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return input;
  }
}

/**
 * Convert a byte array to a hex dump string similar to `xxd`.
 * Each row shows: offset | hex bytes | ASCII representation
 */
export function formatHexDump(buffer: ArrayBuffer, maxBytes: number = 512): string {
  const bytes = new Uint8Array(buffer);
  const total = Math.min(bytes.length, maxBytes);
  const rows: string[] = [];

  for (let offset = 0; offset < total; offset += 16) {
    // Address
    const addr = offset.toString(16).padStart(8, '0');

    // Hex columns
    const hexParts: string[] = [];
    const asciiParts: string[] = [];
    const remaining = total - offset;

    for (let col = 0; col < 16; col++) {
      if (col < remaining) {
        const byte = bytes[offset + col];
        hexParts.push(byte.toString(16).padStart(2, '0'));
        asciiParts.push(byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.');
      } else {
        hexParts.push('  ');
        asciiParts.push(' ');
      }
    }

    rows.push(
      `${addr}  ${hexParts.slice(0, 8).join(' ')}  ${hexParts.slice(8).join(' ')}  |${asciiParts.join('')}|`
    );
  }

  // Show truncation indicator
  if (bytes.length > maxBytes) {
    rows.push(`... (${bytes.length - maxBytes} more bytes)`);
  }

  return rows.join('\n');
}

/**
 * Fetch artifact content from the API as ArrayBuffer.
 */
export async function fetchArtifactContent(id: string): Promise<ArrayBuffer> {
  const response = await fetch(`/api/artifacts/${id}`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch artifact content: ${response.status} ${response.statusText}`);
  }

  return response.arrayBuffer();
}

/**
 * Decode ArrayBuffer to text string. Handles UTF-8 encoding.
 */
export function decodeContent(buffer: ArrayBuffer): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
}
