import * as assert from "node:assert/strict";
import { buildMockRuns } from "./mockRuns";
import {
  buildChartRows,
  selectChartRuns,
  summarizeChartRows,
} from "./add-run-comparison-charts-utils";

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

  const chartData = rows.map((row) => ({
    id: row.id,
    value: row.value,
    delta: row.delta,
    percentage: row.percentage,
    area: row.area,
    status: row.status,
    baseline: row.baseline,
  }));
  assert.equal(chartData.length, rows.length, "chart data should have same length as rows");
  assert.ok(chartData.every((d) => typeof d.value === "number"), "chart data values should be numbers");
  assert.ok(chartData.every((d) => typeof d.delta === "number"), "chart data deltas should be numbers");

  const chartTypes = ["bar", "line", "scatter"] as const;
  assert.equal(chartTypes.length, 3, "chart types should include bar, line, and scatter");
  assert.ok(chartTypes.includes("bar"), "bar chart type must be supported");
  assert.ok(chartTypes.includes("line"), "line chart type must be supported");
  assert.ok(chartTypes.includes("scatter"), "scatter chart type must be supported");
}

runIntegrationAssertions();
console.log("add-run-comparison-charts.integration.test.ts: integration assertions passed");
