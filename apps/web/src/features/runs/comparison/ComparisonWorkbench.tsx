"use client";

import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { FuzzingRun } from "@/app/types";
import { baselineSlot, type ComparisonState } from "./comparisonState";
import CampaignComparisonMode from "./campaign/CampaignComparisonMode";
import { buildMetricsCSV, downloadText } from "./export/CSVExporter";
import { buildReportHtml, printReport } from "./export/PDFExporter";
import { buildPatch } from "./export/PatchExporter";
import { useArtifactDiff } from "./hooks/useArtifactDiff";
import { useComparison } from "./hooks/useComparison";
import { useComparisonURL } from "./hooks/useComparisonURL";
import ArtifactDiffPanel from "./panels/ArtifactDiffPanel";
import MetricsDeltaPanel from "./panels/MetricsDeltaPanel";
import ReplaySyncPanel from "./panels/ReplaySyncPanel";
import SummaryPanel from "./panels/SummaryPanel";
import type { ArtifactComparison, ComparisonPanel } from "./types";

const PANEL_TABS: Array<{ id: ComparisonPanel; label: string }> = [
  { id: "metrics", label: "Metrics delta" },
  { id: "artifacts", label: "Artifact diff" },
  { id: "replay", label: "Replay sync" },
  { id: "summary", label: "Summary" },
  { id: "campaigns", label: "Campaigns" },
];

export interface ComparisonWorkbenchProps {
  runs: FuzzingRun[];
  dataState?: "loading" | "error" | "success";
  onRetry?: () => void;
}

interface WorkbenchInnerProps {
  runs: FuzzingRun[];
  initialRunIds: string[];
  initialPanel: ComparisonPanel;
  initialArtifactName: string | null;
  onStateChange: (slots: Array<{ runId: string; role: "baseline" | "candidate" }>, panel: ComparisonPanel, artifactName: string | null) => void;
}

