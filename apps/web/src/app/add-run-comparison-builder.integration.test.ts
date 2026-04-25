import * as assert from "node:assert/strict";
import { buildMockRuns } from "./mockRuns.ts";
import { COMPARISON_MODES, buildComparisonRows } from "./add-run-comparison-builder-utils.ts";

function testIntegrationContract(): void {
  const dashboardRuns = buildMockRuns();
  const comparable = dashboardRuns.filter((run) => run.status !== "cancelled");
  assert.ok(comparable.length >= 2, "dashboard should expose enough runs to compare");

  const baseline = comparable[0];
  const candidate = comparable[1];
  const metrics = COMPARISON_MODES.find((mode) => mode.id === "performance")?.metrics ?? [];
  const rows = buildComparisonRows(baseline, candidate, metrics);

  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((row) => row.metric),
    ["duration", "cpuInstructions", "memoryBytes"],
  );
}

testIntegrationContract();
console.log("add-run-comparison-builder.integration.test.ts: integration assertions passed");
