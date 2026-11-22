import { NextRequest, NextResponse } from 'next/server';
import { selectRunStorageDriver } from '@/lib/storage';
import { buildLedgerChangesForRun } from '@/app/mock-ledger-changes';
import { normalizeSnapshots } from '@/lib/state/normalizeSnapshots';
import { withRouteErrorHandling } from '@/lib/route-handler';

export const GET = withRouteErrorHandling(
  'GET /api/runs/[id]/state',
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    if (!id || id.length > 200) {
      return NextResponse.json({ error: 'A valid run id is required.' }, { status: 400 });
    }
    const driver = selectRunStorageDriver();
    const run = await driver.getRun(id);
    if (!run) return NextResponse.json({ error: 'Run not found.' }, { status: 404 });

    const artifactDocuments: unknown[] = [];
    for (const artifact of (run.artifacts ?? []).filter((item) => ['trace', 'bundle', 'log'].includes(item.type))) {
      const stored = await driver.getArtifact(artifact.id);
      if (!stored) continue;
      const raw = new TextDecoder().decode(stored.bytes);
      try {
        artifactDocuments.push(JSON.parse(raw) as unknown);
      } catch {
        // Non-JSON artifacts remain discoverable in run metadata but cannot be parsed as snapshots.
      }
    }

    const data = normalizeSnapshots({
      runId: run.id,
      artifacts: artifactDocuments,
      ledgerChanges: buildLedgerChangesForRun(run),
    });
    return NextResponse.json({ data }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  },
);
