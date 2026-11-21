// WIP scaffold for issue #2282. TODO: wire to real triage item store.

import { canTransition, type TriageState } from "./stateMachine";
import { checkTransitionGuard, type GuardContext } from "./guards";

export interface TransitionRequest {
  itemId: string;
  from: TriageState;
  to: TriageState;
  actorId: string;
}

export interface TransitionResult {
  ok: boolean;
  reason?: string;
}

export function applyTransition(
  request: TransitionRequest,
  context: GuardContext,
): TransitionResult {
  if (!canTransition(request.from, request.to)) {
    return { ok: false, reason: `Transition ${request.from} -> ${request.to} is not allowed` };
  }

  const guardResult = checkTransitionGuard(request.to, context);
  if (!guardResult.ok) {
    return guardResult;
  }

  return { ok: true };
}
