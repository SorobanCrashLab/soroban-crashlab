import { describe, expect, it } from "vitest";
import type { FuzzingRun } from "@/app/types";
import { aggregate, aggregateCampaigns, percentile } from "./campaign/AggregationEngine";
import {
  addRun,
  canAddSlot,
  hydrateSlots,
  initialComparisonState,
  moveRun,
  pinBaseline,
  removeRun,
} from "./comparisonState";
import { diffBinary, decodeHex, hexDump } from "./diffing/binaryDiff";
import { detectArtifactKind, diffArtifact } from "./diffing/diffEngine";
import { diffJson } from "./diffing/jsonDiff";
import { diffText } from "./diffing/textDiff";
import { buildMetricsCSV } from "./export/CSVExporter";
import { buildReportHtml } from "./export/PDFExporter";
import { buildPatch } from "./export/PatchExporter";
import { buildComparisonSearch, parseSearch } from "./hooks/useComparisonURL";
import {
  classifyDeltaPercent,
  computeDeltaPercent,
  computeMetricDeltas,
  formatDeltaPercent,
  formatMetricValue,
} from "./metrics";
import { correlateCrashes, similarity, summarizeCorrelation } from "./sync/CrashCorrelator";
import { ReplaySyncController } from "./sync/ReplaySyncController";

function makeRun(id: string, overrides: Partial<FuzzingRun> = {}): FuzzingRun {
  return {
    id,
    status: "completed",
    area: "token",
    severity: "medium",
    duration: 1000,
    seedCount: 100,
    crashDetail: null,
    cpuInstructions: 1000,
    memoryBytes: 1024,
    minResourceFee: 100,
    campaignId: "campaign-a",
    ...overrides,
  } as FuzzingRun;
}

describe("comparison metrics", () => {
  it("computes signed percentage deltas with a zero-denominator guard", () => {
    expect(computeDeltaPercent(100, 125)).toBe(25);
    expect(computeDeltaPercent(100, 80)).toBe(-20);
    expect(computeDeltaPercent(0, 10)).toBeNull();
  });

  it("classifies direction using the metric's better/worse polarity", () => {
    expect(classifyDeltaPercent(20, true)).toBe("regression");
    expect(classifyDeltaPercent(-20, true)).toBe("improvement");
    expect(classifyDeltaPercent(20, false)).toBe("improvement");
    expect(classifyDeltaPercent(2, true)).toBe("stable");
    expect(classifyDeltaPercent(null, true)).toBe("neutral");
  });

  it("formats values and deltas for screen readers and tables", () => {
    expect(formatDeltaPercent(12.345)).toBe("+12.3%");
    expect(formatDeltaPercent(null)).toBe("—");
    expect(formatMetricValue("duration", 2500)).toBe("2.50s");
    expect(formatMetricValue("memoryBytes", 2 * 1024 * 1024)).toBe("2.00 MB");
  });

  it("produces one delta row per comparable metric", () => {
    const baseline = makeRun("a", { duration: 1000 });
    const candidate = makeRun("b", { duration: 1200 });
    const deltas = computeMetricDeltas(baseline, candidate);
    expect(deltas.some((delta) => delta.key === "duration" && delta.deltaPercent === 20)).toBe(true);
    expect(deltas.every((delta) => delta.key !== "duration" || delta.classification === "regression")).toBe(true);
  });
});

