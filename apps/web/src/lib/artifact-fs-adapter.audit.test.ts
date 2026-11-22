/**
 * Export audit for the merged artifact fs adapter (#1606).
 *
 * Guards the single canonical home for artifact fs behavior:
 *  - every symbol consumers rely on is still exported from
 *    `src/lib/artifact-fs-adapter.ts`; and
 *  - no divergent same-named `artifact-fs-adapter` module exists anywhere
 *    else in the tree (the old `app/utils` copy is deleted).
 */

import * as assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as adapter from './artifact-fs-adapter';
import type {
  ArtifactMetadata,
  ArtifactRecord,
  ArtifactContent,
  ArtifactValidationResult,
} from './artifact-fs-adapter';

const FUNCTION_EXPORTS = [
  'getArtifactDirOrCreate',
  'listArtifactMetadata',
  'getArtifactById',
  'deleteArtifactById',
  'saveArtifact',
  'validateArtifactMetadata',
  'generateArtifactId',
  'parseArtifactId',
  'getArtifactExtension',
  'buildArtifactPath',
  'validateArtifactSize',
  'filterArtifactsByType',
  'sortArtifactsByTime',
  'groupArtifactsByRun',
  'calculateTotalSize',
  'findArtifactById',
  'isSafeArtifactPath',
];

// Type exports are erased at runtime, so they are audited at compile time:
// if any of these names stop being exported, this file stops compiling.
type ExportAudit = {
  ArtifactMetadata: ArtifactMetadata;
  ArtifactRecord: ArtifactRecord;
  ArtifactContent: ArtifactContent;
  ArtifactValidationResult: ArtifactValidationResult;
};
const _typeExportsAudit: ExportAudit = {} as ExportAudit;
void _typeExportsAudit;

/** Locate the apps/web/src root by walking up from the working directory. */
function findWebSrc(): string {
  let dir = path.resolve(process.cwd());
  while (true) {
    const candidate = path.join(dir, 'apps', 'web', 'src');
    if (fs.existsSync(path.join(candidate, 'lib'))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not locate apps/web/src from the working directory');
}

const runAssertions = (): void => {
  for (const name of FUNCTION_EXPORTS) {
    assert.equal(
      typeof (adapter as unknown as Record<string, unknown>)[name],
      'function',
      `expected function export "${name}"`,
    );
  }

  const webSrc = findWebSrc();
  const duplicates: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name === 'artifact-fs-adapter.ts') {
        duplicates.push(full);
      }
    }
  };
  walk(webSrc);

  assert.deepEqual(
    duplicates.map((d) => path.relative(webSrc, d).split(path.sep).join('/')),
    ['lib/artifact-fs-adapter.ts'],
    'artifact-fs-adapter.ts must exist only under src/lib',
  );
};

runAssertions();
console.log('artifact-fs-adapter export audit: all assertions passed');