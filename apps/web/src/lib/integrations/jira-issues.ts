/**
 * Jira Issue Link Adapter
 *
 * Resolves Jira issue links and fetches issue metadata from Jira REST API.
 * When credentials are not configured, falls back to building a canonical link.
 */

import { createAbortSignal } from './adapter-utils';
import { logger } from '../logger';

export interface ResolvedJiraLink {
  url: string;
  key: string;
}

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  assignee: string | null;
  url: string;
}

export interface CreateJiraIssueInput {
  summary: string;
  description?: string;
  projectKey?: string;
  issueType?: string;
}

/**
 * Builds a canonical Jira issue link without calling the API
 */
export async function resolveJiraIssueLink(baseUrl: string, issueKey: string): Promise<ResolvedJiraLink> {
  const base = baseUrl.replace(/\/$/, '');
  return { url: `${base}/browse/${issueKey}`, key: issueKey };
}

export interface JiraIssuesAdapterOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

async function createJiraIssueImpl(
  input: CreateJiraIssueInput,
  fetchImpl: typeof fetch,
  signal: AbortSignal | undefined,
): Promise<JiraIssue | null> {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  const projectKey = input.projectKey ?? process.env.JIRA_PROJECT_KEY;

  if (!baseUrl || !email || !apiToken) {
    logger.warn('Jira credentials not configured', { issueKey: undefined });
    return null;
  }

  const base = baseUrl.replace(/\/$/, '');
  const apiUrl = `${base}/rest/api/3/issue`;

  try {
    const authString = Buffer.from(`${email}:${apiToken}`).toString('base64');

    const response = await fetchImpl(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authString}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      signal,
      body: JSON.stringify({
        fields: {
          project: { key: projectKey ?? 'CRASH' },
          summary: input.summary,
          description: input.description ?? '',
          issuetype: { name: input.issueType ?? 'Task' },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Jira issue creation failed', { summary: input.summary, error: errorText });
      throw new Error(`Jira issue creation failed with ${response.status}`);
    }

    const data = await response.json();

    return {
      key: data.key,
      summary: data.fields?.summary || input.summary,
      status: data.fields?.status?.name || 'Unknown',
      assignee: data.fields?.assignee?.emailAddress || data.fields?.assignee?.displayName || null,
      url: `${base}/browse/${data.key}`,
    };
  } catch (error) {
    logger.error('Failed to create Jira issue', {
      summary: input.summary,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

async function fetchJiraIssueImpl(
  issueKey: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal | undefined,
): Promise<JiraIssue | null> {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !apiToken) {
    logger.warn('Jira credentials not configured', { issueKey });
    return null;
  }

  const base = baseUrl.replace(/\/$/, '');
  const apiUrl = `${base}/rest/api/3/issue/${issueKey}`;

  try {
    const authString = Buffer.from(`${email}:${apiToken}`).toString('base64');

    const response = await fetchImpl(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      signal,
    });

    if (response.status === 404) {
      logger.info('Jira issue not found', { issueKey });
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Jira API error', {
        issueKey,
        status: response.status,
        error: errorText,
      });
      throw new Error(`Jira API returned ${response.status}`);
    }

    const data = await response.json();

    return {
      key: data.key,
      summary: data.fields?.summary || 'No summary available',
      status: data.fields?.status?.name || 'Unknown',
      assignee: data.fields?.assignee?.emailAddress || data.fields?.assignee?.displayName || null,
      url: `${base}/browse/${data.key}`,
    };
  } catch (error) {
    logger.error('Failed to fetch Jira issue', {
      issueKey,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

export function createJiraIssuesAdapter(options: JiraIssuesAdapterOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal = createAbortSignal(options.timeoutMs);

  return {
    async createIssue(input: CreateJiraIssueInput): Promise<JiraIssue | null> {
      return createJiraIssueImpl(input, fetchImpl, signal);
    },

    async fetchIssue(issueKey: string): Promise<JiraIssue | null> {
      return fetchJiraIssueImpl(issueKey, fetchImpl, signal);
    },
  };
}


