/*
 * Contract Storage Layout & Keyspace Visual Explorer (#2327).
 *
 * Pure, deterministic model behind the explorer UI. Everything here operates
 * on plain data so decoding, aggregation, diffing and redaction can be tested
 * without React or a browser. Unknown or partial schemas are represented
 * explicitly with a confidence score rather than silently guessed.
 */

export type StorageClass = 'instance' | 'persistent' | 'temporary' | 'keyed';
export type ValueType =
  | 'u32' | 'u64' | 'i128' | 'address' | 'bool' | 'bytes' | 'map' | 'vec' | 'unknown';
export type HeatMetric = 'reads' | 'writes' | 'bytes' | 'churn';
export type DiffKind = 'added' | 'removed' | 'modified' | 'unchanged';

export interface StorageEntry {
  key: string;
  storageClass: StorageClass;
  namespace: string;
  owner: string;
  raw: string;
  decodedType: ValueType;
  decodedValue: string;
  valueBytes: number;
  reads: number;
  writes: number;
  lastAccessLedger: number;
  ttlLedger: number | null;
  sensitive: boolean;
  confidence: number;
}

export interface StorageSnapshot {
  id: string;
  contractId: string;
  campaignId: string | null;
  ledger: number;
  capturedAt: string;
  entries: StorageEntry[];
}

export interface AccessEvent {
  contractId: string;
  key: string;
  operation: 'read' | 'write';
  ledger: number;
  spanId: string | null;
  callSite: string | null;
}

export interface KeyspaceNode {
  id: string;
  label: string;
  path: string;
  depth: number;
  entryCount: number;
  reads: number;
  writes: number;
  bytes: number;
  children: KeyspaceNode[];
}

export interface HeatCell {
  key: string;
  namespace: string;
  label: string;
  value: number;
  metric: HeatMetric;
  level: 'cold' | 'warm' | 'hot' | 'critical';
}

