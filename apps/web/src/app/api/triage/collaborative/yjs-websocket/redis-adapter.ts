/**
 * Mock Redis pub/sub adapter for multi-instance Yjs sync (#2192).
 *
 * In production, this would use Redis pub/sub to broadcast Yjs updates
 * across multiple server instances. For development, we use an
 * EventEmitter-based mock.
 */

type ChannelHandler = (message: unknown) => void;

class MockRedisAdapter {
  private channels: Map<string, Set<ChannelHandler>> = new Map();

  subscribe(channel: string, callback: ChannelHandler): void {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel)!.add(callback);
  }

  unsubscribe(channel: string, callback?: ChannelHandler): void {
    if (!callback) {
      this.channels.delete(channel);
      return;
    }
    this.channels.get(channel)?.delete(callback);
  }

  publish(channel: string, message: unknown): void {
    const handlers = this.channels.get(channel);
    if (handlers) {
      for (const handler of handlers) {
        handler(message);
      }
    }
  }
}

export const redisAdapter = new MockRedisAdapter();

export function getTriageChannel(runId: string): string {
  return `triage:collaborative:${runId}`;
}
