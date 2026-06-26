import { NextRequest, NextResponse } from 'next/server';
import { readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';

export const POST = withRouteErrorHandling('POST /api/campaigns', async (request: NextRequest) => {
    const parsedBody = await readJsonBody(request);
    if ('error' in parsedBody) return parsedBody.error;

    const campaign = {
        id: `campaign-${Date.now()}`,
        status: 'queued',
        createdAt: new Date().toISOString(),
        ...(parsedBody.body as Record<string, unknown>),
    };

    return NextResponse.json({ campaign }, { status: 201 });
});
