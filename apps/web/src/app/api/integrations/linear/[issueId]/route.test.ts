/**
 * Tests for Linear issue API route
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';
import { createLinearIssuesAdapter } from '@/lib/integrations/linear-issues';

vi.mock('@/lib/integrations/linear-issues', () => ({
  createLinearIssuesAdapter: vi.fn(),
}));

describe('GET /api/integrations/linear/[issueId]', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 400 for empty issue ID', async () => {
    const request = new Request('http://localhost/api/integrations/linear/');
    const context = { params: Promise.resolve({ issueId: '' }) };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('required');
  });

  it('returns 200 with issue data when issue is found', async () => {
    const mockIssue = {
      identifier: 'TEAM-123',
      title: 'Test issue',
      state: 'In Progress',
      assignee: 'test@example.com',
      url: 'https://linear.app/team/issue/TEAM-123',
    };

    const mockAdapter = { fetchIssue: vi.fn().mockResolvedValue(mockIssue) };
    vi.mocked(createLinearIssuesAdapter).mockReturnValue(mockAdapter as unknown as ReturnType<typeof createLinearIssuesAdapter>);

    const request = new Request('http://localhost/api/integrations/linear/TEAM-123');
    const context = { params: Promise.resolve({ issueId: 'TEAM-123' }) };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.issue).toEqual(mockIssue);
    expect(mockAdapter.fetchIssue).toHaveBeenCalledWith('TEAM-123');
  });

  it('returns 404 when issue is not found', async () => {
    const mockAdapter = { fetchIssue: vi.fn().mockResolvedValue(null) };
    vi.mocked(createLinearIssuesAdapter).mockReturnValue(mockAdapter as unknown as ReturnType<typeof createLinearIssuesAdapter>);

    const request = new Request('http://localhost/api/integrations/linear/NONEXISTENT-999');
    const context = { params: Promise.resolve({ issueId: 'NONEXISTENT-999' }) };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('not found');
  });

  it('returns 500 when fetchIssue throws error', async () => {
    const mockAdapter = { fetchIssue: vi.fn().mockRejectedValue(new Error('GraphQL Error')) };
    vi.mocked(createLinearIssuesAdapter).mockReturnValue(mockAdapter as unknown as ReturnType<typeof createLinearIssuesAdapter>);

    const request = new Request('http://localhost/api/integrations/linear/TEAM-123');
    const context = { params: Promise.resolve({ issueId: 'TEAM-123' }) };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain('Failed to fetch Linear issue');
  });

  it('handles issue ID with special characters', async () => {
    const mockIssue = {
      identifier: 'TEAM-123',
      title: 'Test',
      state: 'Todo',
      assignee: null,
      url: 'https://linear.app/team/issue/TEAM-123',
    };

    const mockAdapter = { fetchIssue: vi.fn().mockResolvedValue(mockIssue) };
    vi.mocked(createLinearIssuesAdapter).mockReturnValue(mockAdapter as unknown as ReturnType<typeof createLinearIssuesAdapter>);

    const request = new Request('http://localhost/api/integrations/linear/TEAM-123');
    const context = { params: Promise.resolve({ issueId: 'TEAM-123' }) };

    const response = await GET(request, context);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.issue.identifier).toBe('TEAM-123');
  });
});