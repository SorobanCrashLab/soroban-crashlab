// WIP scaffold for issue #2274. In-memory only; no persistence or aggregation yet.

export interface ShareAccessEvent {
  token: string;
  accessedAt: string;
  referrer?: string;
}

const accessLog: ShareAccessEvent[] = [];

export function recordAccess(event: ShareAccessEvent): void {
  accessLog.push(event);
}

export function getAccessLog(token: string): ShareAccessEvent[] {
  return accessLog.filter((event) => event.token === token);
}
