import { NextRequest } from 'next/server';
import { createRouteHandler } from 'uploadthing/next';
import { toStandardUploadRejection } from '@/lib/artifact-ingestion';
import { crashlabFileRouter } from './core';

const handlers = createRouteHandler({
  router: crashlabFileRouter,
});

export const GET = handlers.GET;

/** Ingestion-gate rejections leave as the standard 422 envelope (#1636). */
export async function POST(request: NextRequest): Promise<Response> {
  return toStandardUploadRejection(await handlers.POST(request));
}
