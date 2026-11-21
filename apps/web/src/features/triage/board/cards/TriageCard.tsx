// WIP scaffold for issue #2282.
"use client";

import type { TriageState } from "../workflow/stateMachine";
import type { SlaTimer } from "../sla/timers";
import { SlaBadge } from "../sla/SlaBadge";

export interface TriageCardData {
  id: string;
  title: string;
  state: TriageState;
  owner?: string;
  slaTimer?: SlaTimer;
}

export function TriageCard({ item }: { item: TriageCardData }) {
  return (
    <div className="triage-card" role="group" aria-label={item.title}>
      <div className="triage-card__title">{item.title}</div>
      <div className="triage-card__meta">
        <span>{item.owner ?? "Unassigned"}</span>
        {item.slaTimer ? <SlaBadge timer={item.slaTimer} /> : null}
      </div>
    </div>
  );
}
