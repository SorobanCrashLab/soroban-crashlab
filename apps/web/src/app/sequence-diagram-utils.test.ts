import assert from 'node:assert/strict';
import {
  buildMockSequenceSteps,
  filterSequenceSteps,
  parseSequenceSteps,
} from './sequence-diagram-utils';

function testParseAndFilter(): void {
  const parsed = parseSequenceSteps([
    {
      id: 's1',
      order: 2,
      caller: 'A',
      callee: 'B',
      method: 'ping',
      status: 'ok',
      durationMs: 10,
    },
    {
      id: 's0',
      order: 1,
      caller: 'Invoker',
      callee: 'token',
      method: 'transfer',
      status: 'error',
      durationMs: 22,
      detail: 'auth denied',
    },
    { id: 'bad' },
  ]);

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].id, 's0');
  assert.equal(parsed[1].method, 'ping');

  const errors = filterSequenceSteps(parsed, { status: 'error' });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].method, 'transfer');

  const queried = filterSequenceSteps(parsed, { query: 'auth' });
  assert.equal(queried.length, 1);
  assert.equal(queried[0].id, 's0');
}

function testMockSequence(): void {
  const steps = buildMockSequenceSteps('run-42');
  assert.ok(steps.length >= 3);
  assert.equal(steps[0].order, 1);
  assert.ok(steps.every((step) => step.id.startsWith('run-42-step-')));
}

testParseAndFilter();
testMockSequence();
console.log('sequence-diagram-utils.test.ts: all assertions passed');
