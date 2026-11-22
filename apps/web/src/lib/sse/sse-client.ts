/**
 * SSE (Server-Sent Events) client with reconnection and backoff (issue #2262 Phase 3).
 * 
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Last-Event-ID resume support
 * - Type-safe event handling
 * - Connection state management
 */

export type SSEConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SSEClientOptions {
  url: string;
  onMessage?: (event: MessageEvent) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
  reconnectInterval?: number;
  maxReconnectInterval?: number;
  reconnectDecay?: number;
}

export class SSEClient {
  private eventSource: EventSource | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private currentReconnectInterval: number;
  private lastEventId: string | null = null;
  private state: SSEConnectionState = 'disconnected';
  private options: Required<SSEClientOptions>;

  constructor(options: SSEClientOptions) {
    this.options = {
      reconnectInterval: 1000,
      maxReconnectInterval: 30000,
      reconnectDecay: 1.5,
      onMessage: () => {},
      onError: () => {},
      onOpen: () => {},
      ...options,
    };
    this.currentReconnectInterval = this.options.reconnectInterval;
  }

  connect(): void {
    if (this.state === 'connected' || this.state === 'connecting') return;
    
    this.state = 'connecting';
    
    const url = new URL(this.options.url);
    if (this.lastEventId) {
      url.searchParams.set('lastEventId', this.lastEventId);
    }

    try {
      this.eventSource = new EventSource(url.toString());
      
      this.eventSource.onopen = () => {
        this.state = 'connected';
        this.currentReconnectInterval = this.options.reconnectInterval;
        this.options.onOpen();
      };

      this.eventSource.onmessage = (event) => {
        if (event.lastEventId) {
          this.lastEventId = event.lastEventId;
        }
        this.options.onMessage(event);
      };

      this.eventSource.onerror = (error) => {
        this.state = 'error';
        this.options.onError(error);
        this.scheduleReconnect();
      };
    } catch (error) {
      this.state = 'error';
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.state = 'disconnected';
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  getState(): SSEConnectionState {
    return this.state;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    
    this.disconnect();
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.currentReconnectInterval);

    this.currentReconnectInterval = Math.min(
      this.currentReconnectInterval * this.options.reconnectDecay,
      this.options.maxReconnectInterval
    );
  }
}
