/**
 * Transport factory — selects the best available transport (#2191).
 *
 * Preference order: SSE (cheapest, unidirectional) > WebSocket (bidirectional,
 * but heavier) > long-polling (always works, but least efficient).
 */

import type { WebSocketTransport } from './WebSocketTransport';
import type { LongPollTransport } from './LongPollTransport';

export type TransportType = 'sse' | 'websocket' | 'longpoll';

export interface Transport {
  connect: () => void;
  close: () => void;
  onMessage: ((msg: string) => void) | null;
  onError: ((err: Error) => void) | null;
  isAvailable: () => boolean;
}

/**
 * Select the best transport based on environment capabilities.
 * SSE is preferred; WebSocket is the fallback; long-polling is the last resort.
 */
export function selectBestTransport(): TransportType {
  // SSE is always available in modern browsers (EventSource).
  if (typeof EventSource !== 'undefined') {
    return 'sse';
  }
  // WebSocket as fallback.
  if (typeof WebSocket !== 'undefined') {
    return 'websocket';
  }
  // Long-polling always works.
  return 'longpoll';
}

export function createTransport(type: TransportType, url: string): Transport {
  switch (type) {
    case 'sse': {
      let source: EventSource | null = null;
      return {
        connect: () => {
          source = new EventSource(url);
        },
        close: () => {
          source?.close();
          source = null;
        },
        onMessage: null,
        onError: null,
        isAvailable: () => typeof EventSource !== 'undefined',
      };
    }
    case 'websocket': {
      let ws: WebSocket | null = null;
      return {
        connect: () => {
          const wsUrl = url.replace(/^http/, 'ws');
          ws = new WebSocket(wsUrl);
        },
        close: () => {
          ws?.close();
          ws = null;
        },
        onMessage: null,
        onError: null,
        isAvailable: () => typeof WebSocket !== 'undefined',
      };
    }
    case 'longpoll': {
      let timer: ReturnType<typeof setInterval> | null = null;
      return {
        connect: () => {
          timer = setInterval(async () => {
            try {
              const response = await fetch(url);
              if (response.ok) {
                const data = await response.text();
                if (data) {
                  // onMessage is set by caller.
                }
              }
            } catch {
              // Expected during network issues.
            }
          }, 15_000);
        },
        close: () => {
          if (timer) clearInterval(timer);
          timer = null;
        },
        onMessage: null,
        onError: null,
        isAvailable: () => true,
      };
    }
  }
}
