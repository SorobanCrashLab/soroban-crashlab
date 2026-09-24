/**
 * Unit tests for the artifact record utilities merged into
 * src/lib/artifact-fs-adapter.ts (originally app/utils/artifact-fs-adapter.ts).
 *
 * Validates artifact record validation, id generation, path building,
 * filtering, grouping, and security checks.
 */

import * as assert from 'node:assert/strict';
import {
  validateArtifactMetadata,
  generateArtifactId,
  parseArtifactId,
  getArtifactExtension,
  buildArtifactPath,
  validateArtifactSize,
  filterArtifactsByType,
  sortArtifactsByTime,
  groupArtifactsByRun,
  calculateTotalSize,
  findArtifactById,
  isSafeArtifactPath,
  type ArtifactRecord,
} from './artifact-fs-adapter';

const runAssertions = async (): Promise<void> => {
  // Test validateArtifactMetadata - happy path
  const validMetadata: ArtifactRecord = {
    id: 'artifact-001',
    runId: 'run-123',
    type: 'crash',
    size: 1024,
    timestamp: Date.now(),
    path: 'artifacts/run-123/artifact-001.crash.json',
  };

  const result1 = validateArtifactMetadata(validMetadata);
  assert.equal(result1.valid, true);
  assert.equal(result1.errors.length, 0);

  // Test validateArtifactMetadata - edge cases and errors
  const result2 = validateArtifactMetadata(null);
  assert.equal(result2.valid, false);
  assert.ok(result2.errors.length > 0);

  const result3 = validateArtifactMetadata({});
  assert.equal(result3.valid, false);
  assert.ok(result3.errors.some((e) => e.includes('id')));
  assert.ok(result3.errors.some((e) => e.includes('runId')));
  assert.ok(result3.errors.some((e) => e.includes('type')));

  const invalidType = { ...validMetadata, type: 'invalid' };
  const result4 = validateArtifactMetadata(invalidType);
  assert.equal(result4.valid, false);
  assert.ok(result4.errors.some((e) => e.includes('type')));

  const negativeSize = { ...validMetadata, size: -100 };
  const result5 = validateArtifactMetadata(negativeSize);
  assert.equal(result5.valid, false);
  assert.ok(result5.errors.some((e) => e.includes('size')));

  const invalidTimestamp = { ...validMetadata, timestamp: -1 };
  const result6 = validateArtifactMetadata(invalidTimestamp);
  assert.equal(result6.valid, false);
  assert.ok(result6.errors.some((e) => e.includes('timestamp')));

  // Test all valid types
  const validTypes = ['crash', 'seed', 'trace', 'coverage'];
  for (const type of validTypes) {
    const metadata = { ...validMetadata, type };
    const result = validateArtifactMetadata(metadata);
    assert.equal(result.valid, true, `Type ${type} should be valid`);
  }

  // Test generateArtifactId - happy path
  const artifactId1 = generateArtifactId('run-100', 'crash', 0);
  assert.ok(artifactId1.startsWith('artifact-run-100-crash-0-'));
  assert.ok(artifactId1.length > 30);

  const artifactId2 = generateArtifactId('run-200', 'seed', 5);
  assert.ok(artifactId2.startsWith('artifact-run-200-seed-5-'));

  // Different calls should generate different IDs (due to timestamp)
  const id1 = generateArtifactId('run-1', 'crash');
  await new Promise((resolve) => setTimeout(resolve, 2));
  const id2 = generateArtifactId('run-1', 'crash');
  assert.notEqual(id1, id2);

  // Test parseArtifactId - happy path
  const parsed1 = parseArtifactId('artifact-run-100-crash-0-1234567890');
  assert.equal(parsed1.runId, 'run-100');
  assert.equal(parsed1.type, 'crash');
  assert.equal(parsed1.index, 0);
  assert.equal(parsed1.timestamp, 1234567890);

  const parsed2 = parseArtifactId('artifact-run-200-seed-5-9876543210');
  assert.equal(parsed2.runId, 'run-200');
  assert.equal(parsed2.type, 'seed');
  assert.equal(parsed2.index, 5);
  assert.equal(parsed2.timestamp, 9876543210);

  // Test parseArtifactId - edge cases
  const invalidParse1 = parseArtifactId('invalid-id');
  assert.equal(invalidParse1.runId, null);
  assert.equal(invalidParse1.type, null);
  assert.equal(invalidParse1.index, null);
  assert.equal(invalidParse1.timestamp, null);

  const invalidParse2 = parseArtifactId('artifact-only-three-parts');
  assert.equal(invalidParse2.runId, null);

  const invalidParse3 = parseArtifactId('');
  assert.equal(invalidParse3.runId, null);

  // Test round-trip: generate and parse
  const generatedId = generateArtifactId('run-999', 'trace', 3);
  const parsedGenerated = parseArtifactId(generatedId);
  assert.equal(parsedGenerated.runId, 'run-999');
  assert.equal(parsedGenerated.type, 'trace');
  assert.equal(parsedGenerated.index, 3);
  assert.ok(parsedGenerated.timestamp !== null);

  // Test getArtifactExtension - happy path
  assert.equal(getArtifactExtension('crash'), '.crash.json');
  assert.equal(getArtifactExtension('seed'), '.seed.bin');
  assert.equal(getArtifactExtension('trace'), '.trace.log');
  assert.equal(getArtifactExtension('coverage'), '.coverage.json');
  assert.equal(getArtifactExtension('unknown'), '.artifact');

  // Test buildArtifactPath - happy path
  const path1 = buildArtifactPath('run-100', 'artifact-001', 'crash');
  assert.equal(path1, 'artifacts/run-100/artifact-001.crash.json');

  const path2 = buildArtifactPath('run-200', 'artifact-002', 'seed');
  assert.equal(path2, 'artifacts/run-200/artifact-002.seed.bin');

  const path3 = buildArtifactPath('run-300', 'artifact-003', 'trace');
  assert.equal(path3, 'artifacts/run-300/artifact-003.trace.log');

  // Test validateArtifactSize - happy path
  assert.equal(validateArtifactSize(0), true);
  assert.equal(validateArtifactSize(1024), true);
  assert.equal(validateArtifactSize(10_485_760), true); // Exactly at default max
  assert.equal(validateArtifactSize(10_485_761), false); // Over default max

  // Test with custom max size
  assert.equal(validateArtifactSize(5_000, 10_000), true);
  assert.equal(validateArtifactSize(15_000, 10_000), false);

  // Edge cases
  assert.equal(validateArtifactSize(-1), false);
  assert.equal(validateArtifactSize(0, 0), true);

  // Test filterArtifactsByType - happy path
  const artifacts: ArtifactRecord[] = [
    { ...validMetadata, id: 'a1', type: 'crash' },
    { ...validMetadata, id: 'a2', type: 'seed' },
    { ...validMetadata, id: 'a3', type: 'crash' },
    { ...validMetadata, id: 'a4', type: 'trace' },
  ];

  const crashes = filterArtifactsByType(artifacts, 'crash');
  assert.equal(crashes.length, 2);
  assert.ok(crashes.every((a) => a.type === 'crash'));

  const seeds = filterArtifactsByType(artifacts, 'seed');
  assert.equal(seeds.length, 1);
  assert.equal(seeds[0].id, 'a2');

  const coverage = filterArtifactsByType(artifacts, 'coverage');
  assert.equal(coverage.length, 0);

  // Test sortArtifactsByTime - happy path
  const unsorted: ArtifactRecord[] = [
    { ...validMetadata, id: 'a1', timestamp: 300 },
    { ...validMetadata, id: 'a2', timestamp: 100 },
    { ...validMetadata, id: 'a3', timestamp: 200 },
  ];

  const sorted = sortArtifactsByTime(unsorted);
  assert.equal(sorted[0].id, 'a1'); // Newest first (300)
  assert.equal(sorted[1].id, 'a3');
  assert.equal(sorted[2].id, 'a2'); // Oldest last (100)

  // Original array should not be modified
  assert.equal(unsorted[0].id, 'a1');

  // Edge case: empty array
  assert.deepEqual(sortArtifactsByTime([]), []);

  // Edge case: single item
  const single = [{ ...validMetadata, id: 'only', timestamp: 100 }];
  assert.equal(sortArtifactsByTime(single).length, 1);

  // Test groupArtifactsByRun - happy path
  const multiRunArtifacts: ArtifactRecord[] = [
    { ...validMetadata, id: 'a1', runId: 'run-1' },
    { ...validMetadata, id: 'a2', runId: 'run-2' },
    { ...validMetadata, id: 'a3', runId: 'run-1' },
    { ...validMetadata, id: 'a4', runId: 'run-3' },
    { ...validMetadata, id: 'a5', runId: 'run-1' },
  ];

  const grouped = groupArtifactsByRun(multiRunArtifacts);
  assert.equal(grouped.size, 3);
  assert.equal(grouped.get('run-1')?.length, 3);
  assert.equal(grouped.get('run-2')?.length, 1);
  assert.equal(grouped.get('run-3')?.length, 1);

  const run1Artifacts = grouped.get('run-1') ?? [];
  assert.ok(run1Artifacts.every((a) => a.runId === 'run-1'));

  // Edge case: empty array
  const emptyGroups = groupArtifactsByRun([]);
  assert.equal(emptyGroups.size, 0);

  // Test calculateTotalSize - happy path
  const sizedArtifacts: ArtifactRecord[] = [
    { ...validMetadata, id: 'a1', size: 1000 },
    { ...validMetadata, id: 'a2', size: 2000 },
    { ...validMetadata, id: 'a3', size: 3000 },
  ];

  const total = calculateTotalSize(sizedArtifacts);
  assert.equal(total, 6000);

  // Edge cases
  assert.equal(calculateTotalSize([]), 0);
  assert.equal(calculateTotalSize([{ ...validMetadata, size: 0 }]), 0);

  // Test findArtifactById - happy path
  const searchArtifacts: ArtifactRecord[] = [
    { ...validMetadata, id: 'artifact-1' },
    { ...validMetadata, id: 'artifact-2' },
    { ...validMetadata, id: 'artifact-3' },
  ];

  const found = findArtifactById(searchArtifacts, 'artifact-2');
  assert.ok(found !== null);
  assert.equal(found.id, 'artifact-2');

  const notFound = findArtifactById(searchArtifacts, 'artifact-999');
  assert.equal(notFound, null);

  // Edge cases
  assert.equal(findArtifactById([], 'any-id'), null);

  // Test isSafeArtifactPath - happy path
  assert.equal(isSafeArtifactPath('artifacts/run-1/file.json'), true);
  assert.equal(isSafeArtifactPath('artifacts/run-2/crash.crash.json'), true);
  assert.equal(isSafeArtifactPath('artifacts/run-3/nested/file.bin'), true);

  // Test isSafeArtifactPath - security edge cases
  assert.equal(isSafeArtifactPath('../etc/passwd'), false);
  assert.equal(isSafeArtifactPath('artifacts/../etc/passwd'), false);
  assert.equal(isSafeArtifactPath('artifacts/run/../etc/passwd'), false);
  assert.equal(isSafeArtifactPath('/absolute/path'), false);
  assert.equal(isSafeArtifactPath('C:\\Windows\\System32'), false);
  assert.equal(isSafeArtifactPath('not-artifacts/file.json'), false);
  assert.equal(isSafeArtifactPath(''), false);

  // Windows-style paths
  assert.equal(isSafeArtifactPath('artifacts\\run-1\\file.json'), true);
  assert.equal(isSafeArtifactPath('artifacts\\..\\etc\\passwd'), false);

  // Tricky cases
  assert.equal(isSafeArtifactPath('artifactsmalicious/file.json'), false);
  assert.equal(isSafeArtifactPath('artifacts/'), true);
};

runAssertions().catch((err) => {
  console.error(err);
  process.exit(1);
});
console.log('artifact-fs-adapter utils: all assertions passed');