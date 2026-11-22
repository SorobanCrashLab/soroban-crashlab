/** SSE parsing and reconnect tests (#2206). */
import { describe, expect, it } from 'vitest';
import { parseMetricEvent, parseSSEChunk, reconnectDelay } from './MetricStreamParser';

describe('SSE stream parsing', () => {
  it('parses complete frames and keeps the partial tail', () => {
    const first = parseSSEChunk('', 'event: metrics\ndata: {"campaignId":"c1","metric":"runs","value":42}\n\nid: 2\nda');
    expect(first.events).toHaveLength(1);
    expect(first.events[0].event).toBe('metrics');
    expect(parseMetricEvent(first.events[0].data)).toEqual({ campaignId: 'c1', metric: 'runs', value: 42 });
    const second = parseSSEChunk(first.remainder, 'ta: x\n\n');
    expect(second.events[0]).toEqual({ data: 'x', id: '2' });
  });

  it('rejects malformed metric payloads', () => {
    expect(parseMetricEvent('not json')).toBeUndefined();
    expect(parseMetricEvent('{"campaignId":"c1"}')).toBeUndefined();
    expect(parseMetricEvent('{"campaignId":"c1","metric":"runs","value":"x"}')).toBeUndefined();
  });

  it('uses capped exponential reconnect backoff', () => {
    expect(reconnectDelay(0)).toBe(500);
    expect(reconnectDelay(1)).toBe(1000);
    expect(reconnectDelay(20)).toBe(30_000);
  });
});
