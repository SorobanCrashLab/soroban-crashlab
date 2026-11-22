/**
 * scripts/generate-openapi — regenerate the committed OpenAPI contract (#1831).
 *
 * Compiled with plain `tsc` by the openapi:generate pnpm script and by
 * .github/workflows/openapi-gate.yml, so it and everything it imports use
 * relative imports and Node built-ins only. The classification logic lives in
 * src/lib/openapi/spec-diff.ts where it is unit tested.
 *
 *   (default)          Regenerate src/lib/openapi/openapi.json in place —
 *                      what `pnpm openapi:update` runs to bless a change.
 *   --check            Regenerate in memory and diff against the committed
 *                      file; exit 1 with an inline diff on drift.
 *   --base <file>      Classify the generated spec against a baseline spec
 *                      (typically the base-branch openapi.json). Exit 0 for
 *                      additive-only changes, exit 2 for breaking changes
 *                      (findings printed as GitHub error annotations).
 *   --out <file>       Override the output path (default
 *                      src/lib/openapi/openapi.json).
 *   --summary <file>   Write the markdown contract-change report to a file
 *                      (in addition to stdout).
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildOpenApiSpec, serializeOpenApiSpec } from '../src/lib/openapi/spec';
import { diffOpenApiSpecs, renderSpecDiffMarkdown } from '../src/lib/openapi/spec-diff';

const DEFAULT_OUT = path.join('src', 'lib', 'openapi', 'openapi.json');

function parseFlags(argv: string[]): { check: boolean; base?: string; out: string; summary?: string } {
  const flags = { check: false, out: DEFAULT_OUT } as { check: boolean; base?: string; out: string; summary?: string };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') {
      flags.check = true;
    } else if (arg === '--base' || arg === '--out' || arg === '--summary') {
      const value = argv[i + 1];
      if (!value) throw new Error(`Missing value for ${arg}.`);
      if (arg === '--base') flags.base = value;
      if (arg === '--out') flags.out = value;
      if (arg === '--summary') flags.summary = value;
      i += 1;
    } else {
      throw new Error(`Unknown argument "${arg}".`);
    }
  }
  return flags;
}

/**
 * Unified diff for the drift report. Trims the common prefix/suffix first so
 * a one-field change in a multi-thousand-line spec produces a small, readable
 * hunk instead of an O(n²) LCS table that would blow up CI memory.
 */
function unifiedDiff(before: string, after: string, beforeLabel: string, afterLabel: string, maxLines = 400): string {
  const a = before.split('\n');
  const b = after.split('\n');
  const context = 2;

  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const removed = a.slice(Math.max(0, prefix - context), a.length - suffix);
  const added = b.slice(Math.max(0, prefix - context), b.length - suffix);

  const lines: string[] = [
    `--- ${beforeLabel}`,
    `+++ ${afterLabel}`,
    `@@ -${Math.max(1, prefix + 1 - context)},${removed.length} +${Math.max(1, prefix + 1 - context)},${added.length} @@`,
  ];
  for (const line of removed) {
    if (lines.length >= maxLines) break;
    lines.push(`- ${line}`);
  }
  for (const line of added) {
    if (lines.length >= maxLines) break;
    lines.push(`+ ${line}`);
  }
  if (removed.length + added.length + 3 > maxLines) {
    lines.push(`... (diff truncated at ${maxLines} lines — run 'pnpm openapi:update' and inspect git diff)`);
  }
  return `${lines.join('\n')}\n`;
}

function main(): void {
  const flags = parseFlags(process.argv.slice(2));
  const spec = buildOpenApiSpec();
  const generated = serializeOpenApiSpec(spec);
  const routeCount = Object.keys(spec.paths).length;

  if (flags.base) {
    const baseSpec = JSON.parse(fs.readFileSync(flags.base, 'utf8')) as unknown;
    const nextSpec = JSON.parse(generated) as unknown;
    const diff = diffOpenApiSpecs(baseSpec, nextSpec);
    const report = renderSpecDiffMarkdown(diff);
    process.stdout.write(report);
    if (flags.summary) fs.writeFileSync(flags.summary, report, 'utf8');
    if (diff.hasBreaking) {
      for (const finding of diff.breaking) {
        process.stdout.write(`::error title=Breaking OpenAPI change::${finding.message}\n`);
      }
      process.exitCode = 2;
    } else if (diff.additive.length > 0) {
      process.stdout.write(`::notice title=Additive OpenAPI change::${diff.additive.length} additive change(s); gate passes.\n`);
    }
    return;
  }

  if (flags.check) {
    const committed = fs.existsSync(flags.out) ? fs.readFileSync(flags.out, 'utf8') : '';
    if (committed === generated) {
      process.stdout.write(`openapi.json is up to date (${routeCount} paths).\n`);
      return;
    }
    process.stderr.write(
      'openapi.json has drifted from the route catalog. Run "pnpm --dir apps/web openapi:update" and commit the result.\n',
    );
    process.stderr.write(unifiedDiff(committed, generated, 'committed openapi.json', 'generated openapi.json'));
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(path.dirname(flags.out), { recursive: true });
  fs.writeFileSync(flags.out, generated, 'utf8');
  process.stdout.write(`Wrote ${flags.out} (${routeCount} paths).\n`);
}

main();
