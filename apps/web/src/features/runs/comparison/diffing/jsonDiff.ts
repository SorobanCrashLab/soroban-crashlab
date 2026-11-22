/** Structural JSON diff: added / removed / modified / type-changed keys. */

import type { JsonDiffEntry, JsonDiffResult } from "../types";

const MAX_ENTRIES = 5000;
const MAX_DEPTH = 64;

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function joinPath(path: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? (path ? `${path}.${key}` : key) : `${path}[${JSON.stringify(key)}]`;
}

function walk(
  before: unknown,
  after: unknown,
  path: string,
  depth: number,
  entries: JsonDiffEntry[],
): void {
  if (entries.length >= MAX_ENTRIES) return;

  const beforeType = typeOf(before);
  const afterType = typeOf(after);
  if (beforeType !== afterType) {
    entries.push({ path: path || "$", type: "type-changed", before, after });
    return;
  }

  if (beforeType === "object" && afterType === "object") {
    if (depth >= MAX_DEPTH) {
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        entries.push({ path: path || "$", type: "modified", before, after });
      }
      return;
    }
    const beforeRecord = before as Record<string, unknown>;
    const afterRecord = after as Record<string, unknown>;
    const keys = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]);
    for (const key of keys) {
      if (entries.length >= MAX_ENTRIES) return;
      const childPath = joinPath(path, key);
      if (!(key in beforeRecord)) {
        entries.push({ path: childPath, type: "added", after: afterRecord[key] });
      } else if (!(key in afterRecord)) {
        entries.push({ path: childPath, type: "removed", before: beforeRecord[key] });
      } else {
        walk(beforeRecord[key], afterRecord[key], childPath, depth + 1, entries);
      }
    }
    return;
  }

  if (beforeType === "array" && afterType === "array") {
    const beforeArray = before as unknown[];
    const afterArray = after as unknown[];
    const length = Math.max(beforeArray.length, afterArray.length);
    for (let index = 0; index < length; index += 1) {
      if (entries.length >= MAX_ENTRIES) return;
      const childPath = `${path}[${index}]`;
      if (index >= beforeArray.length) {
        entries.push({ path: childPath, type: "added", after: afterArray[index] });
      } else if (index >= afterArray.length) {
        entries.push({ path: childPath, type: "removed", before: beforeArray[index] });
      } else {
        walk(beforeArray[index], afterArray[index], childPath, depth + 1, entries);
      }
    }
    return;
  }

  if (before !== after) {
    entries.push({ path: path || "$", type: "modified", before, after });
  }
}

export function parseJsonSafe(input: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(input) as unknown };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid JSON" };
  }
}

export function diffJson(beforeText: string, afterText: string): JsonDiffResult {
  const before = parseJsonSafe(beforeText);
  const after = parseJsonSafe(afterText);
  const entries: JsonDiffEntry[] = [];

  if (!before.ok || !after.ok) {
    // Fall back to a text-style comparison of the raw payloads.
    const beforeLines = beforeText.split(/\r?\n/);
    const afterLines = afterText.split(/\r?\n/);
    const length = Math.max(beforeLines.length, afterLines.length);
    for (let index = 0; index < length && entries.length < MAX_ENTRIES; index += 1) {
      if (beforeLines[index] === afterLines[index]) continue;
      const path = `[line ${index + 1}]`;
      if (index >= beforeLines.length) entries.push({ path, type: "added", after: afterLines[index] });
      else if (index >= afterLines.length) entries.push({ path, type: "removed", before: beforeLines[index] });
      else entries.push({ path, type: "modified", before: beforeLines[index], after: afterLines[index] });
    }
  } else {
    walk(before.value, after.value, "", 0, entries);
  }

  return {
    kind: "json",
    entries,
    additions: entries.filter((e) => e.type === "added").length,
    deletions: entries.filter((e) => e.type === "removed").length,
    modifications: entries.filter((e) => e.type === "modified" || e.type === "type-changed").length,
  };
}
