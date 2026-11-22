import type { LedgerStateChange } from '@/app/types';

export type StateChangeKind = 'added' | 'removed' | 'modified';
export type StateCategory = 'storage' | 'ledger' | 'auth' | 'balance' | 'resource' | 'other';

export interface StateSnapshot {
  id: string;
  label: string;
  ledger?: number;
  timestamp?: string;
  entries: Record<string, unknown>;
  complete: boolean;
  source: string;
}

export interface StateMutation {
  id: string;
  key: string;
  contractId: string;
  namespace: string;
  category: StateCategory;
  changeType: StateChangeKind;
  before?: unknown;
  after?: unknown;
  ledger?: number;
  timestamp?: string;
  actor?: string;
  callId?: string;
  traceNodeId?: string;
  logId?: string;
  source: string;
}

export interface StateInspectorData {
  runId: string;
  snapshots: StateSnapshot[];
  mutations: StateMutation[];
  quality: { status: 'complete' | 'partial' | 'unavailable'; message: string; artifactCount: number };
}

const SENSITIVE_KEY = /(secret|private.?key|token|password|credential|seed|payload|signature|authorization)/i;
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const first = (...values: unknown[]): unknown => values.find((value) => value !== undefined && value !== null);

function safeValue(value: unknown, key = ''): unknown {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => safeValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([childKey, child]) => [childKey, safeValue(child, childKey)]));
  }
  if (typeof value === 'string' && value.length > 4096) return value.slice(0, 4096) + '…';
  return value;
}

function categoryFor(key: string, namespace: string): StateCategory {
  const value = `${key} ${namespace}`.toLowerCase();
  if (/auth|signer|allowance|permit/.test(value)) return 'auth';
  if (/balance|trustline|token/.test(value)) return 'balance';
  if (/ttl|rent|resource|footprint/.test(value)) return 'resource';
  if (/ledger|account|sequence/.test(value)) return 'ledger';
  if (/contract|storage|data/.test(value)) return 'storage';
  return 'other';
}

function normalizeMutation(raw: unknown, index: number, source: string): StateMutation | null {
  const item = asRecord(raw);
  const key = String(first(item.key, item.id, item.ledgerKey, item.storageKey) ?? '');
  if (!key) return null;
  const before = first(item.before, item.oldValue, item.previous);
  const after = first(item.after, item.newValue, item.value);
  const explicit = String(first(item.changeType, item.type, item.operation) ?? '').toLowerCase();
  const changeType: StateChangeKind = explicit.includes('delete') || after === undefined
    ? 'removed' : explicit.includes('create') || before === undefined ? 'added' : 'modified';
  const namespace = String(first(item.namespace, item.entryType, item.type) ?? key.split(':')[0] ?? 'unknown');
  return {
    id: String(first(item.id, item.eventId) ?? `${source}:mutation:${index}:${key}`),
    key,
    contractId: String(first(item.contractId, item.contract, item.address) ?? 'ledger'),
    namespace,
    category: categoryFor(key, namespace),
    changeType,
    ...(before !== undefined ? { before: safeValue(before, key) } : {}),
    ...(after !== undefined ? { after: safeValue(after, key) } : {}),
    ...(typeof first(item.ledger, item.ledgerSequence, item.ledger_seq) === 'number'
      ? { ledger: Number(first(item.ledger, item.ledgerSequence, item.ledger_seq)) } : {}),
    ...(typeof item.timestamp === 'string' ? { timestamp: item.timestamp } : {}),
    ...(typeof first(item.actor, item.source) === 'string' ? { actor: String(first(item.actor, item.source)) } : {}),
    ...(typeof first(item.callId, item.invocationId) === 'string' ? { callId: String(first(item.callId, item.invocationId)) } : {}),
    ...(typeof first(item.traceNodeId, item.traceId) === 'string' ? { traceNodeId: String(first(item.traceNodeId, item.traceId)) } : {}),
    ...(typeof item.logId === 'string' ? { logId: item.logId } : {}),
    source,
  };
}

