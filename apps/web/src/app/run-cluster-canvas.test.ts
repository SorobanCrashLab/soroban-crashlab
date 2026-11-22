import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { bubbleSizeFor } from "./run-cluster-canvas";

const appRoot = path.resolve(__dirname);
const sourceCandidates = [
  path.resolve(appRoot, "run-cluster-canvas.tsx"),
  path.resolve(process.cwd(), "src/app/run-cluster-canvas.tsx"),
];

const sourcePath = sourceCandidates.find((candidate) =>
  fs.existsSync(candidate),
);

function testBubbleSizeFor() {
  assert.strictEqual(
    bubbleSizeFor(1),
    60,
    "Small clusters should clamp to the minimum bubble size",
  );
  assert.strictEqual(
    bubbleSizeFor(12),
    120,
    "Large clusters should clamp to the maximum bubble size",
  );
  assert.strictEqual(bubbleSizeFor(7), 70, "Mid-size clusters scale linearly");
  assert.strictEqual(
    bubbleSizeFor(0),
    60,
    "Empty clusters should still get a readable bubble",
  );
  console.log("ClusterCanvas bubbleSizeFor assertions passed");
}

function testSourceStructure() {
  assert.ok(sourcePath, "run-cluster-canvas.tsx source should be readable");
  const source = fs.readFileSync(sourcePath!, "utf-8");

  assert.ok(
    source.includes("React.memo") || source.includes("memo<"),
    "ClusterCanvas and view surfaces should be memoized",
  );
  assert.ok(
    source.includes('role="region"'),
    "Each view should be exposed as a labelled region",
  );
  assert.ok(
    source.includes('aria-label="Cluster visualization grid"'),
    "The grid view should be labelled",
  );
  assert.ok(
    source.includes("ClusterLegend"),
    "The bubbles view should render a legend",
  );
  assert.ok(
    source.includes("ClusterTooltip"),
    "Bubbles should render a styled tooltip",
  );
  assert.ok(
    source.includes('role="button"') && source.includes("tabIndex"),
    "Cards and bubbles should be keyboard-operable",
  );
  assert.ok(
    source.includes("Enter") && source.includes("event.key === \" \""),
    "Cards and bubbles should activate on Enter and Space",
  );
  assert.ok(
    source.includes("onFocus") && source.includes("onBlur"),
    "Bubbles should surface their tooltip on focus",
  );
  assert.ok(
    source.includes("onSelect={onClusterSelect}"),
    "Canvas should forward selection to the parent",
  );
  console.log("ClusterCanvas source structure assertions passed");
}

testBubbleSizeFor();
testSourceStructure();
console.log("run-cluster-canvas.test.ts: all assertions passed");
