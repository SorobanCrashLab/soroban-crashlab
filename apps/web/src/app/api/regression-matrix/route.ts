/**
 * /api/regression-matrix — Regression & Compatibility Matrix (#2329).
 *
 * GET  build a matrix from seeded runs (axes/metric query parameters).
 * POST compute regressions against a baseline or return a deterministic CSV export.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  buildMatrix,
  detectRegressions,
  exportMatrixCsv,
  isolateDimensions,
  type MatrixAxis,
  type MatrixMetric,
  type RunOutcome,
} from '@/features/regression-matrix/model';

export const dynamic = 'force-dynamic';

const AXES: MatrixAxis[] = ['version', 'environment', 'target', 'runner', 'seedSet'];

function outcome(id: string, version: string, environment: string, status: RunOutcome['status'], crashRate: number): RunOutcome {
  return {
    id,
    axes: { version, environment, target: 'wasm', runner: 'ci', seedSet: 's1' },
    status, crashRate,
    signatureIds: crashRate > 0 ? ['SIG-7'] : [],
    durationMs: 1100,
  };
}

const runs: RunOutcome[] = [
  outcome('r1', 'v1', 'testnet', 'pass', 0),
  outcome('r2', 'v1', 'mainnet', 'pass', 0),
  outcome('r3', 'v2', 'testnet', 'crash', 0.5),
  outcome('r4', 'v2', 'mainnet', 'pass', 0),
];
const baseline = runs.map((run) => ({ ...run, status: 'pass' as const, crashRate: 0, signatureIds: [] }));

function parseAxis(value: string | null, fallback: MatrixAxis): MatrixAxis {
  return AXES.includes(value as MatrixAxis) ? value as MatrixAxis : fallback;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const rowAxis = parseAxis(params.get('rowAxis'), 'version');
  const columnAxis = parseAxis(params.get('columnAxis'), 'environment');
  const metric = (params.get('metric') ?? 'crashRate') as MatrixMetric;
  const matrix = buildMatrix(runs, rowAxis, columnAxis, metric);
  const baselineMatrix = buildMatrix(baseline, rowAxis, columnAxis, metric);
  return NextResponse.json({
    matrix,
    regressions: detectRegressions(matrix, baselineMatrix),
    insights: isolateDimensions(runs, AXES),
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    format?: string; rowAxis?: MatrixAxis; columnAxis?: MatrixAxis; metric?: MatrixMetric;
  } | null;
  const matrix = buildMatrix(
    runs,
    parseAxis(body?.rowAxis ?? null, 'version'),
    parseAxis(body?.columnAxis ?? null, 'environment'),
    body?.metric ?? 'crashRate',
  );
  if (body?.format === 'csv') {
    return new NextResponse(exportMatrixCsv(matrix), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8' },
    });
  }
  return NextResponse.json({ matrix });
}
