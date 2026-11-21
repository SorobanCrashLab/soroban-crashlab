/** Line-level text diff with unified patch output. Dependency-free. */

import type { TextDiffHunk, TextDiffLine, TextDiffResult } from "../types";

const CONTEXT_LINES = 3;
const MAX_LCS_CELLS = 4_000_000;

type Op = { kind: "context" | "added" | "removed"; text: string };

function splitLines(input: string): string[] {
  if (input === "") return [];
  const lines = input.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** LCS backtrack. Falls back to a prefix/suffix diff for very large inputs. */
function diffLines(before: string[], after: string[]): Op[] {
  const n = before.length;
  const m = after.length;
  if (n === 0 && m === 0) return [];

  if (n * m > MAX_LCS_CELLS) {
    let prefix = 0;
    while (prefix < n && prefix < m && before[prefix] === after[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < n - prefix &&
      suffix < m - prefix &&
      before[n - 1 - suffix] === after[m - 1 - suffix]
    ) {
      suffix += 1;
    }
    const ops: Op[] = [];
    for (let i = 0; i < prefix; i += 1) ops.push({ kind: "context", text: before[i] });
    for (let i = prefix; i < n - suffix; i += 1) ops.push({ kind: "removed", text: before[i] });
    for (let i = prefix; i < m - suffix; i += 1) ops.push({ kind: "added", text: after[i] });
    for (let i = n - suffix; i < n; i += 1) ops.push({ kind: "context", text: before[i] });
    return ops;
  }

  const table = new Uint32Array((n + 1) * (m + 1));
  const width = m + 1;
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        before[i] === after[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (before[i] === after[j]) {
      ops.push({ kind: "context", text: before[i] });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      ops.push({ kind: "removed", text: before[i] });
      i += 1;
    } else {
      ops.push({ kind: "added", text: after[j] });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ kind: "removed", text: before[i] });
    i += 1;
  }
  while (j < m) {
    ops.push({ kind: "added", text: after[j] });
    j += 1;
  }
  return ops;
}

function buildHunks(ops: Op[]): TextDiffHunk[] {
  const changed = ops.map((op) => op.kind !== "context");
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < ops.length; i += 1) {
    if (!changed[i]) continue;
    const start = Math.max(0, i - CONTEXT_LINES);
    let end = Math.min(ops.length - 1, i + CONTEXT_LINES);
    while (end + 1 < ops.length && !changed[end + 1] && end + 1 - i <= CONTEXT_LINES * 2) {
      end += 1;
    }
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else ranges.push([start, end]);
  }
  if (ranges.length === 0) return [];

  return ranges.map(([start, end]) => {
    let oldLine = 1;
    let newLine = 1;
    for (let i = 0; i < start; i += 1) {
      if (ops[i].kind !== "added") oldLine += 1;
      if (ops[i].kind !== "removed") newLine += 1;
    }
    let oldCount = 0;
    let newCount = 0;
    const lines: TextDiffLine[] = ops.slice(start, end + 1).map((op) => {
      const line: TextDiffLine = { kind: op.kind, text: op.text };
      if (op.kind !== "added") {
        line.oldLine = oldLine;
        oldLine += 1;
        oldCount += 1;
      }
      if (op.kind !== "removed") {
        line.newLine = newLine;
        newLine += 1;
        newCount += 1;
      }
      return line;
    });
    return {
      header: `@@ -${oldLine - oldCount},${oldCount} +${newLine - newCount},${newCount} @@`,
      lines,
    };
  });
}

function renderUnifiedPatch(hunks: TextDiffHunk[], beforeName: string, afterName: string): string {
  if (hunks.length === 0) return "";
  const parts = [`--- ${beforeName}`, `+++ ${afterName}`];
  for (const hunk of hunks) {
    parts.push(hunk.header);
    for (const line of hunk.lines) {
      const prefix = line.kind === "added" ? "+" : line.kind === "removed" ? "-" : " ";
      parts.push(`${prefix}${line.text}`);
    }
  }
  return parts.join("\n");
}

export function diffText(
  before: string,
  after: string,
  beforeName = "a/artifact",
  afterName = "b/artifact",
): TextDiffResult {
  const ops = diffLines(splitLines(before), splitLines(after));
  const hunks = buildHunks(ops);
  return {
    kind: "text",
    hunks,
    unifiedPatch: renderUnifiedPatch(hunks, beforeName, afterName),
    additions: ops.filter((op) => op.kind === "added").length,
    deletions: ops.filter((op) => op.kind === "removed").length,
  };
}
