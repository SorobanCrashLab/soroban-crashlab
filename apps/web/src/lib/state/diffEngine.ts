import type { StateSnapshot, StateChangeKind } from './normalizeSnapshots';

export interface StateDiffEntry {
  key: string;
  path: string;
  changeType: StateChangeKind;
  before?: unknown;
  after?: unknown;
}

function stable(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) =>
    `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`;
}

function flatten(value: unknown, prefix: string, output: Map<string, unknown>, depth = 0): void {
  if (depth >= 12 || value === null || typeof value !== 'object' || Array.isArray(value)) {
    output.set(prefix, value);
    return;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) output.set(prefix, value);
  for (const [key, child] of entries) flatten(child, prefix ? `${prefix}.${key}` : key, output, depth + 1);
}

/** Deterministic key-level diff with canonical ordering and a bounded entry count. */
export function diffStateSnapshots(
  before: StateSnapshot | undefined,
  after: StateSnapshot | undefined,
  limit = 5000,
): StateDiffEntry[] {
  if (!before || !after) return [];
  const left = new Map<string, unknown>();
  const right = new Map<string, unknown>();
  for (const [key, value] of Object.entries(before.entries).sort(([a], [b]) => a.localeCompare(b))) flatten(value, key, left);
  for (const [key, value] of Object.entries(after.entries).sort(([a], [b]) => a.localeCompare(b))) flatten(value, key, right);
  const paths = [...new Set([...left.keys(), ...right.keys()])].sort();
  const result: StateDiffEntry[] = [];
  for (const path of paths) {
    const hasLeft = left.has(path);
    const hasRight = right.has(path);
    if (!hasLeft) result.push({ key: path.split('.')[0], path, changeType: 'added', after: right.get(path) });
    else if (!hasRight) result.push({ key: path.split('.')[0], path, changeType: 'removed', before: left.get(path) });
    else if (stable(left.get(path)) !== stable(right.get(path))) {
      result.push({ key: path.split('.')[0], path, changeType: 'modified', before: left.get(path), after: right.get(path) });
    }
    if (result.length >= Math.max(1, limit)) break;
  }
  return result;
}
