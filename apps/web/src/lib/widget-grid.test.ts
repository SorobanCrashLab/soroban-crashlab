import * as assert from 'node:assert/strict';
import { getColumnCountForWidth, clampLayoutForTier, CONTAINER_TIERS } from './widget-grid';

function testTierMapping(): void {
  assert.equal(getColumnCountForWidth(0), 1);
  assert.equal(getColumnCountForWidth(639), 1);
  assert.equal(getColumnCountForWidth(640), 2);
  assert.equal(getColumnCountForWidth(767), 2);
  assert.equal(getColumnCountForWidth(768), 3);
  assert.equal(getColumnCountForWidth(1023), 3);
  assert.equal(getColumnCountForWidth(1024), 4);
  assert.equal(getColumnCountForWidth(1279), 4);
  assert.equal(getColumnCountForWidth(1280), 6);
  assert.equal(getColumnCountForWidth(2000), 6);
}

function testClampSixToThree(): void {
  const sixColLayout = [
    { id: 'w1', position: { x: 5, y: 0 } },
    { id: 'w2', position: { x: 2, y: 1 } },
    { id: 'w3', position: { x: 0, y: 0 } },
  ];
  const clamped = clampLayoutForTier(sixColLayout, 3);
  assert.equal(clamped[0].position.x, 2); // max x for 3 cols = 2
  assert.equal(clamped[1].position.x, 2);
  assert.equal(clamped[2].position.x, 0);
}

function testMirrorBreakpointsIdentical(): void {
  // Full-screen behavior identical: viewport width = container width at full-screen
  // Tier list mirrors Tailwind breakpoints sm:640 md:768 lg:1024 xl:1280
  assert.deepEqual(CONTAINER_TIERS.map((t) => t.min), [0, 640, 768, 1024, 1280]);
}

testTierMapping();
testClampSixToThree();
testMirrorBreakpointsIdentical();
console.log('widget-grid.test.ts: all assertions passed');
