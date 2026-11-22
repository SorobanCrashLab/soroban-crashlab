/**
 * Tests for Linear issues integration
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { resolveLinearIssueLink, createLinearIssuesAdapter } from './linear-issues';
import { logger } from '../logger';

// Mock the logger
vi.mock('../logger', () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('resolveLinearIssueLink', () => {
  it('builds correct URL from team and issue ID', async () => {
    const result = await resolveLinearIssueLink('crashlab', 'TEAM-123');

    expect(result.url).toBe('https://linear.app/crashlab/issue/TEAM-123');
    expect(result.id).toBe('TEAM-123');
  });
});

describe('fetchIssue via adapter', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns null when API key is not configured', async () => {
    delete process.env.LINEAR_API_KEY;

    const adapter = createLinearIssuesAdapter();
    const result = await adapter.fetchIssue('TEAM-123');

    expect(result).toBeNull();
    expect(logger.warn).toHaveBeenCalledWith('Linear API key not configured', { issueId: 'TEAM-123' });
  });

  it('returns structured issue data for successful GraphQL query', async () => {
    process.env.LINEAR_API_KEY = 'lin_api_key_123';

    const adapter = createLinearIssuesAdapter({
      fetchImpl: vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            data: {
              issue: {
                identifier: 'TEAM-123',
                title: 'Test issue title',
                state: { name: 'In Progress' },
                assignee: { email: 'assignee@example.com' },
                url: 'https://linear.app/team/issue/TEAM-123',
              },
            },
          }),
        } as Response),
      ),
    });

    const result = await adapter.fetchIssue('TEAM-123');

    expect(result).toEqual({
      identifier: 'TEAM-123',
      title: 'Test issue title',
      state: 'In Progress',
      assignee: 'assignee@example.com',
      url: 'https://linear.app/team/issue/TEAM-123',
    });
  });

  it('returns null when issue is not found (null data.issue)', async () => {
    process.env.LINEAR_API_KEY = 'lin_api_key_123';

    const adapter = createLinearIssuesAdapter({
      fetchImpl: vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            data: {
              issue: null,
            },
          }),
        } as Response),
      ),
    });

    const result = await adapter.fetchIssue('NONEXISTENT-999');

    expect(result).toBeNull();
    expect(logger.info).toHaveBeenCalledWith('Linear issue not found', { issueId: 'NONEXISTENT-999' });
  });

  it('throws error for GraphQL errors in response', async () => {
    process.env.LINEAR_API_KEY = 'lin_api_key_123';

    const adapter = createLinearIssuesAdapter({
      fetchImpl: vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            errors: [{ message: 'Invalid issue ID format' }],
            data: null,
          }),
        } as Response),
      ),
    });

    await expect(adapter.fetchIssue('INVALID')).rejects.toThrow('Linear GraphQL error');
    expect(logger.error).toHaveBeenCalledWith('Linear GraphQL errors', expect.any(Object));
  });

  it('throws error for HTTP errors', async () => {
    process.env.LINEAR_API_KEY = 'lin_api_key_123';

    const adapter = createLinearIssuesAdapter({
      fetchImpl: vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        } as Response),
      ),
    });

    await expect(adapter.fetchIssue('TEAM-123')).rejects.toThrow('Linear API returned 401');
    expect(logger.error).toHaveBeenCalledWith('Linear API error', expect.any(Object));
  });

  it('throws error when fetch fails', async () => {
    process.env.LINEAR_API_KEY = 'lin_api_key_123';

    const adapter = createLinearIssuesAdapter({
      fetchImpl: vi.fn(() => Promise.reject(new Error('Network error'))),
    });

    await expect(adapter.fetchIssue('TEAM-123')).rejects.toThrow('Network error');
    expect(logger.error).toHaveBeenCalledWith('Failed to fetch Linear issue', expect.any(Object));
  });

  it('handles missing fields in GraphQL response', async () => {
    process.env.LINEAR_API_KEY = 'lin_api_key_123';

    const adapter = createLinearIssuesAdapter({
      fetchImpl: vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            data: {
              issue: {
                identifier: 'TEAM-123',
                url: 'https://linear.app/team/issue/TEAM-123',
              },
            },
          }),
        } as Response),
      ),
    });

    const result = await adapter.fetchIssue('TEAM-123');

    expect(result).toEqual({
      identifier: 'TEAM-123',
      title: 'No title available',
      state: 'Unknown',
      assignee: null,
      url: 'https://linear.app/team/issue/TEAM-123',
    });
  });

  it('handles issue without assignee', async () => {
    process.env.LINEAR_API_KEY = 'lin_api_key_123';

    const adapter = createLinearIssuesAdapter({
      fetchImpl: vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            data: {
              issue: {
                identifier: 'TEAM-123',
                title: 'Unassigned issue',
                state: { name: 'Backlog' },
                assignee: null,
                url: 'https://linear.app/team/issue/TEAM-123',
              },
            },
          }),
        } as Response),
      ),
    });

    const result = await adapter.fetchIssue('TEAM-123');

    expect(result?.assignee).toBeNull();
    expect(result?.state).toBe('Backlog');
  });
});