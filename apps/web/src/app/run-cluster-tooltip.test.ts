import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const appRoot = path.resolve(__dirname);
const sourceCandidates = [
  path.resolve(appRoot, "run-cluster-tooltip.tsx"),
  path.resolve(process.cwd(), "src/app/run-cluster-tooltip.tsx"),
];

const sourcePath = sourceCandidates.find((candidate) =>
  fs.existsSync(candidate),
);

function testSourceStructure() {
  assert.ok(sourcePath, "run-cluster-tooltip.tsx source should be readable");
  const source = fs.readFileSync(sourcePath!, "utf-8");

  assert.ok(
    source.includes('role="tooltip"'),
    "The tooltip should expose the tooltip role",
  );
  assert.ok(
    source.includes("aria-hidden={!visible}"),
    "A hidden tooltip should be removed from the accessibility tree",
  );
  assert.ok(
    source.includes("opacity-0") && source.includes("opacity-100"),
    "Visibility should be purely CSS-driven for static-equivalent renders",
  );
  assert.ok(
    source.includes("pointer-events-none"),
    "The tooltip should never intercept pointer events",
  );
  assert.ok(
    source.includes("ClusterTooltip.displayName"),
    "ClusterTooltip should carry a stable display name",
  );
  console.log("ClusterTooltip source structure assertions passed");
}

testSourceStructure();
console.log("run-cluster-tooltip.test.ts: all assertions passed");
