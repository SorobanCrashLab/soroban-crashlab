#!/usr/bin/env node
/**
 * KV backup / restore over the Upstash REST protocol (#1900).
 *
 *   node deploy/backup/kv.mjs dump    --out snapshot/kv.ndjson.gz   (source: CRASHLAB_BACKUP_SRC_KV_URL/_TOKEN)
 *   node deploy/backup/kv.mjs restore --in  snapshot/kv.ndjson.gz   (target: CRASHLAB_BACKUP_SCRATCH_KV_URL/_TOKEN)
 *   node deploy/backup/kv.mjs count   [--target src|scratch]
 *
 * Dump walks the keyspace with SCAN and reads each key by type (string, list,
 * set, hash, zset) plus its TTL. It is consistent per key, not a cross-key
 * snapshot — fine for the record driver, whose records are independent.
 * Next to the dump it writes `<out>.manifest.json`: counts by type and by key
 * prefix and the dump's sha256, which restore verification checks against.
 *
 * Restore refuses a non-empty target unless `--flush` is passed, so it cannot
 * be pointed at a live store by accident without saying so.
 *
 * Any server speaking the Upstash REST protocol works: Upstash itself, or
 * serverless-redis-http in front of Redis (used by the local drill).
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import zlib from 'node:zlib';

const TARGETS = {
  src: ['CRASHLAB_BACKUP_SRC_KV_URL', 'CRASHLAB_BACKUP_SRC_KV_TOKEN'],
  scratch: ['CRASHLAB_BACKUP_SCRATCH_KV_URL', 'CRASHLAB_BACKUP_SCRATCH_KV_TOKEN'],
};

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function client(target) {
  const [urlVar, tokenVar] = TARGETS[target] ?? [];
  const url = process.env[urlVar];
  const token = process.env[tokenVar];
  if (!url || !token) throw new Error(`${urlVar} and ${tokenVar} must be set`);

  /** Runs commands as one pipeline round trip; throws on any command error. */
  return async function pipeline(commands) {
    if (commands.length === 0) return [];
    const response = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    });
    if (!response.ok) throw new Error(`KV ${target} responded ${response.status}: ${await response.text()}`);
    const results = await response.json();
    return results.map((entry, i) => {
      if (entry.error) throw new Error(`KV ${commands[i][0]} failed: ${entry.error}`);
      return entry.result;
    });
  };
}

async function* scanKeys(pipeline) {
  let cursor = '0';
  do {
    const [[next, keys]] = await pipeline([['SCAN', cursor, 'COUNT', '500']]);
    cursor = String(next);
    if (keys.length > 0) yield keys;
  } while (cursor !== '0');
}

const READ_BY_TYPE = {
  string: (key) => ['GET', key],
  list: (key) => ['LRANGE', key, '0', '-1'],
  set: (key) => ['SMEMBERS', key],
  hash: (key) => ['HGETALL', key],
  zset: (key) => ['ZRANGE', key, '0', '-1', 'WITHSCORES'],
};

function prefixOf(key) {
  return key.split(':')[0];
}

function emptyCounts() {
  return { keys: 0, byType: {}, byPrefix: {} };
}

function tally(counts, key, type) {
  counts.keys += 1;
  counts.byType[type] = (counts.byType[type] ?? 0) + 1;
  counts.byPrefix[prefixOf(key)] = (counts.byPrefix[prefixOf(key)] ?? 0) + 1;
}

/** Sorted, so two count reports compare with a string equality. */
export function canonicalCounts(counts) {
  const sort = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
  return { keys: counts.keys, byType: sort(counts.byType), byPrefix: sort(counts.byPrefix) };
}

async function count(pipeline) {
  const counts = emptyCounts();
  for await (const keys of scanKeys(pipeline)) {
    const types = await pipeline(keys.map((key) => ['TYPE', key]));
    keys.forEach((key, i) => tally(counts, key, types[i]));
  }
  return canonicalCounts(counts);
}

