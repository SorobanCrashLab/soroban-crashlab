// Classify a CrashLab regression report against a baseline (#1863).
//
// This is a dependency-free port of apps/web's ci-regression classifier so the
// published composite action works in any repository without the monorepo's
// toolchain. It reads a report produced by `crashlab regression-suite --report`
// and a baseline of known failures, writes `::error`/`::warning` annotations,
// appends a Markdown summary to the job summary and sets step outputs.
//
// Node built-ins only; the pure functions are exported so `node --test` can
// pin the delta logic without a GitHub environment.
//
//   node classify.mjs   (reads CRASHLAB_* environment variables)

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REPORTS = {
  supportedSchema: 1,
};

const CLASSIFICATION_RANK = { new: 0, recurring: 1, fixed: 2, unchanged: 3 };

export function fixtureId(row) {
  return `seed-${row.seed_id}-${row.mode}`;
}

export function outcomeOf(row) {
  if (row.passed) return 'pass';
  return row.error !== null && row.error !== undefined ? 'error' : 'fail';
}

// The signature a failing fixture is compared on: its actual class, or `error`.
export function signatureOf(row) {
  return row.actual_failure_class ?? 'error';
}

export function classifyReport(report, baseline) {
  const known = new Map((baseline.knownFailures ?? []).map((k) => [k.fixture, k.signature]));
  const byId = new Map();

  for (const row of report.cases ?? []) {
    const id = fixtureId(row);
    // A suite may list the same seed twice; the first row wins so the result
    // does not depend on how many copies were loaded.
    if (byId.has(id)) continue;

    const outcome = outcomeOf(row);
    const baselineSignature = known.get(id) ?? null;
    let classification;
    if (outcome === 'pass') {
      classification = baselineSignature === null ? 'unchanged' : 'fixed';
    } else {
      classification = baselineSignature === signatureOf(row) ? 'recurring' : 'new';
    }

    byId.set(id, {
      id,
      seedId: row.seed_id,
      mode: row.mode,
      expectedClass: row.expected_failure_class,
      actualClass: row.actual_failure_class,
      outcome,
      classification,
      baselineSignature: baselineSignature !== null && baselineSignature !== signatureOf(row)
        ? baselineSignature
        : null,
      error: row.error ?? null,
    });
  }

  return [...byId.values()].sort(
    (a, b) => CLASSIFICATION_RANK[a.classification] - CLASSIFICATION_RANK[b.classification]
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export function summarizeDeltas(fixtures) {
  const deltas = { new: 0, recurring: 0, fixed: 0, unchanged: 0, total: fixtures.length, blocking: 0 };
  for (const f of fixtures) deltas[f.classification] += 1;
  return deltas;
}

// Number of fixtures the configured policy blocks on.
export function blockingCount(failOn, fixtures, deltas) {
  switch (failOn) {
    case 'new-signatures':
      return deltas.new;
    case 'any':
      return fixtures.filter((f) => f.outcome !== 'pass').length;
    case 'never':
      return 0;
    default:
      throw new Error(`invalid fail-on policy '${failOn}' (expected new-signatures | any | never)`);
  }
}

// Workflow-command escaping for `data` (message) and `property` values.
export function escapeData(text) {
  return String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}
export function escapeProperty(text) {
  return escapeData(text).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function actualCell(fixture) {
  if (fixture.error !== null) return `error: ${fixture.error}`;
  return fixture.actualClass ?? 'none';
}

export function buildSummary(deltas, fixtures) {
  const blocking = fixtures.filter((f) => f.classification === 'new');
  const lines = [
    '### CrashLab regression gate',
    '',
    `new ${deltas.new} · recurring ${deltas.recurring} · fixed ${deltas.fixed} · unchanged ${deltas.unchanged}`,
  ];
  if (blocking.length > 0) {
    lines.push('', '**Blocking (new signatures):**');
    for (const f of blocking) {
      lines.push(`- \`${f.id}\`: expected ${f.expectedClass}, got ${actualCell(f)}`);
    }
  } else {
    lines.push('', ':white_check_mark: No new failure signatures.');
  }
  lines.push('');
  return lines.join('\n');
}

function emitAnnotations(fixtures, failOn) {
  for (const f of fixtures) {
    const title = escapeProperty(`CrashLab ${f.classification}`);
    const file = escapeProperty(f.id);
    if (f.classification === 'new' || (failOn === 'any' && f.outcome !== 'pass')) {
      console.log(`::error file=${file},title=${title}::${escapeData(
        `${f.id}: expected ${f.expectedClass}, got ${actualCell(f)}`,
      )}`);
    } else if (f.classification === 'recurring') {
      console.log(`::warning file=${file},title=${title}::${escapeData(
        `${f.id}: known failure (baseline: ${f.baselineSignature ?? f.actualClass ?? 'error'})`,
      )}`);
    } else if (f.classification === 'fixed') {
      console.log(`::notice file=${file},title=${title}::${escapeData(
        `${f.id}: previously failing, now passing — remove it from the baseline`,
      )}`);
    }
  }
}

function main() {
  const reportPath = process.env.CRASHLAB_REPORT_PATH;
  const baselinePath = process.env.CRASHLAB_BASELINE;
  const failOn = process.env.CRASHLAB_FAIL_ON || 'new-signatures';
  const expectedSchema = Number(process.env.CRASHLAB_EXPECTED_SCHEMA || REPORTS.supportedSchema);

  if (!reportPath) throw new Error('CRASHLAB_REPORT_PATH is not set');
  if (!baselinePath) throw new Error('CRASHLAB_BASELINE is not set');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

  // Version/schema compatibility, checked before anything else runs.
  if (report.schema !== expectedSchema) {
    throw new Error(
      `report schema ${report.schema} is not supported by this action (expected ${expectedSchema}); `
      + 'align the action tag with the CLI schema version',
    );
  }

  const fixtures = classifyReport(report, baseline);
  const deltas = summarizeDeltas(fixtures);
  const blocking = blockingCount(failOn, fixtures, deltas);

  emitAnnotations(fixtures, failOn);

  const summary = buildSummary(deltas, fixtures);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }

  const outputs = {
    total: report.total ?? fixtures.length,
    passed: report.passed ?? fixtures.filter((f) => f.outcome === 'pass').length,
    failed: report.failed ?? fixtures.filter((f) => f.outcome !== 'pass').length,
    'new-signatures': deltas.new,
    blocking,
  };
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      Object.entries(outputs).map(([k, v]) => `${k}=${v}`).join('\n') + '\n',
    );
  }

  console.log(summary);
  if (blocking > 0) {
    console.error(`::error::${blocking} fixture(s) blocked by fail-on '${failOn}'`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
