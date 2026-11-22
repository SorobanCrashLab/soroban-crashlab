#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

// Add an origin only after maintainer review and an integrity/risk discussion.
export const ALLOWED_EXTERNAL_ORIGINS = new Set();
const DEFAULT_FILES = [path.resolve('apps/web/src/app/layout.tsx')];

export function findExternalOrigins(source, sourceName = 'source') {
  const violations = [];
  const tagPattern = /<(?:link|script)\b[^>]*?(?:href|src)\s*=\s*["']([^"']+)["'][^>]*>/gi;
  for (const match of source.matchAll(tagPattern)) {
    const value = match[1];
    if (!/^https?:\/\//i.test(value)) continue;
    const origin = new URL(value).origin;
    if (!ALLOWED_EXTERNAL_ORIGINS.has(origin)) {
      violations.push(`${sourceName}: external origin ${origin} is not allowlisted`);
    }
  }
  return violations;
}

function checkFiles(files) {
  const violations = files.flatMap((file) => findExternalOrigins(fs.readFileSync(file, 'utf8'), file));
  if (violations.length) {
    console.error(violations.join('\n'));
    process.exitCode = 1;
    return false;
  }
  return true;
}

function selfTest() {
  const violations = findExternalOrigins('<head><script src="https://unapproved.example/app.js"></script></head>', 'injected-fixture');
  if (violations.length !== 1) throw new Error('self-test failed: injected external origin was not rejected');
  console.log('external-origin checker self-test passed');
}

if (process.argv.includes('--self-test')) selfTest();
else checkFiles(process.argv.slice(2).map((file) => path.resolve(file)).concat(process.argv.slice(2).length ? [] : DEFAULT_FILES));