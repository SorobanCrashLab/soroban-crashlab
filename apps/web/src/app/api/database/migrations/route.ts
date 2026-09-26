import { NextResponse } from 'next/server';
import { createMigrationRunner } from '@/lib/database/migrations';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const runner = createMigrationRunner();
    const { state, pending } = await runner.status();
    return NextResponse.json({
      schemaVersion: state.schemaVersion,
      applied: state.applied,
      pending: pending.map((m) => ({ id: m.id, name: m.name })),
      kvRevisions: state.kvRevisions,
    });
  } catch (error) {
    return NextResponse.json(
      {
        schemaVersion: -1,
        applied: [],
        pending: [],
        kvRevisions: {},
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    const runner = createMigrationRunner();
    const state = await runner.up({ driver: 'sqlite' });
    const { pending } = await runner.status();
    return NextResponse.json({
      schemaVersion: state.schemaVersion,
      applied: state.applied,
      pending: pending.map((m) => ({ id: m.id, name: m.name })),
      kvRevisions: state.kvRevisions,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
