/**
 * CI entry point for regression summaries and result posting (#1890, #1891).
 *
 * Compiled with plain `tsc` by .github/workflows/regression-suite.yml, so it
 * and everything it imports use relative imports and Node built-ins only. The
 * logic lives in src/lib/integrations/ci-regression/ where it is unit tested.
 *
 *   summarize --report <report.json> --baseline <baseline.json> --out <dir>
 *       Classifies the replay report against the baseline and writes
 *       <dir>/ci-result.json, <dir>/summary.md and <dir>/check-summary.md.
 *       Appends the concise summary to $GITHUB_STEP_SUMMARY and writes
 *       `blocking=<n>` to $GITHUB_OUTPUT.
 *
 *   publish --result <ci-result.json>
 *       Sticky PR comment + check run (GITHUB_TOKEN), then the dashboard
 *       (CRASHLAB_API_URL + CRASHLAB_CI_TOKEN). Failures are warnings unless
 *       CRASHLAB_CI_REPORT_STRICT=true.
 */

import fs from 'node:fs';
import path from 'node:path';
import { summarizeDeltas } from '../src/lib/integrations/ci-regression/classify';
import { publishCiResult, resultFromEnvironment, type CiEnv } from '../src/lib/integrations/ci-regression/ci-publish';
import { buildCheckSummary, buildStickyCommentBody } from '../src/lib/integrations/ci-regression/summary-markdown';
import type {
  CiRegressionResult,
  RegressionBaseline,
  RegressionSuiteReport,
} from '../src/lib/integrations/ci-regression/types';

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if (!flag.startsWith('--') || value === undefined) {
      throw new Error(`Expected "--flag value" pairs, got "${args.slice(i).join(' ')}".`);
    }
    flags[flag.slice(2)] = value;
  }
  return flags;
}

function required(flags: Record<string, string>, name: string): string {
  const value = flags[name];
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function summarize(flags: Record<string, string>, env: CiEnv): void {
  const report = readJson<RegressionSuiteReport>(required(flags, 'report'));
  const baseline = readJson<RegressionBaseline>(required(flags, 'baseline'));
  const outDir = required(flags, 'out');

  const result = resultFromEnvironment(report, baseline, env);
  const deltas = summarizeDeltas(result.fixtures);
  const check = buildCheckSummary(result);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'ci-result.json'), `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'summary.md'), buildStickyCommentBody(result));
  fs.writeFileSync(path.join(outDir, 'check-summary.md'), check.summary);

  if (env.GITHUB_STEP_SUMMARY) fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${check.summary}\n`);
  if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `blocking=${deltas.blocking}\n`);

  console.log(
    `${check.title} (new=${deltas.new} recurring=${deltas.recurring} fixed=${deltas.fixed} unchanged=${deltas.unchanged})`,
  );
}

async function main(argv: string[], env: CiEnv): Promise<number> {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  if (command === 'summarize') {
    summarize(flags, env);
    return 0;
  }
  if (command === 'publish') {
    return publishCiResult(readJson<CiRegressionResult>(required(flags, 'result')), env);
  }
  throw new Error('usage: ci-regression <summarize|publish> [--flag value ...]');
}

main(process.argv.slice(2), process.env).then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
