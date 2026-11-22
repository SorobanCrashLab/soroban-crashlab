/** SSE parsing and reconnect backoff for live metric streams (#2206). */

export interface SSEEvent {
  event?: string;
  data: string;
  id?: string;
}

/** Parse complete SSE frames from a buffer; keep the incomplete tail. */
export function parseSSEChunk(buffer: string, chunk: string): { events: SSEEvent[]; remainder: string } {
  const text = buffer + chunk;
  const frames = text.split(/\r?\n\r?\n/);
  const remainder = frames.pop() ?? '';
  const events: SSEEvent[] = [];
  for (const frame of frames) {
    let event: string | undefined;
    let id: string | undefined;
    const data: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('id:')) id = line.slice(3).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (data.length > 0) events.push({ data: data.join('\n'), ...(event ? { event } : {}), ...(id ? { id } : {}) });
  }
  return { events, remainder };
}

/** Exponential reconnect backoff with jitter-free cap (deterministic). */
export function reconnectDelay(attempt: number, baseMs = 500, maxMs = 30_000): number {
  const exponent = Math.max(0, Math.min(attempt, 10));
  return Math.min(maxMs, baseMs * 2 ** exponent);
}

/** Parse a metric payload emitted by the live metrics API. */
export function parseMetricEvent(raw: string): { campaignId: string; metric: string; value: number } | undefined {
  try {
    const parsed = JSON.parse(raw) as { campaignId?: unknown; metric?: unknown; value?: unknown };
    if (
      typeof parsed.campaignId !== 'string' ||
      typeof parsed.metric !== 'string' ||
      typeof parsed.value !== 'number' ||
      !Number.isFinite(parsed.value)
    ) {
      return undefined;
    }
    return { campaignId: parsed.campaignId, metric: parsed.metric, value: parsed.value };
  } catch {
    return undefined;
  }
}
