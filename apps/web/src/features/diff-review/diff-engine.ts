/*
 * Diff engines behind the workbench renderers (#1880).
 *
 * Four pure strategies, each returning the same `EngineDiffResult` shape so the
 * pluggable renderers in `renderers.ts` stay thin:
 *
 *   diffTextLines   — LCS line diff with context hunks (configs, reports)
 *   diffStructured  — leaf-path diff of two JSON documents (blueprints)
 *   diffSnapshot    — region diff of two rendered frames (snapshots)
 *   diffSemantic    — trace/state diff reusing the readable state-diff model
 *
 * Nothing here throws on bad input: an artifact that cannot be parsed falls
 * back to a text comparison and records a notice instead of failing the render.
 */

import { computeNumericDelta, formatDiffValue } from '@/lib/replay-diff';
import { buildStateDiffModel } from '@/lib/state-diff/model';
import type { TraceStorageEvent } from '@/lib/state-diff/model';
import type { DiffChangeKind, DiffHunk, DiffRow, DiffSummary } from './types';

/** Lines kept from each side before a comparison is truncated. */
export const MAX_DIFF_LINES = 1200;

/** Default number of context rows around each change group. */
export const DEFAULT_CONTEXT = 3;

/** Normalised output shared by every engine. */
export interface EngineDiffResult {
  hunks: DiffHunk[];
  summary: DiffSummary;
  isEmpty: boolean;
  notices: string[];
}

/** Counts rows by classification. */
export function summarizeRows(rows: readonly DiffRow[]): DiffSummary {
  const summary: DiffSummary = { added: 0, removed: 0, modified: 0, unchanged: 0, total: rows.length };
  for (const row of rows) {
    if (row.change === 'added') summary.added += 1;
    else if (row.change === 'removed') summary.removed += 1;
    else if (row.change === 'modified') summary.modified += 1;
    else summary.unchanged += 1;
  }
  return summary;
}

interface InternalOp {
  change: DiffChangeKind;
  text: string;
}

/** Splits a revision into lines, normalising newlines and dropping the last empty line. */
function splitLines(text: string | null): string[] {
  if (text === null) return [];
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (normalized === '') return [];
  const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  return trimmed.split('\n');
}

/** Classic LCS walk producing an ordered op list. */
function lcsOps(left: string[], right: string[]): InternalOp[] {
  const n = left.length;
  const m = right.length;
  const width = m + 1;
  const table = new Int32Array((n + 1) * width);

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (left[i] === right[j]) {
        table[i * width + j] = table[(i + 1) * width + (j + 1)] + 1;
      } else {
        const down = table[(i + 1) * width + j];
        const across = table[i * width + (j + 1)];
        table[i * width + j] = down >= across ? down : across;
      }
    }
  }

  const ops: InternalOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      ops.push({ change: 'unchanged', text: left[i] });
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + (j + 1)]) {
      ops.push({ change: 'removed', text: left[i] });
      i += 1;
    } else {
      ops.push({ change: 'added', text: right[j] });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ change: 'removed', text: left[i] });
    i += 1;
  }
  while (j < m) {
    ops.push({ change: 'added', text: right[j] });
    j += 1;
  }
  return ops;
}

function makeTextHunk(rows: readonly DiffRow[], start: number, end: number): DiffHunk {
  const slice = rows.slice(start, end + 1);
  const leftNumbers: number[] = [];
  const rightNumbers: number[] = [];
  for (const row of slice) {
    if (row.leftLine !== null) leftNumbers.push(row.leftLine);
    if (row.rightLine !== null) rightNumbers.push(row.rightLine);
  }
  const leftStart = leftNumbers.length > 0 ? leftNumbers[0] : 0;
  const rightStart = rightNumbers.length > 0 ? rightNumbers[0] : 0;
  return {
    id: `hunk-${start}-${end}`,
    header: `@@ -${leftStart},${leftNumbers.length} +${rightStart},${rightNumbers.length} @@`,
    rows: slice,
  };
}

/** Groups changed rows into hunks keeping `context` rows on each side. */
function buildTextHunks(rows: readonly DiffRow[], context: number): DiffHunk[] {
  const changedIndices: number[] = [];
  rows.forEach((row, index) => {
    if (row.change !== 'unchanged') changedIndices.push(index);
  });
  if (changedIndices.length === 0) return [];

  const hunks: DiffHunk[] = [];
  let start = Math.max(0, changedIndices[0] - context);
  let end = Math.min(rows.length - 1, changedIndices[0] + context);

  for (let k = 1; k < changedIndices.length; k += 1) {
    const index = changedIndices[k];
    if (index - context <= end + 1) {
      end = Math.min(rows.length - 1, index + context);
    } else {
      hunks.push(makeTextHunk(rows, start, end));
      start = Math.max(0, index - context);
      end = Math.min(rows.length - 1, index + context);
    }
  }
  hunks.push(makeTextHunk(rows, start, end));
  return hunks;
}

