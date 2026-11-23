// W3C trace-context propagation and lightweight span helpers.
// OpenTelemetry exporters can consume these headers and attributes.
import { randomUUID } from 'crypto';

export interface SpanContext { traceId: string; spanId: string; parentSpanId?: string }
export interface SpanAttributes extends Record<string, string | number | boolean | undefined> {}

function hex32(bytes: number): string { return bytes.toString(16).padStart(32, '0').slice(-32); }
function hex16(bytes: number): string { return bytes.toString(16).padStart(16, '0').slice(-16); }

export function createTraceContext(attributes: SpanAttributes = {}): SpanContext & { attributes: SpanAttributes } {
  const traceId = hex32(Math.abs(randomUUID().replace(/-/g, '').slice(0, 8).split('').reduce((n, c) => n * 16 + parseInt(c, 16), 0)));
  return { traceId: traceId.padEnd(32, '0').slice(0, 32), spanId: hex16(Date.now()), attributes };
}

export function parseTraceparent(header: string | null): SpanContext | null {
  if (!header) return null;
  const parts = header.trim().split('-');
  if (parts.length !== 4 || parts[0] !== '00') return null;
  if (!/^([0-9a-f]{32})$/.test(parts[1]) || !/^([0-9a-f]{16})$/.test(parts[2])) return null;
  return { traceId: parts[1], spanId: parts[2] };
}

export function formatTraceparent(context: SpanContext): string {
  return `00-${context.traceId}-${context.spanId}-01`;
}

export class TraceSpan {
  constructor(public readonly name: string, public readonly context: SpanContext, public readonly attributes: SpanAttributes = {}) {}
  end(attributes: SpanAttributes = {}) { return { name: this.name, context: this.context, attributes: { ...this.attributes, ...attributes }, endedAt: new Date().toISOString() }; }
}

export function startSpan(name: string, attributes: SpanAttributes = {}, parent?: SpanContext): TraceSpan {
  const base = parent ?? createTraceContext();
  return new TraceSpan(name, { traceId: base.traceId, spanId: hex16(Date.now()), parentSpanId: base.spanId }, attributes);
}
