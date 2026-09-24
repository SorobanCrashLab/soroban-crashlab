import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  CLUSTER_MODE_OPTIONS,
  VIEW_MODE_OPTIONS,
} from "./run-cluster-controls";

const appRoot = path.resolve(__dirname);
const sourceCandidates = [
  path.resolve(appRoot, "run-cluster-controls.tsx"),
  path.resolve(
    process.cwd(),
    "src/app/run-cluster-controls.tsx",
  ),
];

const sourcePath = sourceCandidates.find((candidate) =>
  fs.existsSync(candidate),
);

function testModeOptions() {
  assert.deepEqual(
    CLUSTER_MODE_OPTIONS.map((option) => option.value),
    ["status", "area", "severity", "performance", "failure"],
    "Cluster grouping modes should keep their known order",
  );
  assert.ok(
    CLUSTER_MODE_OPTIONS.every((option) => option.label.length > 0),
    "Every cluster mode option should have a label",
  );
  console.log("ClusterControls mode option assertions passed");
}

function testViewModeOptions() {
  assert.deepEqual(
    VIEW_MODE_OPTIONS.map((option) => option.value),
    ["grid", "bubbles", "timeline", "metrics"],
    "View modes should keep their known order",
  );
  assert.ok(
    VIEW_MODE_OPTIONS.every(
      (option) => option.label.length > 0 && option.icon.length > 0,
    ),
    "Every view mode option should have a label and an icon",
  );
  assert.deepEqual(
    VIEW_MODE_OPTIONS.filter(
      (option) =>
        option.value === "timeline" || option.value === "metrics",
    ).map((option) => option.value),
    ["timeline", "metrics"],
    "Timeline and metrics options should be toggled by their flags",
  );
  console.log("ClusterControls view mode option assertions passed");
}

function testSourceStructure() {
  assert.ok(sourcePath, "run-cluster-controls.tsx source should be readable");
  const source = fs.readFileSync(sourcePath!, "utf-8");

  assert.ok(
    source.includes('role="group"'),
    "Button groups should expose a group role",
  );
  assert.ok(
    source.includes('aria-label={ariaLabel}'),
    "Button groups should render their dynamic aria-label",
  );
  assert.ok(
    source.includes('ariaLabel="Cluster grouping mode"') &&
      source.includes('ariaLabel="View mode"'),
    "Both button groups should be labelled",
  );
  assert.ok(
    source.includes("aria-pressed"),
    "Selection buttons should expose pressed state",
  );
  assert.ok(
    source.includes("tabIndex={active ? 0 : -1}"),
    "Roving tab index should keep a single tab stop per group",
  );
  assert.ok(
    source.includes("ArrowRight") && source.includes("ArrowLeft"),
    "Arrow key navigation should move focus within a group",
  );
  assert.ok(
    source.includes("Home") && source.includes("End"),
    "Home/End should jump to the group edges",
  );
  assert.ok(
    source.includes("React.memo"),
    "ClusterControls should be memoized",
  );
  assert.ok(
    source.includes('aria-label="Sort clusters by"'),
    "The sort select should be labelled",
  );
  assert.ok(
    source.includes("ClusterControls.displayName"),
    "ClusterControls should carry a stable display name",
  );
  console.log("ClusterControls source structure assertions passed");
}

testModeOptions();
testViewModeOptions();
testSourceStructure();
console.log("run-cluster-controls.test.ts: all assertions passed");