/** Line-based unified diff with context hunks. */
export function diffTextLines(
  before: string | null,
  after: string | null,
  options: { context?: number; maxLines?: number } = {},
): EngineDiffResult {
  const context = Math.max(0, options.context ?? DEFAULT_CONTEXT);
  const maxLines = options.maxLines ?? MAX_DIFF_LINES;
  const leftAll = splitLines(before);
  const rightAll = splitLines(after);
  const notices: string[] = [];

  const left = leftAll.slice(0, maxLines);
  const right = rightAll.slice(0, maxLines);
  if (left.length < leftAll.length || right.length < rightAll.length) {
    notices.push(`Comparison truncated at ${maxLines} lines per side.`);
  }

  const ops = lcsOps(left, right);
  const rows: DiffRow[] = [];
  let leftLine = 0;
  let rightLine = 0;

  ops.forEach((op, index) => {
    if (op.change === 'unchanged') {
      leftLine += 1;
      rightLine += 1;
      rows.push({
        id: `row-${index}`,
        change: 'unchanged',
        left: op.text,
        right: op.text,
        leftLine,
        rightLine,
        depth: 0,
        group: null,
        anchor: `text-${index}`,
        note: null,
      });
    } else if (op.change === 'removed') {
      leftLine += 1;
      rows.push({
        id: `row-${index}`,
        change: 'removed',
        left: op.text,
        right: '',
        leftLine,
        rightLine: null,
        depth: 0,
        group: null,
        anchor: `text-${index}`,
        note: null,
      });
    } else {
      rightLine += 1;
      rows.push({
        id: `row-${index}`,
        change: 'added',
        left: '',
        right: op.text,
        leftLine: null,
        rightLine,
        depth: 0,
        group: null,
        anchor: `text-${index}`,
        note: null,
      });
    }
  });

  return {
    hunks: buildTextHunks(rows, context),
    summary: summarizeRows(rows),
    isEmpty: left.length === 0 && right.length === 0,
    notices,
  };
}

interface FlatLeaf {
  path: string;
  display: string;
  value: unknown;
  kind: string;
}

function flatten(value: unknown, prefix: string, out: FlatLeaf[]): void {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.push({ path: prefix || '(root)', display: '[]', value, kind: 'array' });
      return;
    }
    value.forEach((item, index) => flatten(item, `${prefix}[${index}]`, out));
    return;
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    if (keys.length === 0) {
      out.push({ path: prefix || '(root)', display: '{}', value, kind: 'object' });
      return;
    }
    for (const key of keys) {
      flatten(record[key], prefix ? `${prefix}.${key}` : key, out);
    }
    return;
  }

  const kind = value === null ? 'null' : typeof value;
  out.push({ path: prefix || '(root)', display: formatDiffValue(value, kind, 160), value, kind });
}

function parseLeaves(raw: string | null): { leaves: FlatLeaf[] } | { error: true } {
  if (raw === null || raw.trim() === '') return { leaves: [] };
  try {
    const parsed: unknown = JSON.parse(raw);
    const leaves: FlatLeaf[] = [];
    flatten(parsed, '', leaves);
    return { leaves };
  } catch {
    return { error: true };
  }
}

/** Natural comparator so `a[2]` sorts before `a[10]`. */
function comparePaths(a: string, b: string): number {
  const segmentsA = a.match(/\d+|\D+/g) ?? [a];
  const segmentsB = b.match(/\d+|\D+/g) ?? [b];
  const shared = Math.min(segmentsA.length, segmentsB.length);
  for (let i = 0; i < shared; i += 1) {
    const segmentA = segmentsA[i];
    const segmentB = segmentsB[i];
    const numericA = /^\d+$/.test(segmentA);
    const numericB = /^\d+$/.test(segmentB);
    if (numericA && numericB) {
      const diff = Number(segmentA) - Number(segmentB);
      if (diff !== 0) return diff < 0 ? -1 : 1;
    } else if (segmentA !== segmentB) {
      return segmentA < segmentB ? -1 : 1;
    }
  }
  return segmentsA.length - segmentsB.length;
}