describe("comparison state", () => {
  it("supports 2-5 slots with a pinned baseline", () => {
    let state = initialComparisonState(["a", "b"]);
    expect(state.slots).toHaveLength(2);
    expect(state.slots[0].role).toBe("baseline");
    state = addRun(state, "c");
    state = addRun(state, "d");
    state = addRun(state, "e");
    expect(state.slots).toHaveLength(5);
    expect(canAddSlot(state, [makeRun("a"), makeRun("b"), makeRun("c"), makeRun("d"), makeRun("e"), makeRun("f")])).toBe(false);
    state = addRun(state, "f");
    expect(state.slots).toHaveLength(5);

    state = pinBaseline(state, state.slots[2].id);
    expect(state.slots.filter((slot) => slot.role === "baseline")).toHaveLength(1);
    expect(state.slots[2].role).toBe("baseline");

    state = moveRun(state, state.slots[0].id, 1);
    expect(state.slots[0].runId).not.toBe("a");
    state = removeRun(state, state.slots[0].id);
    expect(state.slots).toHaveLength(4);
  });

  it("rejects invalid hydrated links and restores a baseline", () => {
    const slots = [makeRun("a"), makeRun("b")].map((run, index) => ({
      id: `slot-${index}`,
      runId: run.id,
      role: (index === 0 ? "baseline" : "candidate") as "baseline" | "candidate",
      pinned: index === 0,
    }));
    expect(hydrateSlots(slots, ["a"])).toEqual([]);
    const restored = hydrateSlots([{ ...slots[0], role: "candidate", pinned: false }, slots[1]], ["a", "b"]);
    expect(restored[0].role).toBe("baseline");
  });
});

describe("diffing", () => {
  it("produces a unified patch for text diffs", () => {
    const result = diffText("alpha\nbeta\ngamma\n", "alpha\nBETA\ngamma\n", "a/log.txt", "b/log.txt");
    expect(result.additions).toBe(1);
    expect(result.deletions).toBe(1);
    expect(result.unifiedPatch).toContain("--- a/log.txt");
    expect(result.unifiedPatch).toContain("@@ -");
    expect(result.unifiedPatch).toContain("-beta");
    expect(result.unifiedPatch).toContain("+BETA");
    expect(diffText("same\n", "same\n").unifiedPatch).toBe("");
  });

  it("detects structural JSON changes", () => {
    const result = diffJson('{"a":1,"b":2}', '{"a":2,"c":3}');
    expect(result.entries.map((entry) => `${entry.type}:${entry.path}`)).toEqual([
      "modified:a",
      "removed:b",
      "added:c",
    ]);
    expect(diffJson('{"x":1}', '{"x":"1"}').entries[0].type).toBe("type-changed");
    expect(diffJson("not json", "also not").entries.length).toBeGreaterThan(0);
  });

  it("reports byte-level binary deltas", () => {
    const before = decodeHex("00 01 02 03 aa bb cc");
    const after = decodeHex("00 01 02 03 dd bb cc");
    const result = diffBinary(before, after);
    expect(result.identicalPrefixBytes).toBe(4);
    expect(result.identicalSuffixBytes).toBe(2);
    expect(result.sizeDelta).toBe(0);
    expect(result.changedBytes).toBe(1);
    expect(result.chunks[0].beforeHex).toContain("aa");
    expect(diffBinary(before, decodeHex("00 01 02 03 dd bb cc 04")).sizeDelta).toBe(1);
    expect(hexDump(before, 0, 4)).toContain("00 01 02 03");
  });

  it("dispatches by artifact kind", () => {
    expect(detectArtifactKind({ name: "crash.bin", contentType: "hex", type: "bundle" })).toBe("binary");
    expect(detectArtifactKind({ name: "state.json", contentType: "json", type: "trace" })).toBe("json");
    expect(detectArtifactKind({ name: "log.txt", type: "log" })).toBe("text");
    expect(diffArtifact({ name: "state.json", type: "trace" }, '{"a":1}', '{"a":2}').kind).toBe("json");
  });
});

