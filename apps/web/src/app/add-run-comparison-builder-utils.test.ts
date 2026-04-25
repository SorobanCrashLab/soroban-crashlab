import * as assert from "node:assert/strict";
import {
  COMPARISON_MODES,
  buildComparisonRows,
  calculateDeltaPercent,
  createInitialSlots,
  getBuilderStatusMessage,
} from "./add-run-comparison-builder-utils.ts";
import { buildMockRuns } from "./mockRuns.ts";

function runAssertions(): void {
  const slots = createInitialSlots();
  assert.equal(slots.length, 2);
  assert.equal(slots[0].id, "baseline");
  assert.equal(slots[1].id, "candidate");

  assert.equal(calculateDeltaPercent(100, 120), 20);
  assert.equal(calculateDeltaPercent(100, 80), -20);
  assert.equal(calculateDeltaPercent(0, 50), 0, "edge: baseline 0 should not divide by zero");

  const [baseline, candidate] = buildMockRuns().filter((run) => run.status === "completed").slice(0, 2);
  const rows = buildComparisonRows(baseline, candidate, COMPARISON_MODES[0].metrics);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].metric, "duration");
  assert.equal(typeof rows[0].deltaPercent, "number");

  const loading = getBuilderStatusMessage("loading", 0);
  assert.match(loading.title, /Loading/i);
  const error = getBuilderStatusMessage("error", 10);
  assert.match(error.title, /Unable/i);
  const empty = getBuilderStatusMessage("success", 1);
  assert.match(empty.title, /Not enough/i);
  const ready = getBuilderStatusMessage("success", 3);
  assert.match(ready.title, /ready/i);
}

runAssertions();
console.log("add-run-comparison-builder-utils.test.ts: all assertions passed");