function topSegment(path: string): string {
  const match = /^[^.[]+/.exec(path);
  return match ? match[0] : path;
}

/** Groups consecutive rows sharing a group value into hunks. */
function groupConsecutiveRows(rows: readonly DiffRow[]): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let group: string | null = null;
  let buffer: DiffRow[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    hunks.push({ id: `group-${hunks.length}`, header: group ?? 'root', rows: buffer });
    buffer = [];
  };

  for (const row of rows) {
    if (buffer.length === 0) {
      group = row.group;
      buffer.push(row);
    } else if (row.group === group) {
      buffer.push(row);
    } else {
      flush();
      group = row.group;
      buffer.push(row);
    }
  }
  flush();
  return hunks;
}

function textFallback(before: string | null, after: string | null, notice: string): EngineDiffResult {
  const fallback = diffTextLines(before, after, { context: DEFAULT_CONTEXT });
  return { ...fallback, notices: [...fallback.notices, notice] };
}

/** Leaf-path diff of two JSON documents. */
export function diffStructured(before: string | null, after: string | null): EngineDiffResult {
  const beforeResult = parseLeaves(before);
  const afterResult = parseLeaves(after);
  if ('error' in beforeResult || 'error' in afterResult) {
    return textFallback(before, after, 'Input was not valid JSON. Showing a text comparison instead.');
  }

  const beforeByPath = new Map(beforeResult.leaves.map((leaf) => [leaf.path, leaf]));
  const afterByPath = new Map(afterResult.leaves.map((leaf) => [leaf.path, leaf]));
  const paths = [...new Set([...beforeByPath.keys(), ...afterByPath.keys()])].sort(comparePaths);

  const rows: DiffRow[] = paths.map((path, index) => {
    const beforeLeaf = beforeByPath.get(path);
    const afterLeaf = afterByPath.get(path);
    const depth = (path.match(/[.[]/g) ?? []).length;

    let change: DiffChangeKind = 'unchanged';
    let note: string | null = null;
    if (beforeLeaf && !afterLeaf) change = 'removed';
    else if (!beforeLeaf && afterLeaf) change = 'added';
    else if (beforeLeaf && afterLeaf && beforeLeaf.display !== afterLeaf.display) {
      change = 'modified';
      const numeric = computeNumericDelta(beforeLeaf.value, afterLeaf.value);
      if (numeric.hasDelta) note = `delta ${numeric.delta > 0 ? '+' : ''}${numeric.delta}`;
    }

    return {
      id: `field-${index}`,
      change,
      left: beforeLeaf ? beforeLeaf.display : '',
      right: afterLeaf ? afterLeaf.display : '',
      leftLine: null,
      rightLine: null,
      depth,
      group: topSegment(path),
      anchor: path,
      note,
    };
  });

  return {
    hunks: groupConsecutiveRows(rows),
    summary: summarizeRows(rows),
    isEmpty: rows.length === 0,
    notices: [],
  };
}

interface SnapshotRegion {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hash: string;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readRegion(raw: unknown, index: number): SnapshotRegion | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' && record.id ? record.id : `region-${index}`;
  return {
    id,
    label: typeof record.label === 'string' ? record.label : id,
    x: readNumber(record.x, 0),
    y: readNumber(record.y, 0),
    width: readNumber(record.width, 0),
    height: readNumber(record.height, 0),
    hash: typeof record.hash === 'string' ? record.hash : '',
  };
}

function parseRegions(raw: string | null): SnapshotRegion[] | null {
  if (raw === null || raw.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const list = Array.isArray(parsed)
      ? parsed
      : parsed !== null && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).regions)
        ? ((parsed as Record<string, unknown>).regions as unknown[])
        : null;
    if (list === null) return null;
    return list.map(readRegion).filter((region): region is SnapshotRegion => region !== null);
  } catch {
    return null;
  }
}

function describeRegion(region: SnapshotRegion): string {
  const size = `${region.width}x${region.height}`;
  const position = `${region.x},${region.y}`;
  const hash = region.hash ? ` #${region.hash.slice(0, 8)}` : '';
  return `${region.label} @ ${position} ${size}${hash}`;
}

