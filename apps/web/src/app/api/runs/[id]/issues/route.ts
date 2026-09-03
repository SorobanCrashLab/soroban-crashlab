import { NextRequest } from 'next/server';
import { buildMockRuns } from '@/app/mockRuns';
import type { RunIssueLink } from '@/app/types';
import { getIssueStore } from '@/app/api/mock-store';
import { tryBackend } from '@/lib/api-proxy';
import { jsonError, readJsonBody, withRouteErrorHandling } from '@/lib/route-handler';
import { successResponse, createdResponse } from '@/lib/api-response-utils';

const ISSUES_API_URL = process.env.ISSUES_API_URL || process.env.NEXT_PUBLIC_API_URL;

const issueStore = getIssueStore<RunIssueLink>();

function getIssues(id: string): RunIssueLink[] {
  if (issueStore.has(id)) {
    return issueStore.get(id)!;
  }
  const run = buildMockRuns().find((r) => r.id === id);
  const initial = run?.associatedIssues ?? [];
  issueStore.set(id, [...initial]);
  return issueStore.get(id)!;
}

export const GET = withRouteErrorHandling(
  'GET /api/runs/[id]/issues',
  async (_request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    return tryBackend(ISSUES_API_URL, `/runs/${id}/issues`, {}, async () => {
      const run = buildMockRuns().find((r) => r.id === id);
      if (!run) {
        return jsonError('Run not found', 404);
      }
      return successResponse({ runId: id, issues: getIssues(id) });
    });
  },
);

export const POST = withRouteErrorHandling(
  'POST /api/runs/[id]/issues',
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const run = buildMockRuns().find((r) => r.id === id);
    if (!run) {
      return jsonError('Run not found', 404);
    }

    const parsedBody = await readJsonBody(request);
    if ('error' in parsedBody) return parsedBody.error;

    const { label, href } = (parsedBody.body ?? {}) as Record<string, unknown>;

    if (typeof label !== 'string' || !label.trim()) {
      return jsonError('label is required', 400);
    }

    if (typeof href !== 'string') {
      return jsonError('href is required', 400);
    }

    try {
      const parsed = new URL(href);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return jsonError('href must use http or https', 400);
      }
    } catch {
      return jsonError('href is not a valid URL', 400);
    }

    const issues = getIssues(id);

    if (issues.some((link) => link.href === href)) {
      return jsonError('Issue link already exists', 409);
    }

    const newLink: RunIssueLink = { label: label.trim(), href };
    issues.push(newLink);

    return createdResponse({ runId: id, issues });
  },
);

export const DELETE = withRouteErrorHandling(
  'DELETE /api/runs/[id]/issues',
  async (request: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const run = buildMockRuns().find((r) => r.id === id);
    if (!run) {
      return jsonError('Run not found', 404);
    }

    const parsedBody = await readJsonBody(request);
    if ('error' in parsedBody) return parsedBody.error;

    const { href } = (parsedBody.body ?? {}) as Record<string, unknown>;
    if (typeof href !== 'string') {
      return jsonError('href is required', 400);
    }

    const issues = getIssues(id);
    const index = issues.findIndex((link) => link.href === href);
    if (index === -1) {
      return jsonError('Issue link not found', 404);
    }

    issues.splice(index, 1);
    return successResponse({ runId: id, issues });
  },
);
