/**
 * Mock Redis Pub/Sub subscriber (#2191).
 *
 * In production, this would use @upstash/redis or ioredis to subscribe to
 * a 'runs:events' channel. For development and testing, we use an
 * EventEmitter-based mock that supports publish/subscribe without Redis.
 */

export const RUNS_EVENTS_CHANNEL = 'runs:events';

type MessageHandler = (message: unknown) => void;

class MockRedisSubscriber {
  private channels: Map<string, Set<MessageHandler>> = new Map();

  subscribe(channel: string, callback: MessageHandler): void {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel)!.add(callback);
  }

  unsubscribe(channel: string, callback?: MessageHandler): void {
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

  getChannelCount(): number {
    return this.channels.size;
  }

  getSubscriberCount(channel: string): number {
    return this.channels.get(channel)?.size ?? 0;
  }
}

export const redisSubscriber = new MockRedisSubscriber();