/** Region-level diff of two rendered frames. */
export function diffSnapshot(before: string | null, after: string | null): EngineDiffResult {
  const beforeRegions = parseRegions(before);
  const afterRegions = parseRegions(after);
  if (beforeRegions === null || afterRegions === null) {
    return textFallback(before, after, 'Snapshot regions were not readable. Showing a text comparison instead.');
  }

  const beforeById = new Map(beforeRegions.map((region) => [region.id, region]));
  const afterById = new Map(afterRegions.map((region) => [region.id, region]));
  const ids = [...new Set([...beforeById.keys(), ...afterById.keys()])].sort();

  const rows: DiffRow[] = ids.map((id, index) => {
    const beforeRegion = beforeById.get(id);
    const afterRegion = afterById.get(id);

    let change: DiffChangeKind = 'unchanged';
    let note: string | null = null;
    if (beforeRegion && !afterRegion) change = 'removed';
    else if (!beforeRegion && afterRegion) change = 'added';
    else if (beforeRegion && afterRegion && describeRegion(beforeRegion) !== describeRegion(afterRegion)) {
      change = 'modified';
      note = beforeRegion.hash !== afterRegion.hash ? 'pixels changed' : 'layout changed';
    }

    return {
      id: `region-${index}`,
      change,
      left: beforeRegion ? describeRegion(beforeRegion) : '',
      right: afterRegion ? describeRegion(afterRegion) : '',
      leftLine: null,
      rightLine: null,
      depth: 0,
      group: null,
      anchor: id,
      note,
    };
  });

  return {
    hunks: rows.length === 0 ? [] : [{ id: 'regions', header: 'snapshot regions', rows }],
    summary: summarizeRows(rows),
    isEmpty: rows.length === 0,
    notices: [],
  };
}

interface SemanticEntry {
  contractId: string;
  key: string;
  type: string;
  value: string | null;
}

function readSemanticEntry(raw: unknown, index: number): SemanticEntry | null {
  if (raw === null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const contractId = typeof record.contractId === 'string' && record.contractId ? record.contractId : 'unknown';
  const key = typeof record.key === 'string' ? record.key : `entry-${index}`;
  return {
    contractId,
    key,
    type: typeof record.type === 'string' ? record.type : 'contract_data',
    value: typeof record.value === 'string' ? record.value : null,
  };
}

function parseSemanticEntries(raw: string | null): SemanticEntry[] | null {
  if (raw === null || raw.trim() === '') return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map(readSemanticEntry)
      .filter((entry): entry is SemanticEntry => entry !== null);
  } catch {
    return null;
  }
}

function semanticKey(entry: SemanticEntry): string {
  return `${entry.contractId}:${entry.key}`;
}

/** Trace/state diff over two semantic snapshots, reusing the readable state model. */
export function diffSemantic(before: string | null, after: string | null): EngineDiffResult {
  const beforeEntries = parseSemanticEntries(before);
  const afterEntries = parseSemanticEntries(after);
  if (beforeEntries === null || afterEntries === null) {
    return textFallback(before, after, 'Trace entries were not readable. Showing a text comparison instead.');
  }

  const beforeByKey = new Map(beforeEntries.map((entry) => [semanticKey(entry), entry]));
  const afterByKey = new Map(afterEntries.map((entry) => [semanticKey(entry), entry]));
  const keys = [...new Set([...beforeByKey.keys(), ...afterByKey.keys()])].sort();

  const events: TraceStorageEvent[] = keys.map((key) => {
    const beforeEntry = beforeByKey.get(key);
    const afterEntry = afterByKey.get(key);
    const source = afterEntry ?? beforeEntry;
    return {
      type: source ? source.type : 'contract_data',
      contractId: source ? source.contractId : 'unknown',
      key: source ? source.key : key,
      before: beforeEntry ? beforeEntry.value : null,
      after: afterEntry ? afterEntry.value : null,
    };
  });

  const model = buildStateDiffModel(events);
  const hunks: DiffHunk[] = model.groups.map((group, groupIndex) => ({
    id: `semantic-${groupIndex}`,
    header: group.contractId,
    rows: group.entries.map((entry, entryIndex) => {
      const delta = entry.delta;
      return {
        id: `semantic-${groupIndex}-${entryIndex}`,
        change: entry.changeType,
        left: entry.before ? entry.before.display : '',
        right: entry.after ? entry.after.display : '',
        leftLine: null,
        rightLine: null,
        depth: 0,
        group: entry.contractId,
        anchor: `${entry.contractId}:${entry.key.raw}`,
        note: delta === null ? null : `delta ${delta > BigInt(0) ? '+' : ''}${delta.toString()}`,
      };
    }),
  }));

  const notices: string[] = [];
  if (model.summary.undecodable > 0) {
    notices.push(`${model.summary.undecodable} value(s) could not be decoded and are shown as raw bytes.`);
  }

  return {
    hunks,
    summary: {
      added: model.summary.added,
      removed: model.summary.removed,
      modified: model.summary.modified,
      unchanged: model.summary.unchanged,
      total: model.summary.total,
    },
    isEmpty: model.isEmpty,
    notices,
  };
}
