"use client";

import { useCallback, useEffect, useState } from "react";
import type { ComparisonPanel } from "../types";
import { MAX_COMPARISON_RUNS, type ComparisonState } from "../comparisonState";

export interface ComparisonURLState {
  runIds: string[];
  baselineId: string | null;
  panel: ComparisonPanel;
  artifactName: string | null;
}

const PANELS: ComparisonPanel[] = ["metrics", "artifacts", "replay", "summary", "campaigns"];

function parseSearch(search: string): ComparisonURLState | null {
  const params = new URLSearchParams(search);
  const runIds = (params.get("runs") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, MAX_COMPARISON_RUNS);
  if (runIds.length === 0) return null;
  const panelParam = params.get("panel");
  return {
    runIds,
    baselineId: params.get("baseline"),
    panel: panelParam && PANELS.includes(panelParam as ComparisonPanel) ? (panelParam as ComparisonPanel) : "metrics",
    artifactName: params.get("artifact"),
  };
}

export function buildComparisonSearch(state: ComparisonURLState): string {
  const params = new URLSearchParams();
  params.set("runs", state.runIds.join(","));
  if (state.baselineId) params.set("baseline", state.baselineId);
  if (state.panel !== "metrics") params.set("panel", state.panel);
  if (state.artifactName) params.set("artifact", state.artifactName);
  return params.toString();
}

export function useComparisonURL(): {
  initial: ComparisonURLState | null;
  sync: (state: ComparisonState, artifactName?: string | null) => void;
} {
  const [initial, setInitial] = useState<ComparisonURLState | null>(null);

  useEffect(() => {
    // Deep link is applied once on mount; SSR renders the default panels.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitial(typeof window === "undefined" ? null : parseSearch(window.location.search));
  }, []);

  const sync = useCallback((state: ComparisonState, artifactName?: string | null) => {
    if (typeof window === "undefined") return;
    const baseline = state.slots.find((slot) => slot.role === "baseline") ?? state.slots[0];
    const search = buildComparisonSearch({
      runIds: state.slots.map((slot) => slot.runId),
      baselineId: baseline?.runId ?? null,
      panel: state.activePanel,
      artifactName: artifactName ?? null,
    });
    const url = `${window.location.pathname}?${search}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", url);
  }, []);

  return { initial, sync };
}

export { parseSearch };
