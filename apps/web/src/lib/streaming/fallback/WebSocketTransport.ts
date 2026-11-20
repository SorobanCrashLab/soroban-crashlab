/**
 * WebSocket transport for the fallback chain (#2191).
 *
 * Uses the native WebSocket API when available. Falls back gracefully
 * when WebSocket is not supported (e.g. corporate proxies blocking WS).
 */

export interface WebSocketTransportOptions {
  url: string;
  onMessage?: (data: string) => void;
  onError?: (error: Event) => void;
  onClose?: () => void;
}

export class WebSocketTransport {
  private ws: WebSocket | null = null;
  private url: string;
  private onMessage?: (data: string) => void;
  private onError?: (error: Event) => void;
  private onClose?: () => void;

  constructor(options: WebSocketTransportOptions) {
    this.url = options.url;
    this.onMessage = options.onMessage;
    this.onError = options.onError;
    this.onClose = options.onClose;
  }

  static isAvailable(): boolean {
    return typeof WebSocket !== 'undefined' || typeof globalThis.WebSocket !== 'undefined';
  }

  connect(): void {
    if (!WebSocketTransport.isAvailable()) {
      this.onError?.(new Event('error'));
      return;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        // Connection established.
      };

      this.ws.onmessage = (event: MessageEvent) => {
        this.onMessage?.(event.data as string);
      };

      this.ws.onerror = (error: Event) => {
        this.onError?.(error);
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.onClose?.();
      };
    } catch (err) {
      this.onError?.(new Event('error'));
    }
  }

  send(data: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  close(): void {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}
