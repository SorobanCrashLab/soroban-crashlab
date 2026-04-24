import * as assert from "node:assert/strict";
import {
  buildChartRows,
  computeDeltaPercent,
  getChartsStateMessage,
  selectChartRuns,
  summarizeChartRows,
} from "./add-run-comparison-charts-utils.ts";
import { buildMockRuns } from "./mockRuns.ts";

function runAssertions(): void {
  assert.equal(computeDeltaPercent(100, 120), 20);
  assert.equal(computeDeltaPercent(100, 80), -20);
  assert.equal(computeDeltaPercent(0, 50), 0);

  const runs = buildMockRuns();
  const selected = selectChartRuns(runs);
  assert.ok(selected.length <= 6);
  assert.ok(selected.length > 0);

  const rows = buildChartRows(selected, "duration", selected[0].id);
  assert.equal(rows.length, selected.length);
  assert.ok(rows.some((row) => row.baseline));
  assert.ok(rows.every((row) => row.percentage > 0));

  const summary = summarizeChartRows(rows);
  assert.equal(summary.tracked, rows.length);
  assert.equal(typeof summary.highestId, "string");

  const loading = getChartsStateMessage("loading", 0);
  assert.match(loading.title, /Loading/i);
  const error = getChartsStateMessage("error", 5);
  assert.match(error.title, /unavailable/i);
  const empty = getChartsStateMessage("success", 0);
  assert.match(empty.title, /No runs/i);
  const ready = getChartsStateMessage("success", 2);
  assert.match(ready.title, /ready/i);
}

runAssertions();
console.log("add-run-comparison-charts-utils.test.ts: all assertions passed");