function normalizeSnapshot(raw: unknown, index: number, source: string): StateSnapshot | null {
  const item = asRecord(raw);
  const entries = asRecord(first(item.entries, item.state, item.storage, item.values));
  if (!Object.keys(entries).length && !Array.isArray(item.entries)) return null;
  const ledger = first(item.ledger, item.ledgerSequence, item.ledger_seq);
  const timestamp = first(item.timestamp, item.createdAt, item.time);
  return {
    id: String(first(item.id, item.snapshotId) ?? `${source}:snapshot:${index}`),
    label: String(first(item.label, item.name) ?? (typeof ledger === 'number' ? `Ledger ${ledger}` : `Snapshot ${index + 1}`)),
    ...(typeof ledger === 'number' ? { ledger } : {}),
    ...(typeof timestamp === 'string' ? { timestamp } : {}),
    entries: Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, safeValue(value, key)])),
    complete: item.complete !== false && item.partial !== true,
    source,
  };
}

function artifactRecords(document: unknown): { snapshots: unknown[]; mutations: unknown[] } {
  const root = asRecord(document);
  const data = asRecord(root.data);
  const snapshots = first(root.snapshots, root.stateSnapshots, data.snapshots, data.stateSnapshots);
  const mutations = first(root.mutations, root.stateChanges, root.events, data.mutations, data.stateChanges);
  return {
    snapshots: Array.isArray(snapshots) ? snapshots : [],
    mutations: Array.isArray(mutations) ? mutations : [],
  };
}

export function normalizeSnapshots(input: {
  runId: string;
  artifacts?: unknown[];
  ledgerChanges?: LedgerStateChange[];
}): StateInspectorData {
  const snapshots: StateSnapshot[] = [];
  const mutations: StateMutation[] = [];
  (input.artifacts ?? []).forEach((document, artifactIndex) => {
    const source = `artifact-${artifactIndex + 1}`;
    const records = artifactRecords(document);
    records.snapshots.forEach((raw, index) => {
      const snapshot = normalizeSnapshot(raw, index, source);
      if (snapshot) snapshots.push(snapshot);
    });
    records.mutations.forEach((raw, index) => {
      const mutation = normalizeMutation(raw, index, source);
      if (mutation) mutations.push(mutation);
    });
  });

  if (!mutations.length) {
    (input.ledgerChanges ?? []).forEach((change, index) => {
      const mutation = normalizeMutation({
        ...change,
        key: change.id,
        namespace: change.entryType,
        contractId: change.id.split(':')[0] ?? 'ledger',
        changeType: change.changeType,
        before: change.before ? parseValue(change.before) : undefined,
        after: change.after ? parseValue(change.after) : undefined,
      }, index, 'ledger-footprint');
      if (mutation) mutations.push(mutation);
    });
  }

  mutations.sort((a, b) => (a.ledger ?? Number.MAX_SAFE_INTEGER) - (b.ledger ?? Number.MAX_SAFE_INTEGER)
    || a.key.localeCompare(b.key) || a.id.localeCompare(b.id));

  if (!snapshots.length && mutations.length) {
    const state: Record<string, unknown> = {};
    snapshots.push({ id: 'initial', label: 'Initial state', entries: {}, complete: false, source: 'derived' });
    mutations.forEach((mutation, index) => {
      if (mutation.changeType === 'removed') delete state[mutation.key];
      else state[mutation.key] = mutation.after;
      snapshots.push({
        id: `mutation-${index + 1}`,
        label: mutation.ledger ? `Ledger ${mutation.ledger}` : `After ${index + 1} mutations`,
        ...(mutation.ledger !== undefined ? { ledger: mutation.ledger } : {}),
        ...(mutation.timestamp ? { timestamp: mutation.timestamp } : {}),
        entries: { ...state },
        complete: false,
        source: 'derived from mutation events',
      });
    });
  }

  snapshots.sort((a, b) => (a.ledger ?? Number.MAX_SAFE_INTEGER) - (b.ledger ?? Number.MAX_SAFE_INTEGER)
    || (a.timestamp ?? '').localeCompare(b.timestamp ?? '') || a.id.localeCompare(b.id));

  const artifactCount = input.artifacts?.length ?? 0;
  const status = snapshots.length && snapshots.every((snapshot) => snapshot.complete) && artifactCount
    ? 'complete' : snapshots.length || mutations.length ? 'partial' : 'unavailable';
  return {
    runId: input.runId,
    snapshots,
    mutations,
    quality: {
      status,
      artifactCount,
      message: status === 'complete'
        ? 'State snapshots were loaded from run artifacts.'
        : status === 'partial'
          ? 'Some state was reconstructed from mutation events or ledger footprints; missing history is not assumed unchanged.'
          : 'No state snapshots or mutation artifacts are available for this run.',
    },
  };
}

function parseValue(raw: string): unknown {
  try { return JSON.parse(raw) as unknown; } catch { return raw; }
}
