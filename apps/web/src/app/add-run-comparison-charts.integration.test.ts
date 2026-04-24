import * as assert from "node:assert/strict";
import { buildMockRuns } from "./mockRuns.ts";
import {
  buildChartRows,
  selectChartRuns,
  summarizeChartRows,
} from "./add-run-comparison-charts-utils.ts";

function runIntegrationAssertions(): void {
  const dashboardRuns = buildMockRuns();
  const chartRuns = selectChartRuns(dashboardRuns);
  assert.ok(chartRuns.length >= 2, "dashboard contract should provide runs for chart comparison");

  const rows = buildChartRows(chartRuns, "cpuInstructions", chartRuns[0].id);
  assert.equal(rows.length, chartRuns.length);
  assert.ok(rows.some((row) => row.baseline));

  const summary = summarizeChartRows(rows);
  assert.equal(summary.tracked, rows.length);
  assert.ok(summary.regressions >= 0);
}

runIntegrationAssertions();
console.log("add-run-comparison-charts.integration.test.ts: integration assertions passed");
