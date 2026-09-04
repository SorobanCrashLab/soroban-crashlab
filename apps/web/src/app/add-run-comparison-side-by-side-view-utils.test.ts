import * as assert from "node:assert/strict";
import {
  buildSideBySideRows,
  classifyDelta,
  computeSideBySideDelta,
  formatDeltaLabel,
  formatSideBySideMetric,
  getComparisonRunOptions,
  getSideBySideStateMessage,
  selectComparableRuns,
  summarizeSideBySideRows,
} from "./add-run-comparison-side-by-side-view-utils";
import { buildMockRuns } from "./mockRuns";

function runAssertions(): void {
  assert.equal(computeSideBySideDelta(100, 120), 20);
  assert.equal(computeSideBySideDelta(100, 80), -20);
  assert.equal(computeSideBySideDelta(0, 50), null, "denominator 0 returns null delta guard");
  assert.equal(computeSideBySideDelta(100, 120, "run-1", "run-1"), null, "matching IDs returns null delta guard");

  assert.equal(classifyDelta(15, "duration"), "regression");
  assert.equal(classifyDelta(-15, "duration"), "improvement");
  assert.equal(classifyDelta(5, "duration"), "stable");
  assert.equal(classifyDelta(null, "duration"), "neutral");

  assert.match(formatSideBySideMetric("duration", 5000), /5s/);
  assert.match(formatSideBySideMetric("memoryBytes", 2 * 1024 * 1024), /2\.0 MB/);
  assert.equal(formatDeltaLabel(12.345), "+12.3%");

  const runs = buildMockRuns();
  const comparable = selectComparableRuns(runs);
  assert.ok(comparable.length > 0);
  assert.ok(comparable.every((run) => run.status !== "cancelled") || runs.length === comparable.length);

  // Test picker exclusion helper getComparisonRunOptions
  const optionsForLeft = getComparisonRunOptions(comparable, comparable[1].id);
  assert.equal(optionsForLeft.find((opt) => opt.run.id === comparable[1].id)?.disabled, true);
  assert.match(optionsForLeft.find((opt) => opt.run.id === comparable[1].id)?.label ?? "", /already selected/);
  assert.equal(optionsForLeft.find((opt) => opt.run.id === comparable[0].id)?.disabled, false);

  const [left, right] = comparable.slice(0, 2);
  const rows = buildSideBySideRows(left, right);
  assert.equal(rows.length, 9);
  assert.ok(rows.some((row) => row.key === "duration"));
  assert.ok(rows.every((row) => typeof row.leftValue === "string"));

  // Same run ID returns empty rows
  const sameRunRows = buildSideBySideRows(left, left);
  assert.equal(sameRunRows.length, 0, "comparing identical run returns 0 rows");

  const summary = summarizeSideBySideRows(rows);
  assert.equal(typeof summary.differing, "number");
  assert.equal(typeof summary.regressions, "number");
  assert.equal(typeof summary.improvements, "number");

  const loading = getSideBySideStateMessage("loading", 0);
  assert.match(loading.title, /Loading/i);
  const error = getSideBySideStateMessage("error", 5);
  assert.match(error.title, /unavailable/i);
  const insufficient = getSideBySideStateMessage("success", 1);
  assert.match(insufficient.title, /Not enough/i);
  const ready = getSideBySideStateMessage("success", 3);
  assert.match(ready.title, /ready/i);
}

runAssertions();
console.log("add-run-comparison-side-by-side-view-utils.test.ts: all assertions passed");
