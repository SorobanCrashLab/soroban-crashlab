/**
 * Tests for artifact zip generation utility.
 */

import { generateRunArtifactZip } from './artifact-zip';
import type { FuzzingRun, LedgerStateChange } from '../types';

// Import JSZip - use require for CommonJS compatibility
// eslint-disable-next-line @typescript-eslint/no-require-imports
const JSZip = require('jszip');

const mockRun: FuzzingRun = {
  id: 'test-run-001',
  status: 'failed',
  area: 'auth',
  severity: 'high',
  duration: 5000,
  seedCount: 100,
  cpuInstructions: 500000,
  memoryBytes: 2048000,
  minResourceFee: 1500,
  crashDetail: {
    failureCategory: 'panic',
    signature: 'sig-abc123',
    payload: '{"test":"data"}',
    replayAction: 'cargo test -- --nocapture',
  },
  queuedAt: '2024-01-01T00:00:00Z',
  startedAt: '2024-01-01T00:01:00Z',
  finishedAt: '2024-01-01T00:06:00Z',
};

const mockLedgerChanges: LedgerStateChange[] = [
  {
    id: 'entry-1',
    entryType: 'ContractData',
    changeType: 'created',
    after: '{"key":"value"}',
  },
  {
    id: 'entry-2',
    entryType: 'Account',
    changeType: 'updated',
    before: '{"balance":"1000"}',
    after: '{"balance":"900"}',
  },
];

async function testGenerateRunArtifactZip() {
  console.log('TEST: generateRunArtifactZip returns a Blob');
  
  const blob = await generateRunArtifactZip(mockRun, mockLedgerChanges);
  
  if (!(blob instanceof Blob)) {
    throw new Error('Expected Blob, got ' + typeof blob);
  }
  
  if (blob.type !== 'application/zip') {
    throw new Error(`Expected type 'application/zip', got '${blob.type}'`);
  }
  
  console.log('✓ Returns a Blob with correct type');
}

async function testZipContainsExpectedFiles() {
  console.log('TEST: Zip contains expected files');
  
  const blob = await generateRunArtifactZip(mockRun, mockLedgerChanges);
  const arrayBuffer = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  const fileNames = Object.keys(zip.files);
  const expectedFiles = ['manifest.json', 'metadata.json', 'traces.json', 'fixtures.json'];
  
  for (const expected of expectedFiles) {
    if (!fileNames.includes(expected)) {
      throw new Error(`Missing expected file: ${expected}`);
    }
  }
  
  console.log('✓ All expected files present in zip');
}

async function testManifestStructure() {
  console.log('TEST: Manifest has correct structure');
  
  const blob = await generateRunArtifactZip(mockRun, mockLedgerChanges);
  const arrayBuffer = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  const manifestContent = await zip.file('manifest.json')?.async('string');
  if (!manifestContent) {
    throw new Error('manifest.json not found in zip');
  }
  
  const manifest = JSON.parse(manifestContent);
  
  if (!manifest.version) {
    throw new Error('Manifest missing version field');
  }
  
  if (manifest.runId !== mockRun.id) {
    throw new Error(`Manifest runId mismatch: expected ${mockRun.id}, got ${manifest.runId}`);
  }
  
  if (!Array.isArray(manifest.files)) {
    throw new Error('Manifest files must be an array');
  }
  
  if (manifest.files.length < 3) {
    throw new Error('Manifest should list at least 3 files');
  }
  
  console.log('✓ Manifest structure is valid');
}

async function testMetadataContent() {
  console.log('TEST: Metadata file contains run data');
  
  const blob = await generateRunArtifactZip(mockRun, mockLedgerChanges);
  const arrayBuffer = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  const metadataContent = await zip.file('metadata.json')?.async('string');
  if (!metadataContent) {
    throw new Error('metadata.json not found in zip');
  }
  
  const metadata = JSON.parse(metadataContent);
  
  if (metadata.id !== mockRun.id) {
    throw new Error('Metadata id mismatch');
  }
  
  if (metadata.status !== mockRun.status) {
    throw new Error('Metadata status mismatch');
  }
  
  if (metadata.cpuInstructions !== mockRun.cpuInstructions) {
    throw new Error('Metadata cpuInstructions mismatch');
  }
  
  console.log('✓ Metadata contains correct run data');
}

async function testFixturesContent() {
  console.log('TEST: Fixtures file contains ledger changes');
  
  const blob = await generateRunArtifactZip(mockRun, mockLedgerChanges);
  const arrayBuffer = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  const fixturesContent = await zip.file('fixtures.json')?.async('string');
  if (!fixturesContent) {
    throw new Error('fixtures.json not found in zip');
  }
  
  const fixtures = JSON.parse(fixturesContent);
  
  if (!Array.isArray(fixtures)) {
    throw new Error('Fixtures should be an array');
  }
  
  if (fixtures.length !== mockLedgerChanges.length) {
    throw new Error(`Expected ${mockLedgerChanges.length} fixtures, got ${fixtures.length}`);
  }
  
  console.log('✓ Fixtures contains ledger changes');
}

async function testWithoutLedgerChanges() {
  console.log('TEST: Works without ledger changes');
  
  const blob = await generateRunArtifactZip(mockRun);
  const arrayBuffer = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  
  const fixturesContent = await zip.file('fixtures.json')?.async('string');
  if (!fixturesContent) {
    throw new Error('fixtures.json not found in zip');
  }
  
  const fixtures = JSON.parse(fixturesContent);
  
  if (!Array.isArray(fixtures) || fixtures.length !== 0) {
    throw new Error('Fixtures should be an empty array when no ledger changes provided');
  }
  
  console.log('✓ Handles missing ledger changes gracefully');
}

async function runAllTests() {
  try {
    await testGenerateRunArtifactZip();
    await testZipContainsExpectedFiles();
    await testManifestStructure();
    await testMetadataContent();
    await testFixturesContent();
    await testWithoutLedgerChanges();
    
    console.log('\n✅ All artifact-zip tests passed\n');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

runAllTests();
