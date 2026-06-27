/**
 * Coalesces concurrent GET requests to the same URL into a single network
 * call. Several routes (dashboard, runs list, trends, triage, analytics)
 * independently fetch `/api/runs` on mount, which previously produced
 * duplicate in-flight requests whenever more than one of them rendered at
 * the same time. Callers awaiting the same URL while a request is already
 * in flight share that request's parsed JSON result instead of issuing a
 * new fetch.
 */

const inFlightRequests = new Map<string, Promise<unknown>>();

export function dedupedFetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const existing = inFlightRequests.get(url);
  if (existing) return existing as Promise<T>;

  const request = fetch(url, { signal })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<T>;
    })
    .finally(() => {
      inFlightRequests.delete(url);
    });

  inFlightRequests.set(url, request);
  return request;
}
