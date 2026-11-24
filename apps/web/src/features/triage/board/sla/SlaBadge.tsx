// WIP scaffold for issue #2282.
"use client";

import type { SlaTimer } from "./timers";
import { isBreached } from "./timers";

export function SlaBadge({ timer }: { timer: SlaTimer }) {
  const breached = isBreached(timer);

  return (
    <span
      role="status"
      aria-label={breached ? "SLA breached" : "SLA on track"}
      className={breached ? "sla-badge sla-badge--breached" : "sla-badge sla-badge--ok"}
    >
      {breached ? "Breached" : "On track"}
    </span>
  );
}
