/**
 * GET /api/integrations/github-issue?url=<github issue url>
 *
 * Resolves a GitHub issue URL to its real title/state via GitHub's public
 * REST API, for use by the "Run Issue Links" UI. Runs server-side so the
 * browser never has to make a cross-origin call directly and so repeated
 * lookups from many clients share GitHub's public (unauthenticated) rate
 * limit sensibly rather than each browser session burning its own.
 *
 * Never requires a token: unauthenticated reads of public repository
 * issues are all this needs. If resolution fails for any reason (private
 * repo, deleted issue, rate limited, network error), this returns a 200
 * with `resolved: false` and a placeholder title rather than an error
 * status, since "couldn't get a nicer title" isn't a failure of the
 * request itself.
 */

import { NextRequest } from 'next/server';
import { parseGithubIssueUrl, createGithubIssuesAdapter } from '@/lib/integrations/github-issues';
import { successResponse } from '@/lib/api-response-utils';
import { jsonError, withRouteErrorHandling } from '@/lib/route-handler';
import { sanitizeSearchParams, sanitizeUrl } from '@/lib/sanitize';

export const GET = withRouteErrorHandling(
  'GET /api/integrations/github-issue',
  async (request: NextRequest) => {
    const sanitized = sanitizeSearchParams(request.nextUrl.searchParams);
    const rawUrl = sanitized.get('url');
    const url = rawUrl ? sanitizeUrl(rawUrl) : null;

    if (!url) {
      return jsonError('Query parameter "url" is required.', 400);
    }

    const parsed = parseGithubIssueUrl(url);
    if (!parsed) {
      return jsonError('Not a recognizable GitHub issue or pull request URL.', 400);
    }

    const adapter = createGithubIssuesAdapter();
    const issue = await adapter.resolveIssueLink(parsed.owner, parsed.repo, parsed.issueNumber);
    return successResponse({ issue });
  },
);
