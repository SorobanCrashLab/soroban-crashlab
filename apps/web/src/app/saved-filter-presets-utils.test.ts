import {
  createPreset,
  serializeFiltersToUrl,
  deserializeFiltersFromUrl,
  exportPresetAsJson,
  importPresetFromJson,
  generatePresetId,
} from './saved-filter-presets-utils';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function testCreatePreset() {
  const preset = createPreset('Critical Failures', 'Only failed runs', { status: 'failed', severity: 'critical' });
  assert(preset.name === 'Critical Failures', 'Name should match');
  assert(preset.description === 'Only failed runs', 'Description should match');
  assert(preset.filters.status === 'failed', 'Status filter should match');
  assert(preset.filters.severity === 'critical', 'Severity filter should match');
  assert(preset.id.startsWith('preset-'), 'ID should start with preset-');
  assert(preset.createdAt === preset.updatedAt, 'Created at should equal updated at');
  console.log('  ✓ createPreset works');
}

function testGeneratePresetId() {
  const id1 = generatePresetId();
  const id2 = generatePresetId();
  assert(id1 !== id2, 'IDs should be unique');
  console.log('  ✓ generatePresetId returns unique IDs');
}

function testSerializeFiltersToUrl() {
  const qs = serializeFiltersToUrl({ status: 'failed', severity: 'critical' });
  assert(qs.includes('status=failed'), 'Query string should include status');
  assert(qs.includes('severity=critical'), 'Query string should include severity');
  console.log('  ✓ serializeFiltersToUrl works');
}

function testDeserializeFiltersFromUrl() {
  const filters = deserializeFiltersFromUrl('status=failed&severity=critical');
  assert(filters.status === 'failed', 'Should deserialize status');
  assert(filters.severity === 'critical', 'Should deserialize severity');
  console.log('  ✓ deserializeFiltersFromUrl works');
}

function testExportImportRoundtrip() {
  const preset = createPreset('Test', 'Desc', { key: 'value' });
  const json = exportPresetAsJson(preset);
  const imported = importPresetFromJson(json);
  if (imported === null) throw new Error('Import should succeed');
  assert(imported.name === 'Test', 'Name should match');
  assert(imported.filters.key === 'value', 'Filters should match');
  assert(imported.id !== preset.id, 'ID should be regenerated');
  console.log('  ✓ Export/import roundtrip works');
}

function testImportInvalidJson() {
  const result = importPresetFromJson('{invalid}');
  assert(result === null, 'Should return null for invalid JSON');
  console.log('  ✓ Invalid JSON import returns null');
}

function testImportMissingFields() {
  const result = importPresetFromJson('{"name": "Test"}');
  assert(result === null, 'Should return null for missing filters');
  console.log('  ✓ Import with missing fields returns null');
}

const tests = [
  testCreatePreset,
  testGeneratePresetId,
  testSerializeFiltersToUrl,
  testDeserializeFiltersFromUrl,
  testExportImportRoundtrip,
  testImportInvalidJson,
  testImportMissingFields,
];

let passed = 0;
let failed = 0;
for (const test of tests) {
  try {
    test();
    passed++;
  } catch (e) {
    console.error(`  ✗ ${test.name}: ${(e as Error).message}`);
    failed++;
  }
}
console.log(`\n${passed} passed, ${failed} failed`);
