import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FuzzingRun } from '../app/types';

type ApiClientModule = typeof import('./api-client');

/**
 * `fetchRuns`/`fetchRun` route through `request-dedup`, whose in-flight map
 * lives in module scope. Reloading both modules per test keeps the suite
 * order-independent and stops a coalesced request from leaking across tests.
 */
async function loadModule(): Promise<ApiClientModule> {
  vi.resetModules();
  return import('./api-client');
}

function makeRun(overrides: Partial<FuzzingRun> = {}): FuzzingRun {
  return {
    id: 'run-1',
    contractName: 'token',
    status: 'completed',
    startedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as FuzzingRun;
}

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function requestedUrl(fetchMock: ReturnType<typeof vi.fn>, call = 0): string {
  return fetchMock.mock.calls[call][0] as string;
}

describe('api-client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('fetchRuns', () => {
    it('returns the runs payload from /api/runs', async () => {
      const { fetchRuns } = await loadModule();
      const payload = { runs: [makeRun(), makeRun({ id: 'run-2' })], total: 2 };
      fetchMock.mockResolvedValue(jsonResponse(payload));

      await expect(fetchRuns()).resolves.toEqual(payload);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(requestedUrl(fetchMock)).toBe('/api/runs');
    });

    it('handles an empty run list', async () => {
      const { fetchRuns } = await loadModule();
      fetchMock.mockResolvedValue(jsonResponse({ runs: [], total: 0 }));

      await expect(fetchRuns()).resolves.toEqual({ runs: [], total: 0 });
    });

    it('forwards the caller abort signal to fetch', async () => {
      const { fetchRuns } = await loadModule();
      fetchMock.mockResolvedValue(jsonResponse({ runs: [], total: 0 }));
      const controller = new AbortController();

      await fetchRuns(controller.signal);

      const forwarded = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;
      expect(forwarded.aborted).toBe(false);
      controller.abort();
      expect(forwarded.aborted).toBe(true);
    });

    it('coalesces concurrent callers into a single request', async () => {
      const { fetchRuns } = await loadModule();
      fetchMock.mockResolvedValue(jsonResponse({ runs: [makeRun()], total: 1 }));

      const [a, b, c] = await Promise.all([fetchRuns(), fetchRuns(), fetchRuns()]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(a).toEqual(b);
      expect(b).toEqual(c);
    });

    it.each([500, 502, 400])('rejects on a %i response', async (status) => {
      const { fetchRuns } = await loadModule();
      fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status }));

      await expect(fetchRuns()).rejects.toThrow(`HTTP ${status}`);
    });

    it('propagates a network failure', async () => {
      const { fetchRuns } = await loadModule();
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      // Network failures are wrapped in NetworkError by the dedup layer
      await expect(fetchRuns()).rejects.toThrow('Network error');
    });

    it('propagates a malformed JSON body', async () => {
      const { fetchRuns } = await loadModule();
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token <')),
      } as unknown as Response);

      // SyntaxError from JSON parsing is NOT a fetch rejection, propagates as-is
      await expect(fetchRuns()).rejects.toThrow('Unexpected token <');
    });

    it('recovers on a retry after a failed request', async () => {
      const { fetchRuns } = await loadModule();
      fetchMock.mockRejectedValueOnce(new Error('network down'));
      fetchMock.mockResolvedValueOnce(jsonResponse({ runs: [], total: 0 }));

      // With DEFAULT_FETCH_POLICY (maxAttempts=2), the first dedup call internally
      // retries and succeeds on attempt 2 — unlike the old no-retry behaviour
      // where two independent calls were needed.
      await expect(fetchRuns()).resolves.toEqual({ runs: [], total: 0 });
    });
  });

  describe('fetchRun', () => {
    it('returns the run for a known id', async () => {
      const { fetchRun } = await loadModule();
      const run = makeRun({ id: 'run-42' });
      fetchMock.mockResolvedValue(jsonResponse(run));

      await expect(fetchRun('run-42')).resolves.toEqual(run);
      expect(requestedUrl(fetchMock)).toBe('/api/runs/run-42');
    });

    it('returns null when the run does not exist', async () => {
      const { fetchRun } = await loadModule();
      fetchMock.mockResolvedValue(jsonResponse({ error: 'not found' }, { ok: false, status: 404 }));

      await expect(fetchRun('missing')).resolves.toBeNull();
    });

    it.each([
      ['run/with/slashes', '/api/runs/run%2Fwith%2Fslashes'],
      ['run?q=1', '/api/runs/run%3Fq%3D1'],
      ['run #1', '/api/runs/run%20%231'],
    ])('percent-encodes the id %s', async (id, expected) => {
      const { fetchRun } = await loadModule();
      fetchMock.mockResolvedValue(jsonResponse(makeRun()));

      await fetchRun(id);

      expect(requestedUrl(fetchMock)).toBe(expected);
    });

    it('forwards the caller abort signal to fetch', async () => {
      const { fetchRun } = await loadModule();
      fetchMock.mockResolvedValue(jsonResponse(makeRun()));
      const controller = new AbortController();

      await fetchRun('run-1', controller.signal);

      const forwarded = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;
      controller.abort();
      expect(forwarded.aborted).toBe(true);
    });

    it('coalesces concurrent callers for the same id', async () => {
      const { fetchRun } = await loadModule();
      fetchMock.mockResolvedValue(jsonResponse(makeRun()));

      await Promise.all([fetchRun('run-1'), fetchRun('run-1')]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not coalesce different ids', async () => {
      const { fetchRun } = await loadModule();
      fetchMock.mockImplementation((url: string) =>
        Promise.resolve(jsonResponse(makeRun({ id: url.split('/').pop() }))),
      );

      const [a, b] = await Promise.all([fetchRun('run-1'), fetchRun('run-2')]);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(a?.id).toBe('run-1');
      expect(b?.id).toBe('run-2');
    });

    it.each([400, 403, 500, 503])('rethrows a %i response instead of returning null', async (status) => {
      const { fetchRun } = await loadModule();
      fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status }));

      await expect(fetchRun('run-1')).rejects.toThrow(`HTTP ${status}`);
    });

    it('propagates a network failure', async () => {
      const { fetchRun } = await loadModule();
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(fetchRun('run-1')).rejects.toThrow('Network error');
    });

    it('accepts an empty id without dropping the path segment', async () => {
      const { fetchRun } = await loadModule();
      fetchMock.mockResolvedValue(jsonResponse({}, { ok: false, status: 404 }));

      await expect(fetchRun('')).resolves.toBeNull();
      expect(requestedUrl(fetchMock)).toBe('/api/runs/');
    });
  });

  describe('fetchLatestOnly', () => {
    it('automatically aborts older requests when called again', async () => {
      const { fetchLatestOnly } = await loadModule();

      const mockFetcher = vi.fn((query: string, signal: AbortSignal) => {
        return new Promise<string>((resolve, reject) => {
          const timer = setTimeout(() => resolve(`result:${query}`), 50);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const latestFetcher = fetchLatestOnly(mockFetcher);

      const promise1 = latestFetcher('query-1');
      const promise2 = latestFetcher('query-2');

      await expect(promise1).rejects.toThrow('The operation was aborted');
      await expect(promise2).resolves.toBe('result:query-2');
    });
  });

  describe('ApiError', () => {
    it('carries the status code and a readable name', async () => {
      const { ApiError } = await loadModule();
      const err = new ApiError(404, 'Run not found');

      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('ApiError');
      expect(err.status).toBe(404);
      expect(err.message).toBe('Run not found');
    });
  });
});
