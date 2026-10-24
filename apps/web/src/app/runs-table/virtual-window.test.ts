import * as assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  DEFAULT_OVERSCAN,
  computeVirtualWindow,
  estimateMaxWindowRows,
} from './virtual-window';

function testEmptyList(): void {
  const window = computeVirtualWindow({
    scrollTop: 0,
    viewportHeight: 600,
    rowHeight: 57,
    rowCount: 0,
  });
  assert.equal(window.count, 0);
  assert.equal(window.totalHeight, 0);
  assert.equal(window.lastIndex, -1);
}

function testTopOfList(): void {
  const window = computeVirtualWindow({
    scrollTop: 0,
    viewportHeight: 570,
    rowHeight: 57,
    rowCount: 1000,
  });
  assert.equal(window.firstIndex, 0);
  assert.equal(window.lastIndex, 10 + DEFAULT_OVERSCAN);
  assert.equal(window.offsetTop, 0);
  assert.equal(window.totalHeight, 57 * 1000);
}

function testMiddleOfList(): void {
  const rowHeight = 57;
  const window = computeVirtualWindow({
    scrollTop: 57 * 500,
    viewportHeight: 570,
    rowHeight,
    rowCount: 100_000,
  });
  assert.equal(window.firstIndex, 500 - DEFAULT_OVERSCAN);
  assert.ok(window.lastIndex > 510);
  assert.equal(window.offsetTop, window.firstIndex * rowHeight);
  assert.equal(window.totalHeight, rowHeight * 100_000);
}

function testClampsAtEnd(): void {
  const window = computeVirtualWindow({
    scrollTop: 57 * 999, // beyond the last row
    viewportHeight: 570,
    rowHeight: 57,
    rowCount: 1000,
  });
  assert.equal(window.lastIndex, 999);
  assert.ok(window.firstIndex <= 999);
  assert.ok(window.count >= 1);
}

function testNegativeAndInvalidInputs(): void {
  const negative = computeVirtualWindow({
    scrollTop: -100,
    viewportHeight: -10,
    rowHeight: 57,
    rowCount: 10,
  });
  assert.equal(negative.firstIndex, 0);
  assert.equal(negative.lastIndex, DEFAULT_OVERSCAN);

  const invalid = computeVirtualWindow({
    scrollTop: Number.NaN,
    viewportHeight: Number.NaN,
    rowHeight: 57,
    rowCount: 10,
  });
  assert.equal(invalid.firstIndex, 0);

  const noRows = computeVirtualWindow({
    scrollTop: 0,
    viewportHeight: 600,
    rowHeight: 0,
    rowCount: 10,
  });
  assert.equal(noRows.count, 0);
}

function testWindowSizeIsBounded(): void {
  const viewportHeight = 768;
  const rowHeight = 57;
  const maxRows = estimateMaxWindowRows(viewportHeight, rowHeight);

  for (let scrollTop = 0; scrollTop < 57 * 100_000; scrollTop += 997) {
    const window = computeVirtualWindow({ scrollTop, viewportHeight, rowHeight, rowCount: 100_000 });
    assert.ok(
      window.count <= maxRows + 1,
      `window rendered ${window.count} rows for scrollTop=${scrollTop}`,
    );
  }
}

function test100kRowsUnderBudget(): void {
  // 100k-row windowing must stay trivially cheap: 20k recomputations
  // (a full minute of 60fps scrolling) well under a generous CI budget.
  const rowHeight = 57;
  const rowCount = 100_000;
  const viewportHeight = 768;
  const startedAt = performance.now();

  let checksum = 0;
  for (let i = 0; i < 20_000; i += 1) {
    const scrollTop = (i * 7919) % (rowHeight * rowCount);
    const window = computeVirtualWindow({ scrollTop, viewportHeight, rowHeight, rowCount });
    checksum += window.firstIndex + window.lastIndex + window.count;
  }

  const elapsed = performance.now() - startedAt;
  assert.ok(checksum > 0);
  assert.ok(elapsed < 250, `windowing 100k rows took ${elapsed.toFixed(1)}ms (budget 250ms)`);
}

describe('virtual-window', () => {
  it('handles an empty list', testEmptyList);
  it('renders the top of the list', testTopOfList);
  it('renders the middle of a 100k-row list', testMiddleOfList);
  it('clamps at the last row', testClampsAtEnd);
  it('clamps negative and invalid inputs', testNegativeAndInvalidInputs);
  it('bounds the number of rendered rows', testWindowSizeIsBounded);
  it('windows 100k rows within the time budget', test100kRowsUnderBudget);
});
