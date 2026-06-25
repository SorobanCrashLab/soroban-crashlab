import * as assert from "node:assert/strict";
import { buildMockRuns } from "./mockRuns";
import {
  buildSideBySideRows,
  selectComparableRuns,
  summarizeSideBySideRows,
} from "./add-run-comparison-side-by-side-view-utils";

const runs = buildMockRuns();
const comparable = selectComparableRuns(runs);

assert.ok(comparable.length >= 2, "dashboard contract should provide runs for side-by-side comparison");

const [baseline, candidate] = comparable.slice(0, 2);
const rows = buildSideBySideRows(baseline, candidate);
const summary = summarizeSideBySideRows(rows);

assert.equal(rows.length, 9);
assert.ok(rows.some((row) => row.key === "status"));
assert.ok(rows.some((row) => row.key === "duration"));
assert.equal(typeof summary.differing, "number");

console.log("add-run-comparison-side-by-side-view.integration.test.ts: integration assertions passed");