export interface StorageAnomaly {
  kind: 'hot-key' | 'read-before-write' | 'unexpected-write' | 'ttl-expiry';
  key: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface StorageDiffRow {
  key: string;
  kind: DiffKind;
  before: string | null;
  after: string | null;
}

const SEGMENT = /[.:/]/;

/** Decode a raw stored value using an optional schema hint. */
export function decodeValue(raw: string, hint?: ValueType): { type: ValueType; value: string; confidence: number } {
  if (hint && hint !== 'unknown') {
    return { type: hint, value: raw, confidence: 0.95 };
  }
  if (raw === 'true' || raw === 'false') return { type: 'bool', value: raw, confidence: 1 };
  if (/^-?\d+$/.test(raw)) {
    const type: ValueType = raw.length > 10 ? 'i128' : 'u64';
    return { type, value: raw, confidence: 0.9 };
  }
  if (/^0x[0-9a-fA-F]+$/.test(raw)) {
    return { type: 'bytes', value: raw, confidence: 0.8 };
  }
  if (/^C[A-Z2-7]{20,}$/.test(raw)) {
    return { type: 'address', value: raw, confidence: 0.85 };
  }
  if (raw.startsWith('{') || raw.startsWith('[')) {
    return { type: raw.startsWith('{') ? 'map' : 'vec', value: raw, confidence: 0.6 };
  }
  return { type: 'unknown', value: raw, confidence: 0.2 };
}

/** Build a hierarchical keyspace tree from flattened entries. Deterministic. */
export function buildKeyspaceTree(entries: StorageEntry[]): KeyspaceNode[] {
  const roots: KeyspaceNode[] = [];
  const byPath = new Map<string, KeyspaceNode>();

  const sorted = [...entries].sort((a, b) => a.key.localeCompare(b.key));
  for (const entry of sorted) {
    const segments = [entry.namespace || entry.storageClass, ...entry.key.split(SEGMENT).filter(Boolean)];
    let parent: KeyspaceNode | null = null;
    let path = '';
    segments.forEach((segment, index) => {
      path = path ? `${path}/${segment}` : segment;
      let node = byPath.get(path);
      if (!node) {
        node = {
          id: path,
          label: segment,
          path,
          depth: index,
          entryCount: 0,
          reads: 0,
          writes: 0,
          bytes: 0,
          children: [],
        };
        byPath.set(path, node);
        if (parent) parent.children.push(node);
        else roots.push(node);
      }
      // Every node reports the number of leaf entries in its subtree, so the
      // namespace and intermediate-segment nodes are directly comparable.
      node.entryCount += 1;
      node.reads += entry.reads;
      node.writes += entry.writes;
      node.bytes += entry.valueBytes;
      parent = node;
    });
  }
  return roots;
}

/** Rank keys by the requested heat metric with a stable tie-break on key. */
export function buildHeatmap(entries: StorageEntry[], metric: HeatMetric): HeatCell[] {
  const valueOf = (entry: StorageEntry): number => {
    switch (metric) {
      case 'reads': return entry.reads;
      case 'writes': return entry.writes;
      case 'bytes': return entry.valueBytes;
      case 'churn': return entry.reads + entry.writes;
    }
  };
  const cells = entries.map((entry) => ({
    key: entry.key,
    namespace: entry.namespace,
    label: entry.key.split(SEGMENT).pop() || entry.key,
    value: valueOf(entry),
    metric,
    level: 'cold' as HeatCell['level'],
  }));
  cells.sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
  const max = cells[0]?.value ?? 0;
  for (const cell of cells) {
    const ratio = max > 0 ? cell.value / max : 0;
    cell.level = ratio >= 0.75 ? 'critical' : ratio >= 0.4 ? 'hot' : ratio >= 0.15 ? 'warm' : 'cold';
  }
  return cells;
}

/** Detect access-pattern anomalies from snapshot entries and access events. */
export function analyzeAccessPatterns(
  entries: StorageEntry[],
  events: AccessEvent[],
  currentLedger: number,
): StorageAnomaly[] {
  const anomalies: StorageAnomaly[] = [];
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));

  for (const entry of entries) {
    if (entry.reads + entry.writes >= 50) {
      anomalies.push({
        kind: 'hot-key',
        key: entry.key,
        detail: `${entry.reads} reads / ${entry.writes} writes`,
        severity: entry.reads + entry.writes >= 200 ? 'critical' : 'warning',
      });
    }
    if (entry.ttlLedger !== null && entry.ttlLedger <= currentLedger) {
      anomalies.push({
        kind: 'ttl-expiry',
        key: entry.key,
        detail: `TTL expired at ledger ${entry.ttlLedger}`,
        severity: 'warning',
      });
    }
  }

  const seen = new Set<string>();
  for (const event of events) {
    if (!byKey.has(event.key)) {
      anomalies.push({
        kind: 'unexpected-write',
        key: event.key,
        detail: `write to unknown key from ${event.callSite ?? 'unknown call site'}`,
        severity: 'critical',
      });
      continue;
    }
    const composite = `${event.contractId}:${event.key}:${event.operation}`;
    if (event.operation === 'read' && !seen.has(composite) && seen.has(`${event.contractId}:${event.key}:write`)) {
      anomalies.push({
        kind: 'read-before-write',
        key: event.key,
        detail: 'read observed after an earlier write in the same window',
        severity: 'info',
      });
    }
    seen.add(composite);
  }
  return anomalies.sort((a, b) => a.key.localeCompare(b.key) || a.kind.localeCompare(b.kind));
}

/** Diff two snapshots with deterministic ordering. */
export function diffSnapshots(before: StorageSnapshot, after: StorageSnapshot): StorageDiffRow[] {
  const beforeMap = new Map(before.entries.map((entry) => [entry.key, entry]));
  const afterMap = new Map(after.entries.map((entry) => [entry.key, entry]));
  const keys = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort();
  return keys.map((key) => {
    const oldEntry = beforeMap.get(key);
    const newEntry = afterMap.get(key);
    const kind: DiffKind = !oldEntry ? 'added' : !newEntry ? 'removed'
      : oldEntry.decodedValue === newEntry.decodedValue ? 'unchanged' : 'modified';
    return {
      key,
      kind,
      before: oldEntry ? oldEntry.decodedValue : null,
      after: newEntry ? newEntry.decodedValue : null,
    };
  });
}

/** Mask sensitive values. Deterministic and idempotent. */
export function redactEntry(entry: StorageEntry, reveal = false): StorageEntry {
  if (!entry.sensitive || reveal) return entry;
  return { ...entry, raw: '***', decodedValue: '***', confidence: 0 };
}

/** Non-visual summary of the keyspace for screen readers and exports. */
export function summarizeKeyspace(entries: StorageEntry[]): string {
  if (entries.length === 0) return 'No storage entries in this snapshot.';
  const classes = new Map<StorageClass, number>();
  for (const entry of entries) classes.set(entry.storageClass, (classes.get(entry.storageClass) ?? 0) + 1);
  const parts = [...classes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => `${count} ${name}`);
  return `${entries.length} entries across ${parts.join(', ')}.`;
}
