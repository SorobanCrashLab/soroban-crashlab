/** Byte-level binary diff. Pure TS fallback; a wasm bsdiff worker can replace
 * the chunk scanner without changing the `BinaryDiffResult` contract. */

import type { BinaryDiffChunk, BinaryDiffResult } from "../types";

const CHUNK_SIZE = 64;
const MAX_CHUNKS = 512;
const PREVIEW_BYTES = 16;

function toHex(bytes: Uint8Array, maxBytes: number): string {
  const length = Math.min(bytes.length, maxBytes);
  const parts: string[] = [];
  for (let index = 0; index < length; index += 1) {
    parts.push(bytes[index].toString(16).padStart(2, "0"));
  }
  if (bytes.length > maxBytes) parts.push("…");
  return parts.join(" ");
}

export function hexDump(bytes: Uint8Array, offset = 0, maxBytes = 256): string {
  const end = Math.min(bytes.length, offset + maxBytes);
  const lines: string[] = [];
  for (let base = offset; base < end; base += 16) {
    const slice = bytes.subarray(base, Math.min(base + 16, end));
    const hex = toHex(slice, 16).padEnd(47, " ");
    const ascii = Array.from(slice, (byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".")).join("");
    lines.push(`${(base).toString(16).padStart(8, "0")}  ${hex}  |${ascii}|`);
  }
  return lines.join("\n");
}

export function diffBinary(before: Uint8Array, after: Uint8Array): BinaryDiffResult {
  const baselineSize = before.length;
  const candidateSize = after.length;

  let identicalPrefixBytes = 0;
  const prefixLimit = Math.min(baselineSize, candidateSize);
  while (identicalPrefixBytes < prefixLimit && before[identicalPrefixBytes] === after[identicalPrefixBytes]) {
    identicalPrefixBytes += 1;
  }

  let identicalSuffixBytes = 0;
  const suffixLimit = prefixLimit - identicalPrefixBytes;
  while (
    identicalSuffixBytes < suffixLimit &&
    before[baselineSize - 1 - identicalSuffixBytes] === after[candidateSize - 1 - identicalSuffixBytes]
  ) {
    identicalSuffixBytes += 1;
  }

  const middleStart = identicalPrefixBytes;
  const beforeEnd = baselineSize - identicalSuffixBytes;
  const afterEnd = candidateSize - identicalSuffixBytes;
  const middleLength = Math.max(beforeEnd - middleStart, afterEnd - middleStart);

  let changedBytes = 0;
  const chunks: BinaryDiffChunk[] = [];

  for (let offset = 0; offset < middleLength; offset += CHUNK_SIZE) {
    const beforeSlice = before.subarray(
      Math.min(middleStart + offset, beforeEnd),
      Math.min(middleStart + offset + CHUNK_SIZE, beforeEnd),
    );
    const afterSlice = after.subarray(
      Math.min(middleStart + offset, afterEnd),
      Math.min(middleStart + offset + CHUNK_SIZE, afterEnd),
    );
    if (beforeSlice.length === afterSlice.length && beforeSlice.every((byte, i) => byte === afterSlice[i])) {
      continue;
    }

    const limit = Math.max(beforeSlice.length, afterSlice.length);
    for (let i = 0; i < limit; i += 1) {
      if (beforeSlice[i] !== afterSlice[i]) changedBytes += 1;
    }

    const previous = chunks[chunks.length - 1];
    const absoluteOffset = middleStart + offset;
    if (previous && absoluteOffset <= previous.offset + previous.length) {
      previous.length = absoluteOffset + CHUNK_SIZE - previous.offset;
    } else if (chunks.length < MAX_CHUNKS) {
      chunks.push({
        offset: absoluteOffset,
        length: CHUNK_SIZE,
        beforeHex: toHex(beforeSlice, PREVIEW_BYTES),
        afterHex: toHex(afterSlice, PREVIEW_BYTES),
      });
    }
  }

  const sizeDelta = candidateSize - baselineSize;
  return {
    kind: "binary",
    baselineSize,
    candidateSize,
    sizeDelta,
    sizeDeltaPercent:
      baselineSize === 0 ? null : Number.isFinite((sizeDelta / baselineSize) * 100) ? (sizeDelta / baselineSize) * 100 : null,
    identicalPrefixBytes,
    identicalSuffixBytes,
    changedBytes,
    chunks,
    truncated: chunks.length >= MAX_CHUNKS,
  };
}

/** Decode a hex string (with optional spaces / 0x) into bytes. Test helper and
 * artifact-preview utility. */
export function decodeHex(input: string): Uint8Array {
  const cleaned = input.replace(/0x/gi, "").replace(/[^0-9a-f]/gi, "");
  const bytes = new Uint8Array(Math.floor(cleaned.length / 2));
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
