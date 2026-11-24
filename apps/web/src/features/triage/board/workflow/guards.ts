// WIP scaffold for issue #2282. Transition guards enforce required evidence per state.

import type { TriageState } from "./stateMachine";

export interface GuardContext {
  hasLinkedRun: boolean;
  hasArtifact: boolean;
}

export interface GuardResult {
  ok: boolean;
  reason?: string;
}

export function checkTransitionGuard(to: TriageState, context: GuardContext): GuardResult {
  if (to === "reproduced" && !(context.hasLinkedRun && context.hasArtifact)) {
    return { ok: false, reason: "Marking as reproduced requires a linked run and artifact" };
  }

  return { ok: true };
}
