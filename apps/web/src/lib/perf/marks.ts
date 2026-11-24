// WIP scaffold for issue #2280. Thin wrapper over the User Timing API for route/component
// marks; no automatic instrumentation of key flows yet.
"use client";

export function markStart(name: string): void {
  if (typeof performance === "undefined") return;
  performance.mark(`${name}:start`);
}

export function markEnd(name: string): number | null {
  if (typeof performance === "undefined") return null;
  performance.mark(`${name}:end`);
  try {
    const measurement = performance.measure(name, `${name}:start`, `${name}:end`);
    return measurement.duration;
  } catch {
    return null;
  }
}
