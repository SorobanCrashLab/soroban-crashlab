import * as assert from 'node:assert/strict';
import {
  createInitialState,
  handleLift,
  handleMove,
  handleDrop,
  handleCancel,
  getRovingTabIndex,
} from './triage-board-keyboard';

function testLift(): void {
  const s = createInitialState('r1');
  const next = handleLift(s, 'r1', { col: 'failed', index: 0 });
  assert.equal(next.liftedId, 'r1');
  assert.ok(next.announcement.includes('Lifted'));
  // illegal double lift = no-op
  const double = handleLift(next, 'r1', { col: 'failed', index: 0 });
  assert.equal(double, next);
}

function testMoveIllegalNoOp(): void {
  const s = handleLift(createInitialState('r1'), 'r1', { col: 'failed', index: 0 });
  const moved = handleMove(s, 'left', ['failed', 'active', 'cancelled'], { failed: 2, active: 1, cancelled: 1 });
  assert.equal(moved, s); // left from first column = no-op
}

function testDropAndCancel(): void {
  const lifted = handleLift(createInitialState('r1'), 'r1', { col: 'failed', index: 0 });
  const dropped = handleDrop(lifted, 'active');
  assert.equal(dropped.liftedId, null);
  assert.ok(dropped.announcement.includes('Dropped'));
  const lifted2 = handleLift(createInitialState('r2'), 'r2', { col: 'active', index: 0 });
  const cancelled = handleCancel(lifted2);
  assert.equal(cancelled.liftedId, null);
  assert.ok(cancelled.announcement.includes('Cancelled'));
}

function testRovingTabIndex(): void {
  assert.equal(getRovingTabIndex('r1', 'r1', false), 0);
  assert.equal(getRovingTabIndex('r2', 'r1', false), -1);
  assert.equal(getRovingTabIndex('r1', null, true), 0);
  assert.equal(getRovingTabIndex('r2', null, false), -1);
}

testLift();
testMoveIllegalNoOp();
testDropAndCancel();
testRovingTabIndex();
console.log('triage-board-keyboard.test.ts: all assertions passed');
