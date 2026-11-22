#!/usr/bin/env node
/**
 * Extraction harness (phase 1, CI-warning mode — non-blocking).
 *
 * Walks `src/app` and `src/components` for hardcoded string literals that
 * look like they should be cataloged for i18n, and prints a per-file summary.
 * Never fails the build: this is a visibility tool while the i18n scaffolding
 * (see `src/i18n/`) is adopted incrementally, domain by domain.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanTextForLiterals, formatReport } from './lib/extract-messages-core.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const scanRoots = ['src/app', 'src/components'].map((dir) => path.join(webRoot, dir));

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, files);
    } else if (/\.(tsx|jsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

const resultsByFile = {};
for (const root of scanRoots) {
  for (const file of walk(root)) {
    const relative = path.relative(webRoot, file);
    const source = readFileSync(file, 'utf8');
    const findings = scanTextForLiterals(source, relative);
    if (findings.length > 0) {
      resultsByFile[relative] = findings;
    }
  }
}

console.log(formatReport(resultsByFile));
// Phase 1: always exit 0 — this is a warning surface, not a gate.
process.exit(0);
