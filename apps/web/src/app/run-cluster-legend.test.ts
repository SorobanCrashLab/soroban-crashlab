import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { buildLegendItems } from "./run-cluster-legend";
import { type RunCluster } from "./run-cluster-visualization-utils";
import { type FuzzingRun } from "./types";

const appRoot = path.resolve(__dirname);
const sourceCandidates = [
  path.resolve(appRoot, "run-cluster-legend.tsx"),
  path.resolve(process.cwd(), "src/app/run-cluster-legend.tsx"),
];

const sourcePath = sourceCandidates.find((candidate) =>
  fs.existsSync(candidate),
);

function makeRun(): FuzzingRun {
  return {
    id: "run-1",
    status: "completed",
    area: "auth",
    severity: "low",
    duration: 1000,
    seedCount: 10,
    crashDetail: null,
    cpuInstructions: 100,
    memoryBytes: 1024,
    minResourceFee: 0,
  };
}

function makeCluster(overrides: Partial<RunCluster>): RunCluster {
  return {
    id: "cluster-1",
    label: "Completed",
    runs: [],
    color: "blue",
    icon: "✔",
    ...overrides,
  };
}

function testBuildLegendItems() {
  const clusters: RunCluster[] = [
    makeCluster({
      id: "status-completed",
      label: "Completed",
      runs: [makeRun(), makeRun()],
      color: "green",
    }),
    makeCluster({
      id: "status-failed",
      label: "Failed",
      runs: [makeRun()],
      color: "red",
    }),
  ];

  const items = buildLegendItems(clusters);

  assert.strictEqual(items.length, 2, "One legend row per cluster");
  assert.deepEqual(
    items.map((item) => item.id),
    ["status-completed", "status-failed"],
    "Legend should preserve cluster order",
  );
  assert.strictEqual(items[0].runCount, 2, "Row should carry the run count");
  assert.ok(
    items[0].colors.border.includes("green"),
    "Row should carry the cluster's themed classes",
  );
  assert.strictEqual(items[1].label, "Failed");
  console.log("ClusterLegend buildLegendItems assertions passed");
}

function testUnknownColorFallsBack() {
  const items = buildLegendItems([
    makeCluster({ id: "x", label: "Unknown", color: "not-a-color" }),
  ]);
  assert.ok(
    items[0].colors.border.includes("zinc"),
    "Unknown colors should fall back to the gray theme",
  );
  console.log("ClusterLegend fallback assertions passed");
}

function testSourceStructure() {
  assert.ok(sourcePath, "run-cluster-legend.tsx source should be readable");
  const source = fs.readFileSync(sourcePath!, "utf-8");

  assert.ok(
    source.includes('role="list"') && source.includes('role="listitem"'),
    "Legend rows should form a labelled list",
  );
  assert.ok(
    source.includes('aria-label="Cluster legend"'),
    "The legend should be labelled",
  );
  assert.ok(
    source.includes('aria-hidden="true"'),
    "Swatches should be hidden from the accessibility tree",
  );
  assert.ok(
    source.includes("buildLegendItems"),
    "Legend rows should be derived through the pure helper",
  );
  assert.ok(
    source.includes("ClusterLegend.displayName"),
    "ClusterLegend should carry a stable display name",
  );
  console.log("ClusterLegend source structure assertions passed");
}

testBuildLegendItems();
testUnknownColorFallsBack();
testSourceStructure();
console.log("run-cluster-legend.test.ts: all assertions passed");
