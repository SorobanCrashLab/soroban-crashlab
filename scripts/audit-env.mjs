#!/usr/bin/env node
/**
 * Audit environment-variable drift across code readsites and documentation.
 *
 * Web (apps/web): process.env / import.meta.env + storage env-config string keys
 *   → must appear in apps/web/.env.example and docs/ENV.md
 * Rust (contracts): std::env::var("…")
 *   → must appear in docs/ENV.md (not required in web .env.example)
 * Docker Compose subset: vars in .env.example that Compose commonly forwards
 *   → should appear in .env.docker.example (Vercel/Sentry/cloud skips allowed)
 *
 * Exit 1 on drift.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const IGNORE = new Set([
  'NODE_ENV',
  'CI',
  'TZ',
  'HOME',
  'PATH',
  'PWD',
  'SHELL',
  'USER',
  'LANG',
  'TERM',
  'TMPDIR',
  'GITHUB_SHA',
  'GITHUB_TOKEN',
  'GITHUB_ACTIONS',
  'GITHUB_REF',
  'GITHUB_REPOSITORY',
  'VERCEL',
  'VERCEL_ENV',
  'VERCEL_URL',
  'VERCEL_GIT_COMMIT_SHA',
  'VERCEL_ORG_ID',
  'VERCEL_PROJECT_ID',
  'VERCEL_TOKEN',
  'ANALYZE',
  'CLUSTER_BENCHMARK',
  'NEXT_RUNTIME',
  'NEXT_PHASE',
]);

/** Documented / package-consumed vars that may not appear as process.env.X in src. */
const EXAMPLE_ALLOW_UNREAD = new Set([
  'NEXT_PUBLIC_APP_URL', // operator contract; consumed via platform / future routes
  'UPLOADTHING_SECRET', // read by uploadthing SDK, not direct process.env in src
  'SENTRY_AUTH_TOKEN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
  'SENTRY_RELEASE',
]);

const DOCS_ONLY_OK = new Set([
  'NEXT_PUBLIC_VERCEL_ENV',
  'NEXT_PUBLIC_VERCEL_ANALYTICS_ID',
  'SENTRY_RELEASE',
  'VERCEL_GIT_COMMIT_SHA',
  'GITHUB_SHA',
  'VERCEL_TOKEN',
  'VERCEL_ORG_ID',
  'VERCEL_PROJECT_ID',
]);

const DOCKER_SKIP = new Set([
  'SENTRY_AUTH_TOKEN',
  'SENTRY_ORG',
  'SENTRY_PROJECT',
  'SENTRY_RELEASE',
  'UPLOADTHING_SECRET',
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'POSTGRES_URL_NON_POOLING',
  'DATABASE_URL',
  'DB_POOL_MAX',
  'CRASHLAB_S3_ACCESS_KEY_ID',
  'CRASHLAB_S3_SECRET_ACCESS_KEY',
  'CRASHLAB_S3_SESSION_TOKEN',
  'CRASHLAB_S3_ENDPOINT',
  'CRASHLAB_S3_REGION',
  'CRASHLAB_S3_BUCKET',
  'CRASHLAB_STORAGE_DRIVER',
  'CRASHLAB_CONTRACT_WASM',
  'CRASHLAB_RPC_URL',
  'CRASHLAB_CONTRACT_ID',
  'CRASHLAB_RUNNER',
  'CRASHLAB_STATE_DIR',
  'CRASHLAB_OUTPUT_FORMAT',
  'CRASHLAB_PRESET',
  ...DOCS_ONLY_OK,
]);

function walk(dir, pred, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', 'build', 'target', 'dist'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, pred, out);
    else if (pred(full)) out.push(full);
  }
  return out;
}

function isValidEnvName(name) {
  return /^[A-Z][A-Z0-9_]*[A-Z0-9]$/.test(name) || /^[A-Z][A-Z0-9_]*[0-9]$/.test(name)
    ? true
    : /^[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+$/.test(name);
}

function extractProcessEnv(source) {
  const names = new Set();
  const re = /(?:process\.env|import\.meta\.env)\.([A-Z][A-Z0-9_]*)/g;
  for (const m of source.matchAll(re)) {
    if (isValidEnvName(m[1])) names.add(m[1]);
  }
  const bracket = /(?:process\.env|import\.meta\.env)\[['\"]([A-Z][A-Z0-9_]*)['\"]\]/g;
  for (const m of source.matchAll(bracket)) {
    if (isValidEnvName(m[1])) names.add(m[1]);
  }
  return names;
}

function extractRustEnv(source) {
  const names = new Set();
  const re = /env::var\(\s*"([A-Z][A-Z0-9_]*)"\s*\)/g;
  for (const m of source.matchAll(re)) {
    if (isValidEnvName(m[1])) names.add(m[1]);
  }
  return names;
}

function extractEnvConfigStrings(source) {
  const names = new Set();
  const re = /['"](CRASHLAB_[A-Z0-9_]+)['"]/g;
  for (const m of source.matchAll(re)) {
    if (isValidEnvName(m[1])) names.add(m[1]);
  }
  return names;
}

function parseEnvExample(filePath) {
  const names = new Set();
  if (!fs.existsSync(filePath)) return names;
  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([A-Z][A-Z0-9_]*)=/);
    if (m && isValidEnvName(m[1])) names.add(m[1]);
  }
  return names;
}

function extractEnvMd(filePath) {
  const names = new Set();
  if (!fs.existsSync(filePath)) return names;
  const text = fs.readFileSync(filePath, 'utf8');
  const skip = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'F12']);
  for (const m of text.matchAll(/`([A-Z][A-Z0-9_]+)`/g)) {
    if (skip.has(m[1])) continue;
    if (isValidEnvName(m[1])) names.add(m[1]);
  }
  return names;
}

