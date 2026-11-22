/**
 * /api/contracts/storage — Contract Storage Layout Explorer (#2327).
 *
 * GET  list snapshots (filter: contractId, campaignId) or a snapshot's entries.
 * POST ingest a snapshot and return deterministic decoding + analytics.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  analyzeAccessPatterns,
  buildHeatmap,
  buildKeyspaceTree,
  decodeValue,
  diffSnapshots,
  redactEntry,
  summarizeKeyspace,
  type HeatMetric,
  type StorageEntry,
  type StorageSnapshot,
} from '@/features/storage-explorer/model';

export const dynamic = 'force-dynamic';

const store: { snapshots: StorageSnapshot[]; seq: number } = {
  snapshots: [],
  seq: 0,
};

function materialise(entries: StorageEntry[]): StorageEntry[] {
  return entries.map((entry) => {
    const decoded = decodeValue(entry.raw, entry.decodedType === 'unknown' ? undefined : entry.decodedType);
    return { ...entry, decodedType: decoded.type, decodedValue: decoded.value, confidence: decoded.confidence };
  });
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const contractId = params.get('contractId');
  const snapshotId = params.get('snapshotId');
  const metric = (params.get('metric') ?? 'reads') as HeatMetric;
  const reveal = params.get('reveal') === 'true';
  const ledger = Number(params.get('ledger') ?? Number.MAX_SAFE_INTEGER);

  let snapshots = store.snapshots;
  if (contractId) snapshots = snapshots.filter((item) => item.contractId === contractId);
  const snapshot = snapshotId
    ? snapshots.find((item) => item.id === snapshotId)
    : snapshots[snapshots.length - 1];

  if (!snapshot) {
    return NextResponse.json({ snapshots: snapshots.map((item) => ({ id: item.id, contractId: item.contractId })) });
  }

  const entries = snapshot.entries.map((entry) => redactEntry(entry, reveal));
  return NextResponse.json({
    snapshot: { id: snapshot.id, contractId: snapshot.contractId, ledger: snapshot.ledger },
    tree: buildKeyspaceTree(entries),
    heatmap: buildHeatmap(entries, metric),
    anomalies: analyzeAccessPatterns(entries, [], Number.isFinite(ledger) ? ledger : Number.MAX_SAFE_INTEGER),
    summary: summarizeKeyspace(entries),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    contractId?: string;
    campaignId?: string | null;
    ledger?: number;
    entries?: StorageEntry[];
    compareWith?: string;
  } | null;

  if (!body?.contractId || !Array.isArray(body.entries)) {
    return NextResponse.json({ error: 'contractId and entries are required' }, { status: 400 });
  }

  store.seq += 1;
  const snapshot: StorageSnapshot = {
    id: `snap-${store.seq}`,
    contractId: body.contractId,
    campaignId: body.campaignId ?? null,
    ledger: body.ledger ?? 0,
    capturedAt: new Date().toISOString(),
    entries: materialise(body.entries),
  };
  store.snapshots.push(snapshot);

  const previous = body.compareWith
    ? store.snapshots.find((item) => item.id === body.compareWith)
    : store.snapshots[store.snapshots.length - 2];

  return NextResponse.json({
    snapshot,
    diff: previous ? diffSnapshots(previous, snapshot) : [],
  }, { status: 201 });
}
