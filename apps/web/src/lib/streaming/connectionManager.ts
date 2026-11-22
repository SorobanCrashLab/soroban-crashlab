/**
 * Singleton connection manager for SSE connections (#2191).
 *
 * Enforces max 1 SSE connection per origin (EventSource singleton pattern),
 * tracks health state, and handles reconnection with exponential backoff
 * (1s, 2s, 4s, 8s, max 30s).
 */

export type ConnectionHealth = 'connected' | 'reconnecting' | 'disconnected';

export type HealthCallback = (health: ConnectionHealth) => void;

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const MAX_RETRIES = 3;

class ConnectionManagerImpl {
  private health: ConnectionHealth = 'disconnected';
  private callbacks: Set<HealthCallback> = new Set();
  private eventSource: EventSource | null = null;
  private currentUrl: string | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = INITIAL_BACKOFF_MS;
  private fallbackToPolling = false;

  getHealth(): ConnectionHealth {
    return this.health;
  }

  subscribe(callback: HealthCallback): () => void {
    this.callbacks.add(callback);
    callback(this.health);
    return () => {
      this.callbacks.delete(callback);
    };
  }

  private setHealth(health: ConnectionHealth) {
    if (this.health === health) return;
    this.health = health;
    for (const cb of this.callbacks) {
      cb(health);
    }
  }

  connect(url: string, onMessage: (event: MessageEvent) => void): void {
    this.disconnect();
    this.currentUrl = url;
    this.reconnectAttempts = 0;
    this.backoff = INITIAL_BACKOFF_MS;
    this.fallbackToPolling = false;
    this.openConnection(onMessage);
  }

  private openConnection(onMessage: (event: MessageEvent) => void): void {
    if (!this.currentUrl) return;
    if (typeof EventSource === 'undefined') {
      this.setHealth('disconnected');
      this.fallbackToPolling = true;
      return;
    }

    this.setHealth('reconnecting');
    const source = new EventSource(this.currentUrl);
    this.eventSource = source;

    source.onopen = () => {
      this.reconnectAttempts = 0;
      this.backoff = INITIAL_BACKOFF_MS;
      this.setHealth('connected');
    };

    source.onmessage = onMessage;

    source.onerror = () => {
      source.close();
      this.eventSource = null;
      this.reconnectAttempts++;

      if (this.reconnectAttempts >= MAX_RETRIES) {
        this.fallbackToPolling = true;
        this.setHealth('disconnected');
        return;
      }

      this.setHealth('reconnecting');
      this.reconnectTimer = setTimeout(() => {
        this.openConnection(onMessage);
      }, this.backoff);
      this.backoff = Math.min(this.backoff * 2, MAX_BACKOFF_MS);
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.currentUrl = null;
    this.reconnectAttempts = 0;
    this.backoff = INITIAL_BACKOFF_MS;
    this.setHealth('disconnected');
  }

  shouldFallbackToPolling(): boolean {
    return this.fallbackToPolling;
  }

  forceReconnect(onMessage: (event: MessageEvent) => void): void {
    this.reconnectAttempts = 0;
    this.backoff = INITIAL_BACKOFF_MS;
    this.fallbackToPolling = false;
    if (this.currentUrl) {
      this.openConnection(onMessage);
    }
  }
}

export const connectionManager = new ConnectionManagerImpl();
