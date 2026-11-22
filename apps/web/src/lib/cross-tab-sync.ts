/**
 * Cross-tab synchronization using BroadcastChannel with localStorage fallback (issue #2262 Phase 3).
 */

export type SyncMessage<T = unknown> = {
  type: string;
  payload: T;
  timestamp: number;
};

export class CrossTabSync<T = unknown> {
  private channel: BroadcastChannel | null = null;
  private storageKey: string;
  private listeners: Set<(message: SyncMessage<T>) => void> = new Set();

  constructor(channelName: string) {
    this.storageKey = `sync:${channelName}`;
    
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(channelName);
      this.channel.onmessage = (event) => {
        this.notifyListeners(event.data);
      };
    } else {
      // Fallback to storage events for older browsers
      if (typeof window !== 'undefined') {
        window.addEventListener('storage', this.handleStorageEvent);
      }
    }
  }

  send(type: string, payload: T): void {
    const message: SyncMessage<T> = {
      type,
      payload,
      timestamp: Date.now(),
    };

    if (this.channel) {
      this.channel.postMessage(message);
    } else {
      // Fallback: write to localStorage to trigger storage event in other tabs
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey, JSON.stringify(message));
        // Clean up immediately to allow repeated messages
        localStorage.removeItem(this.storageKey);
      }
    }
  }

  subscribe(listener: (message: SyncMessage<T>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', this.handleStorageEvent);
    }
    
    this.listeners.clear();
  }

  private handleStorageEvent = (event: StorageEvent): void => {
    if (event.key !== this.storageKey || !event.newValue) return;
    
    try {
      const message = JSON.parse(event.newValue) as SyncMessage<T>;
      this.notifyListeners(message);
    } catch {
      // Ignore invalid messages
    }
  };

  private notifyListeners(message: SyncMessage<T>): void {
    this.listeners.forEach((listener) => listener(message));
  }
}