async function dump(pipeline, out) {
  const records = [];
  const counts = emptyCounts();
  for await (const keys of scanKeys(pipeline)) {
    const types = await pipeline(keys.map((key) => ['TYPE', key]));
    const live = keys.map((key, i) => ({ key, type: types[i] })).filter(({ type }) => READ_BY_TYPE[type]);
    const values = await pipeline(live.flatMap(({ key, type }) => [READ_BY_TYPE[type](key), ['PTTL', key]]));
    live.forEach(({ key, type }, i) => {
      records.push({ key, type, value: values[i * 2], pttl: Number(values[i * 2 + 1]) });
      tally(counts, key, type);
    });
  }
  records.sort((a, b) => a.key.localeCompare(b.key));

  const ndjson = records.map((record) => JSON.stringify(record)).join('\n');
  const gz = zlib.gzipSync(Buffer.from(ndjson, 'utf8'));
  fs.writeFileSync(out, gz, { mode: 0o600 });
  const manifest = {
    createdAt: new Date().toISOString(),
    format: 'crashlab-kv-ndjson-v1',
    sha256: createHash('sha256').update(gz).digest('hex'),
    ...canonicalCounts(counts),
  };
  fs.writeFileSync(`${out}.manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function writeCommands({ key, type, value, pttl }) {
  const commands = [['DEL', key]];
  if (type === 'string') commands.push(['SET', key, value]);
  if (type === 'list' && value.length) commands.push(['RPUSH', key, ...value]);
  if (type === 'set' && value.length) commands.push(['SADD', key, ...value]);
  if (type === 'hash' && value.length) commands.push(['HSET', key, ...value]);
  if (type === 'zset' && value.length) {
    const pairs = [];
    for (let i = 0; i < value.length; i += 2) pairs.push(value[i + 1], value[i]);
    commands.push(['ZADD', key, ...pairs]);
  }
  if (pttl > 0) commands.push(['PEXPIRE', key, String(pttl)]);
  return commands;
}

async function restore(pipeline, input, flush) {
  const manifest = JSON.parse(fs.readFileSync(`${input}.manifest.json`, 'utf8'));
  const gz = fs.readFileSync(input);
  const digest = createHash('sha256').update(gz).digest('hex');
  if (digest !== manifest.sha256) throw new Error(`dump sha256 ${digest} does not match manifest ${manifest.sha256}`);

  const [size] = await pipeline([['DBSIZE']]);
  if (Number(size) > 0) {
    if (!flush) throw new Error(`restore target holds ${size} keys; pass --flush to overwrite it`);
    await pipeline([['FLUSHDB']]);
  }

  const lines = zlib.gunzipSync(gz).toString('utf8').split('\n').filter(Boolean);
  for (let i = 0; i < lines.length; i += 200) {
    await pipeline(lines.slice(i, i + 200).flatMap((line) => writeCommands(JSON.parse(line))));
  }

  const restored = await count(pipeline);
  const expected = canonicalCounts(manifest);
  return { restored, expected, match: JSON.stringify(restored) === JSON.stringify(expected) };
}

async function main() {
  const [command] = process.argv.slice(2);
  if (command === 'dump') {
    const out = arg('out');
    if (!out) throw new Error('dump requires --out');
    console.log(JSON.stringify(await dump(client('src'), out)));
  } else if (command === 'restore') {
    const input = arg('in');
    if (!input) throw new Error('restore requires --in');
    const result = await restore(client(arg('target', 'scratch')), input, process.argv.includes('--flush'));
    console.log(JSON.stringify(result));
    if (!result.match) process.exitCode = 1;
  } else if (command === 'count') {
    console.log(JSON.stringify(await count(client(arg('target', 'src')))));
  } else {
    console.error('usage: kv.mjs dump --out F | restore --in F [--target scratch|src] [--flush] | count [--target src|scratch]');
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(`kv.mjs: ${error.message}`);
  process.exitCode = 1;
});
