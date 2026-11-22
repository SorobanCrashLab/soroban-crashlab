/**
 * Default-org backfill CLI (#1894).
 *
 *   pnpm --dir apps/web exec jiti scripts/tenancy-backfill.ts \
 *     --input export.json [--prefixes run:,artifact:,settings:] [--apply --out migrated.json]
 *
 * `--input` is a JSON object of key → value exported from the record store.
 * Without `--apply` this is a dry run: it prints the report and writes nothing.
 * With `--apply` it writes the migrated object to `--out` and the report next
 * to it (`<out>.report.json`), which is the input to a rollback.
 */

import fs from 'node:fs';
import { runBackfill, type BackfillStore } from '../src/lib/tenancy/backfill';

const DEFAULT_PREFIXES = ['run:', 'runs:', 'artifact:', 'artifacts:', 'settings:', 'webhook:', 'campaign:', 'schedule:'];

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const input = arg('input');
if (!input) {
  console.error('usage: tenancy-backfill.ts --input export.json [--prefixes a:,b:] [--apply --out out.json]');
  process.exit(2);
}
const apply = process.argv.includes('--apply');
const out = arg('out');
if (apply && !out) {
  console.error('--apply requires --out');
  process.exit(2);
}

const data = new Map<string, unknown>(Object.entries(JSON.parse(fs.readFileSync(input, 'utf8'))));
const store: BackfillStore = {
  get: (key) => data.get(key),
  set: (key, value) => void data.set(key, value),
  delete: (key) => data.delete(key),
  keys: () => data.keys(),
};

const report = runBackfill(store, {
  tenantOwnedPrefixes: arg('prefixes')?.split(',').filter(Boolean) ?? DEFAULT_PREFIXES,
  dryRun: !apply,
});

console.log(JSON.stringify({ ...report, moves: report.moves.length, movesDetail: report.moves }, null, 2));

if (apply && out) {
  fs.writeFileSync(out, JSON.stringify(Object.fromEntries(data), null, 2));
  fs.writeFileSync(`${out}.report.json`, JSON.stringify(report, null, 2));
}
process.exit(report.conflicts.length > 0 ? 1 : 0);
