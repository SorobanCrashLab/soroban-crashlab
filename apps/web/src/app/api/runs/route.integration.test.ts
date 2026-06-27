import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

describe('GET /api/runs', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  function makeRequest(queryString: string = ''): NextRequest {
    const url = queryString
      ? `http://localhost/api/runs?${queryString}`
      : 'http://localhost/api/runs';
    return new NextRequest(url, { method: 'GET' });
  }

  it('returns mock data when backend is not configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_MOCK_DATA', 'true');

    const request = makeRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await response.json() as Record<string, unknown>;
    expect(json).toHaveProperty('runs');
    expect(Array.isArray(json.runs)).toBe(true);
    expect(json).toHaveProperty('total');
  });

  it('returns mock data when mock data is explicitly enabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_MOCK_DATA', 'true');
    const request = makeRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await response.json() as Record<string, unknown>;
    expect(Array.isArray(json.runs)).toBe(true);
    expect((json.total as number) > 0).toBe(true);
  });

  it('returns error when mock data is disabled and no backend configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_MOCK_DATA', 'false');

    const request = makeRequest();
    const response = await GET(request);

    expect(response.status).toBe(503);
    const json = await response.json() as Record<string, unknown>;
    expect(json).toHaveProperty('error');
  });

  it('passes query parameters to backend', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ runs: [], total: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.example.com');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_MOCK_DATA', 'false');

    const request = makeRequest('limit=10&offset=0');
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('?limit=10&offset=0'),
      expect.any(Object),
    );

    fetchSpy.mockRestore();
  });

  it('returns 503 when backend is unavailable', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(
      new Error('Connection failed'),
    );

    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.example.com');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_MOCK_DATA', 'false');

    const request = makeRequest();
    const response = await GET(request);

    expect(response.status).toBe(503);
    const json = await response.json() as Record<string, unknown>;
    expect(json).toHaveProperty('error', 'Backend unavailable');

    fetchSpy.mockRestore();
  });

  it('falls back to mock data when backend returns non-ok status', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
      }),
    );

    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.example.com');
    vi.stubEnv('NEXT_PUBLIC_ENABLE_MOCK_DATA', 'true');

    const request = makeRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    const json = await response.json() as Record<string, unknown>;
    expect(Array.isArray(json.runs)).toBe(true);
  });
});