function WorkbenchInner({ runs, initialRunIds, initialPanel, initialArtifactName, onStateChange }: WorkbenchInnerProps) {
  const comparison = useComparison(runs, initialRunIds);
  const baseline = comparison.baseline;
  const candidates = comparison.candidates;
  const baselineRunId = baselineSlot(comparison.state)?.runId ?? null;
  const primaryCandidate = candidates[0] ?? null;

  const sharedArtifactNames = useMemo(() => {
    if (!baseline || !primaryCandidate) return [];
    const candidateNames = new Set(primaryCandidate.artifacts?.map((artifact) => artifact.name) ?? []);
    return (baseline.artifacts ?? []).map((artifact) => artifact.name).filter((name) => candidateNames.has(name));
  }, [baseline, primaryCandidate]);

  const [artifactName, setArtifactName] = useState<string | null>(
    initialArtifactName ?? sharedArtifactNames[0] ?? null,
  );
  const [exportError, setExportError] = useState<string | null>(null);

  const artifactDiff = useArtifactDiff({
    baseline,
    candidate: primaryCandidate,
    artifactName,
  });

  const { selectPanel } = comparison;
  useEffect(() => {
    // Apply the deep-linked panel once after the initial render.
    selectPanel(initialPanel);
  }, [initialPanel, selectPanel]);

  useEffect(() => {
    onStateChange(
      comparison.state.slots.map((slot) => ({ runId: slot.runId, role: slot.role })),
      comparison.state.activePanel,
      artifactName,
    );
  }, [comparison.state, artifactName, onStateChange]);

  const activePanel = comparison.state.activePanel;

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const index = PANEL_TABS.findIndex((tab) => tab.id === activePanel);
    const next = event.key === "ArrowRight" ? index + 1 : index - 1;
    if (next < 0 || next >= PANEL_TABS.length) return;
    comparison.selectPanel(PANEL_TABS[next].id);
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons[next]?.focus();
  };

  const exportCsv = () => {
    const csv = buildMetricsCSV(baseline, candidates);
    if (!csv) {
      setExportError("Select two runs before exporting metrics.");
      return;
    }
    setExportError(null);
    downloadText("run-comparison-metrics.csv", csv, "text/csv");
  };

  const exportPatch = () => {
    const comparisons: ArtifactComparison[] = artifactDiff.comparison ? [artifactDiff.comparison] : [];
    const patch = buildPatch(comparisons);
    if (!patch) {
      setExportError("Compute an artifact diff before exporting a patch.");
      return;
    }
    setExportError(null);
    downloadText("run-comparison.patch", patch);
  };

  const exportPdf = () => {
    if (!printReport(buildReportHtml(baseline, candidates))) {
      setExportError("PDF export requires a browser window.");
      return;
    }
    setExportError(null);
  };

  return (
    <section className="w-full rounded-[2rem] border border-black/[.08] bg-white/95 p-6 shadow-sm dark:border-white/[.145] dark:bg-zinc-950/90 md:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-600 dark:text-emerald-300">
            Multi-Run Comparison Workbench
          </p>
          <h2 className="text-2xl font-bold tracking-tight">Compare runs</h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Baseline <span className="font-mono font-semibold">{baseline?.id ?? "—"}</span> · {candidates.length} candidate(s)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportCsv} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium dark:border-zinc-700">CSV</button>
          <button type="button" onClick={exportPatch} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium dark:border-zinc-700">Patch</button>
          <button type="button" onClick={exportPdf} className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium dark:border-zinc-700">PDF</button>
        </div>
      </div>

      {exportError && <p role="alert" className="mb-4 text-sm text-red-600">{exportError}</p>}

      <div aria-label="Selected runs" className="mb-6 flex flex-wrap gap-2">
        {comparison.state.slots.map((slot) => (
          <div
            key={slot.id}
            className="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-xs dark:border-zinc-800"
          >
            <span className="font-mono font-medium">{slot.runId}</span>
            {slot.role === "baseline" && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">baseline</span>}
            <button
              type="button"
              onClick={() => comparison.pin(slot.id)}
              aria-label={`Pin ${slot.runId} as baseline`}
              className="text-zinc-500 hover:text-emerald-600"
            >
              Pin
            </button>
            <button
              type="button"
              onClick={() => comparison.move(slot.id, -1)}
              aria-label={`Move ${slot.runId} left`}
              className="text-zinc-500 hover:text-zinc-900"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => comparison.move(slot.id, 1)}
              aria-label={`Move ${slot.runId} right`}
              className="text-zinc-500 hover:text-zinc-900"
            >
              →
            </button>
            <button
              type="button"
              onClick={() => comparison.remove(slot.id)}
              aria-label={`Remove ${slot.runId}`}
              className="text-zinc-500 hover:text-red-600"
            >
              ✕
            </button>
          </div>
        ))}
        {comparison.canAdd && (
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            Add run
            <select
              aria-label="Add a run to the comparison"
              value=""
              onChange={(event) => {
                if (event.target.value) comparison.add(event.target.value);
              }}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="">Select…</option>
              {comparison.availableRuns.map((run) => (
                <option key={run.id} value={run.id}>{run.id}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div role="tablist" aria-label="Comparison panels" onKeyDown={handlePanelKeyDown} className="mb-4 flex flex-wrap gap-1">
        {PANEL_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activePanel === tab.id}
            onClick={() => comparison.selectPanel(tab.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              activePanel === tab.id
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={activePanel} className="grid gap-4 lg:grid-cols-2">
        {activePanel === "metrics" && <MetricsDeltaPanel baseline={baseline} candidates={candidates} />}
        {activePanel === "artifacts" && (
          <ArtifactDiffPanel
            baseline={baseline}
            candidate={primaryCandidate}
            initialArtifactName={artifactName ?? undefined}
            onArtifactChange={setArtifactName}
          />
        )}
        {activePanel === "replay" && <ReplaySyncPanel baseline={baseline} candidates={candidates} runs={comparison.selectedRuns} />}
        {activePanel === "summary" && <SummaryPanel baseline={baseline} candidates={candidates} />}
        {activePanel === "campaigns" && <CampaignComparisonMode runs={runs} />}
      </div>

      <p className="mt-4 text-xs text-zinc-400" data-baseline={baselineRunId ?? ""}>
        Compare up to five runs. Keyboard: use ← / → on the panel tabs to move between panels.
      </p>
    </section>
  );
}

export default function ComparisonWorkbench({ runs, dataState = "success", onRetry }: ComparisonWorkbenchProps) {
  const { initial, sync } = useComparisonURL();
  const initialRunIds = useMemo(
    () => (initial?.runIds ?? runs.slice(0, 2).map((run) => run.id)).filter((id) => runs.some((run) => run.id === id)),
    [initial, runs],
  );
  const [synced, setSynced] = useState<{
    slots: Array<{ runId: string; role: "baseline" | "candidate" }>;
    panel: ComparisonPanel;
    artifactName: string | null;
  } | null>(null);

  const handleStateChange = useCallback(
    (
      slots: Array<{ runId: string; role: "baseline" | "candidate" }>,
      panel: ComparisonPanel,
      artifactName: string | null,
    ) => {
      setSynced({ slots, panel, artifactName });
    },
    [],
  );

  useEffect(() => {
    if (!synced) return;
    sync(
      {
        slots: synced.slots.map((slot: { runId: string; role: "baseline" | "candidate" }, index: number) => ({
          id: `url-slot-${index}`,
          runId: slot.runId,
          role: slot.role,
          pinned: slot.role === "baseline",
        })),
        activePanel: synced.panel,
      } as ComparisonState,
      synced.artifactName,
    );
  }, [synced, sync]);

  if (dataState === "error") {
    return (
      <section className="rounded-[2rem] border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
        <p className="font-semibold">Comparison unavailable</p>
        {onRetry && (
          <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">
            Retry
          </button>
        )}
      </section>
    );
  }

  if (dataState === "loading" || initialRunIds.length < 2) {
    return (
      <section className="rounded-[2rem] border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
        <p className="font-semibold">At least two runs are required for comparison.</p>
      </section>
    );
  }

  return (
    <WorkbenchInner
      key={`${initialRunIds.join(",")}|${initial?.panel ?? "metrics"}`}
      runs={runs}
      initialRunIds={initialRunIds}
      initialPanel={initial?.panel ?? "metrics"}
      initialArtifactName={initial?.artifactName ?? null}
      onStateChange={handleStateChange}
    />
  );
}
