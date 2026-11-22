/**
 * Linear Issue Link Adapter
 *
 * Resolves Linear issue links and fetches issue metadata from Linear GraphQL API.
 * When credentials are not configured, falls back to building a canonical link.
 */

import { createAbortSignal } from './adapter-utils';
import { logger } from '../logger';

export interface ResolvedLinearLink {
  url: string;
  id: string;
}

export interface ParsedLinearIssueUrl {
  team: string;
  issueId: string;
}

export interface LinearIssue {
  identifier: string;
  title: string;
  state: string;
  assignee: string | null;
  url: string;
}

/**
 * Parses a Linear issue URL into its team and issue ID parts.
 * Returns null if the URL isn't a recognizable Linear issue link.
 */
export function parseLinearIssueUrl(url: string): ParsedLinearIssueUrl | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.hostname !== 'linear.app' && parsed.hostname !== 'www.linear.app') {
    return null;
  }

  const match = parsed.pathname.match(/^\/([^/]+)\/issue\/([^/]+)\/?$/);
  if (!match) return null;

  const [, team, issueId] = match;
  if (!team || !issueId) return null;

  return { team, issueId };
}

/**
 * Builds a canonical Linear issue link without calling the API
 */
export async function resolveLinearIssueLink(team: string, issueId: string): Promise<ResolvedLinearLink> {
  return { url: `https://linear.app/${team}/issue/${issueId}`, id: issueId };
}

/**
 * Resolves a Linear issue URL to its metadata via the GraphQL API.
 * Returns null if the URL isn't a Linear issue link or resolution fails.
 */
export async function resolveLinearIssueFromUrl(url: string): Promise<ResolvedLinearLink | null> {
  const parsed = parseLinearIssueUrl(url);
  if (!parsed) return null;
  return resolveLinearIssueLink(parsed.team, parsed.issueId);
}

export interface LinearIssuesAdapterOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

async function fetchLinearIssueImpl(
  issueId: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal | undefined,
): Promise<LinearIssue | null> {
  const apiKey = process.env.LINEAR_API_KEY;

  if (!apiKey) {
    logger.warn('Linear API key not configured', { issueId });
    return null;
  }

  const apiUrl = 'https://api.linear.app/graphql';

  const query = `
    query($issueId: String!) {
      issue(id: $issueId) {
        identifier
        title
        state {
          name
        }
        assignee {
          email
        }
        url
      }
    }
  `;

  try {
    const response = await fetchImpl(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        query,
        variables: { issueId },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Linear API error', {
        issueId,
        status: response.status,
        error: errorText,
      });
      throw new Error(`Linear API returned ${response.status}`);
    }

    const data = await response.json();

    if (data.errors && data.errors.length > 0) {
      logger.error('Linear GraphQL errors', {
        issueId,
        errors: data.errors,
      });
      throw new Error(`Linear GraphQL error: ${data.errors[0].message}`);
    }

    if (!data.data || !data.data.issue) {
      logger.info('Linear issue not found', { issueId });
      return null;
    }

    const issue = data.data.issue;

    return {
      identifier: issue.identifier,
      title: issue.title || 'No title available',
      state: issue.state?.name || 'Unknown',
      assignee: issue.assignee?.email || null,
      url: issue.url,
    };
  } catch (error) {
    logger.error('Failed to fetch Linear issue', {
      issueId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

export function createLinearIssuesAdapter(options: LinearIssuesAdapterOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal = createAbortSignal(options.timeoutMs);

  return {
    async fetchIssue(issueId: string): Promise<LinearIssue | null> {
      return fetchLinearIssueImpl(issueId, fetchImpl, signal);
    },
  };
}


