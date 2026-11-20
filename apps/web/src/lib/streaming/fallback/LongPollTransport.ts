/**
 * Long-polling transport — last resort fallback (#2191).
 *
 * Polls the server at a fixed interval when neither SSE nor WebSocket
 * are available. Handles 304 Not Modified efficiently by skipping
 * processing on empty responses.
 */

export interface LongPollTransportOptions {
  url: string;
  intervalMs?: number;
  onMessage?: (data: string) => void;
  onError?: (error: Error) => void;
}

export class LongPollTransport {
  private url: string;
  private interval: number;
  private onMessage?: (data: string) => void;
  private onError?: (error: Error) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSeq = 0;
  private polling = false;

  constructor(options: LongPollTransportOptions) {
    this.url = options.url;
    this.interval = options.intervalMs ?? 15_000;
    this.onMessage = options.onMessage;
    this.onError = options.onError;
  }

  start(): void {
    if (this.timer) return;
    this.poll();
    this.timer = setInterval(() => void this.poll(), this.interval);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;

    try {
      const url = this.url + (this.url.includes('?') ? '&' : '?') + `after=${this.lastSeq}`;
      const response = await fetch(url);

      if (response.status === 304) {
        // No new data; skip.
        return;
      }

      if (!response.ok) {
        this.onError?.(new Error(`Polling failed: ${response.status}`));
        return;
      }

      const data = await response.text();
      if (data) {
        // Parse and update lastSeq from envelope.
        try {
          const parsed = JSON.parse(data);
          if (parsed.seq && typeof parsed.seq === 'number') {
            this.lastSeq = Math.max(this.lastSeq, parsed.seq);
          }
        } catch {
          // Might be multiple events; still pass to handler.
        }
        this.onMessage?.(data);
      }
    } catch (err) {
      // Network errors are expected; keep polling.
    } finally {
      this.polling = false;
    }
  }

  setLastSeq(seq: number): void {
    this.lastSeq = seq;
  }
}
