// WIP scaffold for issue #2282.
"use client";

import { useMemo } from "react";
import { evaluateBreach } from "../sla/SlaPolicyEngine";
import type { SlaTimer } from "../sla/timers";

export function useTriageSla(timer: SlaTimer | undefined) {
  return useMemo(() => (timer ? evaluateBreach(timer) : false), [timer]);
}