function collectWebReads() {
  const names = new Set();
  const webFiles = walk(
    path.join(ROOT, 'apps/web/src'),
    (f) => /\.(ts|tsx|js|mjs)$/.test(f) && !/\.test\./.test(f) && !/\.spec\./.test(f),
  );
  for (const file of webFiles) {
    for (const n of extractProcessEnv(fs.readFileSync(file, 'utf8'))) names.add(n);
  }
  const envConfig = path.join(ROOT, 'apps/web/src/lib/storage/env-config.ts');
  if (fs.existsSync(envConfig)) {
    for (const n of extractEnvConfigStrings(fs.readFileSync(envConfig, 'utf8'))) names.add(n);
  }
  for (const cfg of ['next.config.ts', 'next.config.js', 'next.config.mjs']) {
    const p = path.join(ROOT, 'apps/web', cfg);
    if (fs.existsSync(p)) {
      for (const n of extractProcessEnv(fs.readFileSync(p, 'utf8'))) names.add(n);
    }
  }
  return names;
}

function collectRustReads() {
  const names = new Set();
  const rustFiles = walk(path.join(ROOT, 'contracts'), (f) => f.endsWith('.rs') && !f.includes('/target/'));
  for (const file of rustFiles) {
    if (file.includes('/tests/')) continue;
    for (const n of extractRustEnv(fs.readFileSync(file, 'utf8'))) names.add(n);
  }
  return names;
}

function diff(a, b) {
  return [...a].filter((x) => !b.has(x)).sort();
}

function main() {
  const web = new Set([...collectWebReads()].filter((n) => !IGNORE.has(n)));
  const rust = new Set([...collectRustReads()].filter((n) => !IGNORE.has(n)));
  const example = parseEnvExample(path.join(ROOT, 'apps/web/.env.example'));
  const docker = parseEnvExample(path.join(ROOT, '.env.docker.example'));
  const docs = extractEnvMd(path.join(ROOT, 'docs/ENV.md'));

  const missingFromExample = diff(web, example).filter((n) => !DOCS_ONLY_OK.has(n));
  const missingFromDocker = diff(
    new Set([...web].filter((n) => example.has(n) && !DOCKER_SKIP.has(n))),
    docker,
  );
  const allProduct = new Set([...web, ...rust]);
  const missingFromDocs = diff(allProduct, docs).filter((n) => !DOCS_ONLY_OK.has(n));
  const deadInExample = diff(example, web).filter(
    (n) => !IGNORE.has(n) && !EXAMPLE_ALLOW_UNREAD.has(n) && !rust.has(n),
  );

  const report = [];
  report.push('=== env audit report ===');
  report.push(`web reads: ${web.size}; rust reads: ${rust.size}`);
  report.push(`.env.example: ${example.size}; .env.docker.example: ${docker.size}; docs/ENV.md: ${docs.size}`);
  report.push('');
  report.push(`missing from apps/web/.env.example (${missingFromExample.length}):`);
  for (const n of missingFromExample) report.push(`  - ${n}`);
  report.push(`missing from .env.docker.example (${missingFromDocker.length}):`);
  for (const n of missingFromDocker) report.push(`  - ${n}`);
  report.push(`missing from docs/ENV.md (${missingFromDocs.length}):`);
  for (const n of missingFromDocs) report.push(`  - ${n}`);
  report.push(`in .env.example but unread (${deadInExample.length}):`);
  for (const n of deadInExample) report.push(`  - ${n}`);

  console.log(report.join('\n'));

  if (missingFromExample.length || missingFromDocs.length || deadInExample.length || missingFromDocker.length) {
    console.error('\nenv audit FAILED — reconcile examples/docs with code readsites');
    process.exit(1);
  }
  console.log('\nenv audit OK');
}

main();
