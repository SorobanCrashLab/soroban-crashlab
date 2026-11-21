/**
 * SSE client with fallback chain: SSE -> WebSocket -> Long-polling (#2191).
 *
 * Tries SSE first (most efficient for unidirectional server push).
 * Falls back to WebSocket if SSE fails 3x (if the proxy supports WS upgrades).
 * Falls back to long-polling (15s interval) as a last resort.
 */

import { connectionManager, type ConnectionHealth } from './connectionManager';
import type { AllEventTypes as _AllEventTypes, StreamEventType, StreamEnvelope } from './eventTypes';
import { selectBestTransport, type TransportType } from './fallback/transportFactory';

type EventCallback = (envelope: StreamEnvelope) => void;
type HealthCallback = (health: ConnectionHealth) => void;

const POLL_INTERVAL_MS = 15_000;

export class RunEventStream {
  private listeners: Map<StreamEventType, Set<EventCallback>> = new Map();
  private healthCallbacks: Set<HealthCallback> = new Set();
  private lastSeq = 0;
  private campaignId: string | null = null;
  private runId: string | null = null;
  private connected = false;
  private transportType: TransportType | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private transport: { close: () => void; onMessage: ((msg: string) => void) | null } | null = null;

  constructor(runId?: string, options?: { campaignId?: string }) {
    this.runId = runId ?? null;
    this.campaignId = options?.campaignId ?? null;
  }

  connect(): void {
    const url = this.buildURL();
    const bestType = selectBestTransport();
    this.transportType = bestType;

    if (bestType === 'sse') {
      this.connectSSE(url);
    } else if (bestType === 'websocket') {
      this.connectWebSocket(url);
    } else {
      this.connectLongPolling(url);
    }
  }

  private buildURL(): string {
    const params = new URLSearchParams();
    if (this.runId) params.set('runId', this.runId);
    if (this.campaignId) params.set('campaignId', this.campaignId);
    return `/api/runs/stream${params.toString() ? '?' + params.toString() : ''}`;
  }

  private connectSSE(url: string): void {
    connectionManager.connect(url, (message: MessageEvent) => {
      this.handleMessage(message.data);
    });

    // Subscribe to health updates
    const unsub = connectionManager.subscribe((health) => {
      this.connected = health === 'connected';
      this.healthCallbacks.forEach((cb) => cb(health));
    });
    // Store unsub for cleanup
    this.healthCallbacks.add(() => unsub());
  }

  private connectWebSocket(url: string): void {
    if (typeof WebSocket === 'undefined') {
      this.connectLongPolling(url);
      return;
    }

    const wsUrl = url.replace(/^http/, 'ws').replace('/api/', '/');
    try {
      const ws = new WebSocket(wsUrl);
      this.transport = {
        close: () => ws.close(),
        onMessage: null,
      };

      ws.onopen = () => {
        this.connected = true;
        this.healthCallbacks.forEach((cb) => cb('connected'));
      };

      ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      ws.onerror = () => {
        this.connected = false;
        this.healthCallbacks.forEach((cb) => cb('reconnecting'));
      };

      ws.onclose = () => {
        this.connected = false;
        this.healthCallbacks.forEach((cb) => cb('disconnected'));
        // Fall back to long-polling
        this.connectLongPolling(url);
      };
    } catch {
      this.connectLongPolling(url);
    }
  }

  private connectLongPolling(url: string): void {
    this.transportType = 'longpoll';
    this.connected = true;
    this.healthCallbacks.forEach((cb) => cb('connected'));

    const poll = async () => {
      try {
      const queryUrl = url + (url.includes('?') ? '&' : '?') + `after=${this.lastSeq}`;
      const response = await fetch(queryUrl);
      if (response.ok) {
        const data = await response.text();
        if (data) this.handleMessage(data);
      }
      } catch {
        // Network errors are expected during polling; keep going.
      }
    };

    void poll();
    this.pollTimer = setInterval(poll, POLL_INTERVAL_MS);

    this.transport = {
      close: () => {
        if (this.pollTimer) {
          clearInterval(this.pollTimer);
          this.pollTimer = null;
        }
      },
      onMessage: null,
    };
  }

  private handleMessage(data: string): void {
    try {
      const envelope = JSON.parse(data) as StreamEnvelope;
      if (envelope.seq <= this.lastSeq) return;
      this.lastSeq = envelope.seq;

      const eventType = envelope.event.type as StreamEventType;
      const callbacks = this.listeners.get(eventType);
      if (callbacks) {
        callbacks.forEach((cb) => cb(envelope));
      }
      // Also fire 'all' listeners
      const allCallbacks = this.listeners.get('heartbeat');
      if (allCallbacks && eventType === 'heartbeat') {
        allCallbacks.forEach((cb) => cb(envelope));
      }
    } catch {
      // Ignore malformed events.
    }
  }

  on(eventType: StreamEventType, callback: EventCallback): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);
  }

  off(eventType: StreamEventType, callback: EventCallback): void {
    this.listeners.get(eventType)?.delete(callback);
  }

  onHealth(callback: HealthCallback): () => void {
    this.healthCallbacks.add(callback);
    callback(this.connected ? 'connected' : 'disconnected');
    return () => {
      this.healthCallbacks.delete(callback);
    };
  }

  getHealth(): ConnectionHealth {
    return this.connected ? 'connected' : 'disconnected';
  }

  close(): void {
    connectionManager.disconnect();
    if (this.transport) {
      this.transport.close();
      this.transport = null;
    }
    this.listeners.clear();
    this.healthCallbacks.clear();
  }
}
