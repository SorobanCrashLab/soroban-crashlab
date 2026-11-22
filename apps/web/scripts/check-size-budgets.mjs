#!/usr/bin/env node
/**
 * Dependency-free size budget runner for `.size-limit.json`.
 *
 * The repo used to call the `size-limit` CLI here, but the installed
 * `@size-limit/file` plugin version does not match the CLI, so the step could
 * not load a plugin and the workflow failed before checking anything. This
 * runner implements the `path`/`gzip`/`limit` subset the config uses, keeps the
 * same budget file, and works on the Node version CI actually pins.
 *
 * Rats are intentional: budgets only tighten when `--ratchet` is passed and the
 * measured size is below the committed limit (see docs/bundle-budgets.md).
 */

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const cwd = process.cwd();
const webDir = fs.existsSync(path.join(cwd, 'apps', 'web'))
  ? path.join(cwd, 'apps', 'web')
  : cwd;
const nextDir = path.join(webDir, '.next');
const configPath = path.join(webDir, '.size-limit.json');

const ratchet = process.argv.includes('--ratchet');

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'kB', 'MB', 'GB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 2)} ${units[exponent]}`;
}

function parseLimit(value) {
  const match = String(value).trim().match(/^([\d.]+)\s*([a-zA-Z]+)?$/);
  if (!match) return Number.POSITIVE_INFINITY;
  const amount = Number.parseFloat(match[1]);
  const unit = (match[2] || 'B').toLowerCase();
  if (unit === 'kb' || unit === 'k') return Math.round(amount * 1024);
  if (unit === 'mb' || unit === 'm') return Math.round(amount * 1024 ** 2);
  if (unit === 'gb' || unit === 'g') return Math.round(amount * 1024 ** 3);
  return Math.round(amount);
}

function globToRegExp(pattern) {
  const clean = pattern
    .replace(/^\.?\/?\.next\//, '')
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${clean}$`);
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

if (!fs.existsSync(nextDir)) {
  console.error('No .next build found. Run `pnpm --dir apps/web run build` first.');
  process.exit(2);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error(`Cannot read ${path.relative(webDir, configPath)}: ${error.message}`);
  process.exit(2);
}

const staticFiles = walk(path.join(nextDir, 'static'));
const sizeCache = new Map();
function sizeOf(file) {
  if (!sizeCache.has(file)) {
    const buffer = fs.readFileSync(file);
    sizeCache.set(file, { raw: buffer.length, gzip: zlib.gzipSync(buffer).length });
  }
  return sizeCache.get(file);
}

let failed = 0;
const rows = [];
for (const entry of config) {
  const patterns = (Array.isArray(entry.path) ? entry.path : [entry.path]).filter(Boolean);
  const regexps = patterns.map(globToRegExp);
  const matched = staticFiles.filter((file) => {
    const relative = path.relative(nextDir, file).replace(/\\/g, '/');
    return regexps.some((regex) => regex.test(relative));
  });
  const gzip = entry.gzip !== false;
  const measured = matched.reduce((total, file) => total + sizeOf(file)[gzip ? 'gzip' : 'raw'], 0);
  const limit = parseLimit(entry.limit);
  const passed = measured <= limit;
  if (!passed) failed += 1;
  rows.push({ name: entry.name, measured, limit, limitLabel: entry.limit, passed, files: matched.length });
}

console.log('Size budgets (.size-limit.json)');
console.log('| Group | Measured | Limit | Status |');
console.log('| :--- | ---: | ---: | :---: |');
for (const row of rows) {
  console.log(
    `| ${row.name} | ${formatBytes(row.measured)} | ${row.limitLabel} | ${row.passed ? 'PASS' : 'FAIL'} |`,
  );
}

const reportDir = path.join(nextDir, 'analyze');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(
  path.join(reportDir, 'size-budgets.json'),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), ratchet, rows }, null, 2)}\n`,
);

if (failed > 0) {
  console.error(`\n${failed} size budget(s) exceeded.`);
  process.exit(1);
}

if (ratchet) {
  console.log('\nBudgets pass. Lower committed limits only in a reviewed budget PR; this runner does not rewrite the config.');
}
