// node --test scripts/mutation/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  criticalNewSurvivors,
  diffSurvivors,
  isCritical,
  parseCargoMutants,
  parseReport,
  parseStryker,
  renderReport,
} from './lib.mjs';

test('parseCargoMutants keeps only missed mutants and normalises paths', () => {
  const report = {
    outcomes: [
      {
        scenario: { Mutant: { name: 'replace == with !=', file: 'src\\taxonomy.rs' } },
        summary: 'Caught',
      },
      {
        scenario: { Mutant: { name: 'replace && with ||', file: './src/signature_hash.rs' } },
        summary: 'Missed',
      },
      { scenario: { Baseline: { name: 'baseline' } }, summary: 'Success' },
      {
        scenario: { Mutant: { name: 'delete !', file: 'src/replay.rs' } },
        summary: 'Timeout',
      },
    ],
  };

  const survivors = parseCargoMutants(report);
  assert.deepEqual(survivors, [
    { file: 'src/signature_hash.rs', mutant: 'replace && with ||' },
  ]);
});

test('parseCargoMutants accepts a bare outcome array and sorts deterministically', () => {
  const survivors = parseCargoMutants([
    { scenario: { Mutant: { name: 'b', file: 'src/z.rs' } }, summary: 'Missed' },
    { scenario: { Mutant: { name: 'a', file: 'src/a.rs' } }, summary: 'Missed' },
  ]);
  assert.deepEqual(survivors.map((s) => s.file), ['src/a.rs', 'src/z.rs']);
});

test('parseStryker treats survived and no-coverage mutants as survivors', () => {
  const report = {
    files: {
      'src/lib/api-key-auth.ts': {
        mutants: [
          { status: 'Killed', mutatorName: 'ConditionalExpression' },
          { status: 'Survived', mutatorName: 'BooleanLiteral' },
        ],
      },
      'src/lib/rbac.ts': {
        mutants: [{ status: 'NoCoverage', mutatorName: 'StringLiteral' }],
      },
    },
  };
  const survivors = parseStryker(report);
  assert.deepEqual(survivors, [
    { file: 'src/lib/api-key-auth.ts', mutant: 'BooleanLiteral' },
    { file: 'src/lib/rbac.ts', mutant: 'StringLiteral' },
  ]);
});

test('parseReport dispatches on format', () => {
  const text = JSON.stringify({
    outcomes: [{ scenario: { Mutant: { name: 'm', file: 'src/a.rs' } }, summary: 'Missed' }],
  });
  assert.equal(parseReport(text, 'cargo-mutants').length, 1);
  assert.equal(parseReport('{"files":{}}', 'stryker').length, 0);
});

test('isCritical matches exact paths and path tails', () => {
  const patterns = ['contracts/crashlab-core/src/taxonomy.rs'];
  assert.equal(isCritical('contracts/crashlab-core/src/taxonomy.rs', patterns), true);
  // cargo-mutants reports paths relative to the package root.
  assert.equal(isCritical('src/taxonomy.rs', patterns), true);
  assert.equal(isCritical('contracts/crashlab-core/src/replay.rs', patterns), false);
  assert.equal(isCritical('', patterns), false);
});

test('diffSurvivors splits added, removed and unchanged', () => {
  const baseline = [
    { file: 'src/a.rs', mutant: 'm1' },
    { file: 'src/b.rs', mutant: 'm2' },
  ];
  const current = [
    { file: 'src/a.rs', mutant: 'm1' },
    { file: 'src/c.rs', mutant: 'm3' },
  ];
  const diff = diffSurvivors(baseline, current);
  assert.deepEqual(diff.added, [{ file: 'src/c.rs', mutant: 'm3' }]);
  assert.deepEqual(diff.removed, [{ file: 'src/b.rs', mutant: 'm2' }]);
  assert.deepEqual(diff.unchanged, [{ file: 'src/a.rs', mutant: 'm1' }]);
});

test('diffSurvivors is order-independent', () => {
  const baseline = [
    { file: 'src/b.rs', mutant: 'm2' },
    { file: 'src/a.rs', mutant: 'm1' },
  ];
  const current = [
    { file: 'src/a.rs', mutant: 'm1' },
    { file: 'src/b.rs', mutant: 'm2' },
  ];
  const diff = diffSurvivors(baseline, current);
  assert.equal(diff.added.length, 0);
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.unchanged.length, 2);
});

test('criticalNewSurvivors only returns survivors in critical modules', () => {
  const added = [
    { file: 'src/taxonomy.rs', mutant: 'm1' },
    { file: 'src/unrelated.rs', mutant: 'm2' },
  ];
  const critical = criticalNewSurvivors(added, ['contracts/crashlab-core/src/taxonomy.rs']);
  assert.deepEqual(critical, [{ file: 'src/taxonomy.rs', mutant: 'm1' }]);
});

test('renderReport is deterministic and flags critical survivors', () => {
  const report = renderReport({
    added: [{ file: 'src/taxonomy.rs', mutant: 'm1' }],
    removed: [],
    unchanged: [{ file: 'src/replay.rs', mutant: 'm0' }],
    criticalPatterns: ['contracts/crashlab-core/src/taxonomy.rs'],
  });
  assert.equal(
    report,
    [
      'survivors: 2 (baseline 1, new 1)',
      'unchanged baseline survivors (1):',
      '  = src/replay.rs::m0',
      'NEW survivors (1):',
      '  + src/taxonomy.rs::m1 [critical]',
    ].join('\n'),
  );
});

test('renderReport says so when there are no new survivors', () => {
  const report = renderReport({ added: [], removed: [], unchanged: [] });
  assert.match(report, /no new survivors/);
});
