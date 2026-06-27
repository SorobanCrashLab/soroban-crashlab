/**
 * Utility for generating downloadable zip archives of run artifacts.
 */

import type { FuzzingRun, LedgerStateChange } from '../types';
import { collectRunArtifacts } from './artifact-collection';

// Import JSZip - use require for CommonJS compatibility
// eslint-disable-next-line @typescript-eslint/no-require-imports
const JSZip = require('jszip');

/**
 * Generates a zip archive containing structured run artifacts.
 * 
 * The zip includes:
 * - metadata.json: Run metadata and resource metrics
 * - traces.json: Crash traces and failure details
 * - fixtures.json: Ledger state changes
 * - manifest.json: Index of all included files
 * 
 * @param run - The fuzzing run to archive
 * @param ledgerChanges - Optional ledger state changes
 * @returns Promise resolving to a Blob suitable for browser download
 */
export async function generateRunArtifactZip(
  run: FuzzingRun,
  ledgerChanges?: LedgerStateChange[]
): Promise<Blob> {
  const artifacts = collectRunArtifacts(run, ledgerChanges);
  
  const zip = new JSZip();
  
  // Add structured artifact files
  zip.file('metadata.json', JSON.stringify(artifacts.metadata, null, 2));
  zip.file('traces.json', JSON.stringify(artifacts.traces, null, 2));
  zip.file('fixtures.json', JSON.stringify(artifacts.fixtures, null, 2));
  
  // Create manifest listing all included files
  const manifest = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    runId: run.id,
    files: [
      {
        name: 'metadata.json',
        description: 'Run metadata including status, area, severity, and resource metrics',
        size: JSON.stringify(artifacts.metadata).length,
      },
      {
        name: 'traces.json',
        description: 'Crash traces and failure details',
        size: JSON.stringify(artifacts.traces).length,
      },
      {
        name: 'fixtures.json',
        description: 'Ledger state changes and contract data fixtures',
        size: JSON.stringify(artifacts.fixtures).length,
      },
    ],
  };
  
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  
  // Generate zip blob
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6, // Balanced compression
    },
  });
  
  return blob;
}
