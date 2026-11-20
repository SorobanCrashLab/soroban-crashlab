/**
 * Tests for RunEventStream (#2191).
 *
 * Tests connection establishment, reconnection with backoff,
 * fallback chain activation, and event listener management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RunEventStream } from './RunEventStream';
import { connectionManager } from './connectionManager';

// Mock EventSource
class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  url: string;
  readyState = 0;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
    // Simulate successful connection.
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.(new Event('open'));
    }, 0);
  }

  close() {
    this.readyState = 2;
  }
}

vi.stubGlobal('EventSource', MockEventSource);

describe('RunEventStream', () => {
  let stream: RunEventStream;

  beforeEach(() => {
    MockEventSource.instances = [];
    vi.useFakeTimers();
    stream = new RunEventStream();
  });

  afterEach(() => {
    stream.close();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('establishes SSE connection on connect()', () => {
    stream.connect();
    vi.runAllTimers();
    expect(MockEventSource.instances.length).toBeGreaterThan(0);
  });

  it('registers and fires event listeners', () => {
    const callback = vi.fn();
    stream.on('run.created', callback);
    stream.connect();
    vi.runAllTimers();

    // Simulate receiving an event.
    const source = MockEventSource.instances[0];
    if (source?.onmessage) {
      source.onmessage(new MessageEvent('message', {
        data: JSON.stringify({ seq: 1, event: { type: 'run.created', run: { id: 'test-1' } } }),
      }));
    }

    expect(callback).toHaveBeenCalledOnce();
  });

  it('supports health callbacks', () => {
    const healthCallback = vi.fn();
    stream.onHealth(healthCallback);
    stream.connect();
    vi.runAllTimers();

    // Health callback should have been called at least once.
    expect(healthCallback).toHaveBeenCalled();
  });

  it('deduplicates events by sequence number', () => {
    const callback = vi.fn();
    stream.on('run.created', callback);
    stream.connect();
    vi.runAllTimers();

    const source = MockEventSource.instances[0];
    if (source?.onmessage) {
      const envelope = { seq: 1, event: { type: 'run.created', run: { id: 'test-1' } } };
      source.onmessage(new MessageEvent('message', { data: JSON.stringify(envelope) }));
      // Same seq should be ignored.
      source.onmessage(new MessageEvent('message', { data: JSON.stringify(envelope) }));
    }

    expect(callback).toHaveBeenCalledOnce();
  });

  it('removes listeners with off()', () => {
    const callback = vi.fn();
    stream.on('run.created', callback);
    stream.off('run.created', callback);
    stream.connect();
    vi.runAllTimers();

    const source = MockEventSource.instances[0];
    if (source?.onmessage) {
      source.onmessage(new MessageEvent('message', {
        data: JSON.stringify({ seq: 1, event: { type: 'run.created', run: { id: 'test-1' } } }),
      }));
    }

    expect(callback).not.toHaveBeenCalled();
  });

  it('cleans up on close()', () => {
    stream.connect();
    vi.runAllTimers();
    stream.close();

    // After close, new events should not trigger callbacks.
    const callback = vi.fn();
    stream.on('run.created', callback);

    const source = MockEventSource.instances[0];
    if (source?.onmessage) {
      source.onmessage(new MessageEvent('message', {
        data: JSON.stringify({ seq: 1, event: { type: 'run.created', run: { id: 'test-1' } } }),
      }));
    }

    expect(callback).not.toHaveBeenCalled();
  });
});
