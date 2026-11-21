/**
 * Export jobs API (issue #2264 Phase 1).
 * 
 * POST /api/exports - Create new export job
 * GET /api/exports - List jobs
 */

import { NextRequest, NextResponse } from 'next/server';
import { exportJobsStore, type ExportFormat } from '@/lib/storage/export-jobs-store';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const { format, entity, filters, columns } = body;
    
    if (!format || !entity) {
      return NextResponse.json(
        { error: 'format and entity are required' },
        { status: 400 }
      );
    }

    const job = exportJobsStore.create({
      format: format as ExportFormat,
      entity,
      filters: filters || {},
      columns,
    });

    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create export job' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const jobs = exportJobsStore.list();
    return NextResponse.json({ jobs });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}