describe("crash correlation", () => {
  it("matches exact fingerprints and flags new/removed crashes", () => {
    const baseline = makeRun("a", {
      crashDetail: { failureCategory: "panic", signature: "panic at 0x1234: contract token", signatureHash: 42, payload: "", replayAction: "" },
    });
    const candidate = makeRun("b", {
      crashDetail: { failureCategory: "panic", signature: "panic at 0x9999: contract token", signatureHash: 42, payload: "", replayAction: "" },
    });
    const result = correlateCrashes(baseline, candidate);
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].kind).toBe("exact");
    expect(result.newInCandidate).toHaveLength(0);
    expect(summarizeCorrelation([result]).matched).toBe(1);

    const clean = makeRun("c");
    const withoutCrash = correlateCrashes(baseline, clean);
    expect(withoutCrash.removedFromBaseline).toHaveLength(1);
    expect(withoutCrash.matched).toHaveLength(0);
  });

  it("fuzzy-matches normalised signatures", () => {
    expect(similarity("panic at 0x123: token transfer", "panic at 0x999: token transfer")).toBeGreaterThan(0.6);
    const baseline = makeRun("a", {
      crashDetail: { failureCategory: "panic", signature: "panic at 0x123: token transfer aborted unexpectedly", payload: "", replayAction: "" },
    });
    const candidate = makeRun("b", {
      crashDetail: { failureCategory: "panic", signature: "panic at 0x999: token transfer aborted fatally", payload: "", replayAction: "" },
    });
    expect(correlateCrashes(baseline, candidate).matched[0].kind).toBe("fuzzy");
  });
});

describe("replay sync", () => {
  it("seeks all runs to the same normalised ratio", () => {
    const controller = new ReplaySyncController(["a", "b"]);
    controller.setDurations({ a: 1000, b: 2000 });
    controller.seek(0.5);
    expect(controller.snapshot().positions.map((position) => position.elapsedMs)).toEqual([500, 1000]);
    controller.advance(500);
    expect(controller.snapshot().ratio).toBeCloseTo(0.75);
    controller.setPlaying(true);
    expect(controller.snapshot().playing).toBe(true);
  });
});

describe("campaign aggregation", () => {
  it("computes interpolated percentiles", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([1, 2, 3, 4], 0.95)).toBeCloseTo(3.85);
    const stats = aggregate([10, 20, 30, 40]);
    expect(stats.median).toBe(25);
    expect(stats.p99).toBeCloseTo(39.7);
    expect(aggregate([]).count).toBe(0);
  });

  it("groups runs by campaign", () => {
    const runs = [
      makeRun("a", { campaignId: "x", duration: 1000 }),
      makeRun("b", { campaignId: "x", duration: 2000 }),
      makeRun("c", { campaignId: "y", duration: 4000 }),
      makeRun("d", { duration: 8000, campaignId: undefined }),
    ];
    const aggregates = aggregateCampaigns(runs);
    expect(aggregates.find((entry) => entry.campaignId === "x")?.byMetric.duration?.median).toBe(1500);
    expect(aggregates.find((entry) => entry.campaignId === "uncategorized")?.runCount).toBe(1);
  });
});

describe("exports and deep links", () => {
  it("exports CSV and unified patch files", () => {
    const baseline = makeRun("a");
    const candidate = makeRun("b", { duration: 1300 });
    const csv = buildMetricsCSV(baseline, [candidate]);
    expect(csv).toContain("metric,baseline_run,baseline_value");
    expect(csv).toContain("Duration,a,1000,1300,+30.0%");

    const patch = buildPatch([
      {
        artifactName: "log.txt",
        kind: "text",
        status: "ready",
        result: diffText("a\nb\n", "a\nc\n", "a/log.txt", "b/log.txt"),
      },
    ]);
    expect(patch).toContain("### log.txt");
    expect(patch).toContain("-b");
    expect(buildPatch([])).toBe("");
  });

  it("escapes HTML in the printable report", () => {
    const html = buildReportHtml(makeRun("<baseline>"), [makeRun("candidate")]);
    expect(html).toContain("&lt;baseline&gt;");
    expect(html).toContain("Run Comparison");
  });

  it("round-trips comparison URL state", () => {
    const search = buildComparisonSearch({
      runIds: ["a", "b"],
      baselineId: "a",
      panel: "artifacts",
      artifactName: "state.json",
    });
    const parsed = parseSearch(`?${search}`);
    expect(parsed).toEqual({
      runIds: ["a", "b"],
      baselineId: "a",
      panel: "artifacts",
      artifactName: "state.json",
    });
    expect(parseSearch("?panel=bogus")?.runIds).toBeUndefined();
    expect(parseSearch("?runs=a,b&panel=bogus")?.panel).toBe("metrics");
  });
});
