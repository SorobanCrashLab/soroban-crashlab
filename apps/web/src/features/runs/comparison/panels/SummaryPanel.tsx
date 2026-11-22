"use client";

import { useMemo } from "react";
import type { FuzzingRun } from "@/app/types";
import { computeMetricDeltas, formatDeltaPercent, summarizeDeltas } from "../metrics";
import { correlateCrashes, summarizeCorrelation } from "../sync/CrashCorrelator";

export interface SummaryPanelProps {
  baseline: FuzzingRun | null;
  candidates: FuzzingRun[];
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "good" | "bad" }) {
  const color = tone === "good" ? "text-green-600 dark:text-green-400" : tone === "bad" ? "text-red-600 dark:text-red-400" : "";
  return (
    <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

export default function SummaryPanel({ baseline, candidates }: SummaryPanelProps) {
  const deltaSummary = useMemo(
    () => summarizeDeltas(baseline ? candidates.flatMap((candidate) => computeMetricDeltas(baseline, candidate)) : []),
    [baseline, candidates],
  );
  const crashSummary = useMemo(
    () => summarizeCorrelation(baseline ? candidates.map((candidate) => correlateCrashes(baseline, candidate)) : []),
    [baseline, candidates],
  );

  const durationDelta = useMemo(() => {
    if (!baseline || candidates.length === 0) return null;
    return computeMetricDeltas(baseline, candidates[0]).find((delta) => delta.key === "duration") ?? null;
  }, [baseline, candidates]);

  return (
    <section aria-label="Comparison summary" className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <h3 className="mb-3 text-sm font-semibold">Summary</h3>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Runs compared" value={String(candidates.length + (baseline ? 1 : 0))} />
        <Stat label="Crashes (baseline)" value={baseline?.crashDetail ? "1" : "0"} />
        <Stat label="Matched crashes" value={String(crashSummary.matched)} tone="good" />
        <Stat label="New crashes" value={String(crashSummary.newCrashes)} tone={crashSummary.newCrashes > 0 ? "bad" : "default"} />
        <Stat label="Removed crashes" value={String(crashSummary.removedCrashes)} tone="good" />
        <Stat label="Regressions" value={String(deltaSummary.regressions)} tone={deltaSummary.regressions > 0 ? "bad" : "default"} />
        <Stat label="Improvements" value={String(deltaSummary.improvements)} tone={deltaSummary.improvements > 0 ? "good" : "default"} />
        <Stat
          label="Duration Δ"
          value={durationDelta ? formatDeltaPercent(durationDelta.deltaPercent) : "—"}
          tone={durationDelta?.classification === "regression" ? "bad" : durationDelta?.classification === "improvement" ? "good" : "default"}
        />
      </div>
    </section>
  );
}
