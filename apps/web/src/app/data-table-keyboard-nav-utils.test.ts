import * as assert from "node:assert/strict";
import {
  DATA_TABLE_ACTIVATION_KEYS,
  DATA_TABLE_NAVIGATION_KEYS,
  getDataTableRowTabIndex,
  resolveDataTableRowKeyDown,
} from "./data-table-keyboard-nav-utils";

function testActivationKeys(): void {
  for (const key of ["Enter", " "]) {
    assert.deepEqual(resolveDataTableRowKeyDown(key, 1, 5), { type: "activate" });
  }
  assert.ok(DATA_TABLE_ACTIVATION_KEYS.has("Enter"));
  assert.ok(DATA_TABLE_ACTIVATION_KEYS.has(" "));
}

function testArrowNavigation(): void {
  assert.deepEqual(resolveDataTableRowKeyDown("ArrowDown", 0, 5), {
    type: "focus",
    index: 1,
  });
  assert.deepEqual(resolveDataTableRowKeyDown("ArrowDown", 4, 5), {
    type: "focus",
    index: 4,
  });
  assert.deepEqual(resolveDataTableRowKeyDown("ArrowUp", 2, 5), {
    type: "focus",
    index: 1,
  });
  assert.deepEqual(resolveDataTableRowKeyDown("ArrowUp", 0, 5), {
    type: "focus",
    index: 0,
  });
  assert.ok(DATA_TABLE_NAVIGATION_KEYS.has("ArrowDown"));
  assert.ok(DATA_TABLE_NAVIGATION_KEYS.has("ArrowUp"));
}

function testHomeEndNavigation(): void {
  assert.deepEqual(resolveDataTableRowKeyDown("Home", 3, 5), {
    type: "focus",
    index: 0,
  });
  assert.deepEqual(resolveDataTableRowKeyDown("End", 1, 5), {
    type: "focus",
    index: 4,
  });
}

function testEmptyTable(): void {
  assert.deepEqual(resolveDataTableRowKeyDown("ArrowDown", 0, 0), {
    type: "none",
  });
  assert.equal(getDataTableRowTabIndex(0, null, 0), -1);
}

function testRovingTabIndex(): void {
  assert.equal(getDataTableRowTabIndex(0, null, 4), 0);
  assert.equal(getDataTableRowTabIndex(1, null, 4), -1);
  assert.equal(getDataTableRowTabIndex(2, 2, 4), 0);
  assert.equal(getDataTableRowTabIndex(1, 2, 4), -1);
}

function testUnhandledKeys(): void {
  assert.deepEqual(resolveDataTableRowKeyDown("Tab", 0, 3), { type: "none" });
  assert.deepEqual(resolveDataTableRowKeyDown("Escape", 0, 3), { type: "none" });
}

function runAssertions(): void {
  testActivationKeys();
  testArrowNavigation();
  testHomeEndNavigation();
  testEmptyTable();
  testRovingTabIndex();
  testUnhandledKeys();
  console.log("data-table-keyboard-nav-utils: all assertions passed");
}

runAssertions();
