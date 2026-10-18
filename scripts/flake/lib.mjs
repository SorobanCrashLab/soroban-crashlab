/**
 * Pure logic for the flake-watch infrastructure (issue #1825).
 *
 * Kept dependency-free and side-effect-free so the policy is unit-testable
 * without a browser, a runner or a network: the workflow only wires these
 * functions to artifacts.
 *
 * Terminology
 * -----------
 * An *attempt* is one execution of a test. A test is *flaky* when it both
 * passed and failed across attempts — a pass-after-failure is recorded as
 * flaky, never as green. The *rate* is the share of attempts that disagree
 * with the majority outcome, expressed 0-100 (the same shape as
 * `apps/web/src/app/analytics/flaky/flaky-classification.ts`).
 */

/** Defaults mirrored by `flake-quarantine.json`. */
export const POLICY_DEFAULTS = Object.freeze({
  flakyRateThreshold: 5,
  windowRuns: 20,
  maxQuarantineDays: 14,
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Parses a strict `YYYY-MM-DD` calendar date as UTC midnight, or null. */
export function parseDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Reject roll-overs such as 2026-02-30.
  if (date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

export function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * Computes the flake statistics for one test across its attempts.
 * `outcomes` accepts `'passed' | 'failed' | 'skipped'` in attempt order.
 * Skipped attempts are ignored (a skipped attempt carries no signal).
 */
export function flakeStats(outcomes) {
  const relevant = outcomes.filter((status) => status !== 'skipped');
  const passes = relevant.filter((status) => status === 'passed').length;
  const failures = relevant.filter((status) => status === 'failed').length;
  const runs = relevant.length;
  const flaky = passes > 0 && failures > 0;
  const rate = runs === 0 ? 0 : (Math.min(passes, failures) / runs) * 100;
  return { runs, passes, failures, flaky, rate: round2(rate) };
}

/** True when a rate exceeds the configured threshold (strictly greater). */
export function exceedsThreshold(rate, threshold) {
  return rate > threshold;
}

const SKIPPED_STATUSES = new Set(['skipped', 'pending', 'todo', 'disabled']);

function mapResultStatus(status, specOk) {
  // A fully skipped spec reports ok=true; skipped must win so it carries no signal.
  if (SKIPPED_STATUSES.has(status)) return 'skipped';
  if (specOk === true || status === 'passed') return 'passed';
  return 'failed';
}

/**
 * Flattens one test-run JSON document into per-spec outcomes. Two shapes are
 * understood so the same report can be built from either stack:
 *
 *   - Playwright `results.json` (`suites[].specs[]`);
 *   - Jest/Vitest `--reporter=json` (`testResults[].assertionResults[]`).
 *
 * The id is stable across attempts: `<file>::<title>`.
 */
export function extractSpecOutcomes(resultsJson) {
  if (Array.isArray(resultsJson?.testResults)) return extractJestOutcomes(resultsJson);
  return extractPlaywrightOutcomes(resultsJson);
}

function extractPlaywrightOutcomes(resultsJson) {
  const out = [];
  const walk = (suite, inheritedFile) => {
    const file = suite.file ?? inheritedFile ?? '';
    for (const spec of suite.specs ?? []) {
      const results = (spec.tests ?? []).flatMap((t) => t.results ?? []);
      const last = results[results.length - 1];
      out.push({
        id: `${file}::${spec.title}`,
        file,
        title: spec.title,
        status: mapResultStatus(last?.status, spec.ok),
      });
    }
    for (const child of suite.suites ?? []) walk(child, file);
  };
  for (const suite of resultsJson?.suites ?? []) walk(suite, suite.file);
  return out;
}

function extractJestOutcomes(resultsJson) {
  const out = [];
  for (const file of resultsJson.testResults ?? []) {
    const name = String(file.name ?? '').replace(/\\/g, '/');
    for (const assertion of file.assertionResults ?? []) {
      const title = assertion.fullName ?? assertion.title ?? '';
      out.push({
        id: `${name}::${title}`,
        file: name,
        title,
        status: mapResultStatus(assertion.status, undefined),
      });
    }
  }
  return out;
}

/**
 * Merges per-attempt outcome lists into one record per test. Attempts are
 * positional; a test missing from an attempt is treated as skipped.
 */
export function aggregateAttempts(attemptOutcomeLists) {
  const byId = new Map();
  attemptOutcomeLists.forEach((outcomes, attemptIndex) => {
    for (const outcome of outcomes) {
      if (!byId.has(outcome.id)) {
        byId.set(outcome.id, {
          id: outcome.id,
          file: outcome.file,
          title: outcome.title,
          outcomes: [],
        });
      }
      byId.get(outcome.id).outcomes[attemptIndex] = outcome.status;
    }
  });

  const attemptsCount = attemptOutcomeLists.length;
  return [...byId.values()].map((record) => {
    const outcomes = Array.from({ length: attemptsCount }, (_, i) => record.outcomes[i] ?? 'skipped');
    return {
      id: record.id,
      file: record.file,
      title: record.title,
      outcomes,
      ...flakeStats(outcomes),
    };
  });
}

/** Flaky tests, worst rate first (ties broken by id for stable output). */
export function topFlaky(aggregated, limit = 10) {
  return aggregated
    .filter((test) => test.flaky)
    .sort((a, b) => b.rate - a.rate || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/**
 * Builds a quarantine entry, enforcing the hard `maxQuarantineDays` cap so a
 * quarantine can never be "forever". Throws rather than emitting bad data.
 */
export function buildQuarantineEntry({
  id,
  stack,
  observedRate,
  days = 14,
  reason,
  issue,
  now = new Date(),
  maxQuarantineDays = POLICY_DEFAULTS.maxQuarantineDays,
}) {
  if (typeof id !== 'string' || id.trim() === '') throw new Error('id is required');
  if (typeof stack !== 'string' || stack.trim() === '') throw new Error('stack is required');
  if (typeof issue !== 'string' || issue.trim() === '') throw new Error('issue is required');
  if (!Number.isInteger(days) || days < 1 || days > maxQuarantineDays) {
    throw new Error(`days must be an integer in [1, ${maxQuarantineDays}]`);
  }
  if (typeof observedRate !== 'number' || observedRate < 0 || observedRate > 100) {
    throw new Error('observedRate must be a number in [0, 100]');
  }
  const quarantinedAt = toIsoDate(now);
  const expiresAt = toIsoDate(new Date(now.getTime() + days * DAY_MS));
  return {
    id,
    stack,
    reason: reason ?? `flake rate ${round2(observedRate)}% exceeded the quarantine threshold`,
    quarantinedAt,
    expiresAt,
    observedRate: round2(observedRate),
    issue,
  };
}

/** Proposes quarantine entries for every test above the threshold. */
export function proposeQuarantine(aggregated, threshold, options = {}) {
  const days = options.days ?? POLICY_DEFAULTS.maxQuarantineDays;
  const now = options.now ?? new Date();
  const maxQuarantineDays = options.maxQuarantineDays ?? POLICY_DEFAULTS.maxQuarantineDays;
  const issue = options.issue ?? '#1825';
  return topFlaky(aggregated, Number.MAX_SAFE_INTEGER)
    .filter((test) => exceedsThreshold(test.rate, threshold))
    .map((test) =>
      buildQuarantineEntry({
        id: test.id,
        stack: options.stack ?? 'web',
        observedRate: test.rate,
        days,
        issue,
        now,
        maxQuarantineDays,
      }),
    );
}

/**
 * Validates a quarantine config against the policy. `errors` fail CI;
 * `warnings` are surfaced but tolerated. With `failOnExpired`, an entry past
 * its expiry becomes an error so the nightly run escalates it.
 */
export function validateQuarantine(config, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const failOnExpired = options.failOnExpired === true;
  const errors = [];
  const warnings = [];
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  if (!config || typeof config !== 'object') {
    return { errors: ['config must be a JSON object'], warnings };
  }

  const policy = config.policy ?? {};
  const threshold = policy.flakyRateThreshold;
  const maxDays = policy.maxQuarantineDays;

  if (typeof threshold !== 'number' || !(threshold > 0) || threshold > 100) {
    errors.push('policy.flakyRateThreshold must be a number in (0, 100]');
  }
  if (!Number.isInteger(policy.windowRuns) || policy.windowRuns < 1) {
    errors.push('policy.windowRuns must be an integer >= 1');
  }
  if (!Number.isInteger(maxDays) || maxDays < 1 || maxDays > POLICY_DEFAULTS.maxQuarantineDays) {
    errors.push(
      `policy.maxQuarantineDays must be an integer in [1, ${POLICY_DEFAULTS.maxQuarantineDays}]`,
    );
  }
  if (!Array.isArray(config.quarantined)) {
    errors.push('quarantined must be an array');
    return { errors, warnings };
  }

  const seen = new Set();
  config.quarantined.forEach((entry, index) => {
    const at = `quarantined[${index}]`;
    if (!entry || typeof entry !== 'object') {
      errors.push(`${at} must be an object`);
      return;
    }
    for (const field of ['id', 'stack', 'reason', 'issue', 'quarantinedAt', 'expiresAt']) {
      if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
        errors.push(`${at}.${field} is required`);
      }
    }
    if (typeof entry.id === 'string') {
      if (seen.has(entry.id)) errors.push(`${at}.id duplicates "${entry.id}"`);
      seen.add(entry.id);
    }

    const from = parseDate(entry.quarantinedAt);
    const to = parseDate(entry.expiresAt);
    if (entry.quarantinedAt && !from) errors.push(`${at}.quarantinedAt must be a valid YYYY-MM-DD date`);
    if (entry.expiresAt && !to) errors.push(`${at}.expiresAt must be a valid YYYY-MM-DD date`);

    if (from && to) {
      const window = daysBetween(from, to);
      if (window <= 0) {
        errors.push(`${at}.expiresAt must be after quarantinedAt`);
      } else if (Number.isInteger(maxDays) && window > maxDays) {
        errors.push(`${at}: quarantine window ${window}d exceeds maxQuarantineDays (${maxDays})`);
      }
      if (to.getTime() < startOfToday) {
        const message = `${at} (${entry.id}) expired on ${entry.expiresAt}`;
        if (failOnExpired) errors.push(`${message}: fix the root cause or renew with a fresh reason`);
        else warnings.push(message);
      }
    }

    if (typeof entry.observedRate !== 'number' || entry.observedRate < 0 || entry.observedRate > 100) {
      errors.push(`${at}.observedRate must be a number in [0, 100]`);
    } else if (typeof threshold === 'number' && entry.observedRate <= threshold) {
      warnings.push(
        `${at} (${entry.id}) observedRate ${entry.observedRate}% is at or below the threshold ${threshold}%: release it`,
      );
    }
  });

  return { errors, warnings };
}

/** Builds the machine-readable flake report consumed by the dashboard/artifact. */
export function buildReport({ aggregated, threshold, windowRuns, attemptsCount, quarantined = [] }) {
  const flaky = topFlaky(aggregated, Number.MAX_SAFE_INTEGER);
  return {
    generatedAt: new Date().toISOString(),
    attempts: attemptsCount,
    threshold,
    windowRuns,
    totals: {
      tests: aggregated.length,
      flaky: flaky.length,
      quarantined: quarantined.length,
    },
    topFlaky: flaky.slice(0, 10),
    flaky,
    quarantined,
  };
}

/** Renders the report as the Markdown posted to the job summary / PR. */
export function renderMarkdown(report) {
  const lines = [];
  lines.push(`### Flake watch`);
  lines.push('');
  lines.push(
    `Ran ${report.attempts} attempt(s) over ${report.totals.tests} test(s); ` +
      `**${report.totals.flaky}** flaky above a ${report.threshold}% threshold ` +
      `(window ${report.windowRuns} runs).`,
  );
  lines.push('');
  if (report.topFlaky.length === 0) {
    lines.push('No flaky tests detected in this window. ✅');
  } else {
    lines.push('| Test | Flaky rate | Passes | Failures |');
    lines.push('| --- | ---: | ---: | ---: |');
    for (const test of report.topFlaky) {
      lines.push(
        `| \`${test.id}\` | ${test.rate}% | ${test.passes} | ${test.failures} |`,
      );
    }
  }
  lines.push('');
  if (report.quarantined.length > 0) {
    lines.push('Proposed quarantine entries (expiry capped at the policy maximum):');
    lines.push('');
    for (const entry of report.quarantined) {
      lines.push(`- \`${entry.id}\` — ${entry.observedRate}%, expires ${entry.expiresAt}`);
    }
    lines.push('');
  }
  lines.push('See `docs/testing/flake-policy.md` for how to fix a quarantined test.');
  return `${lines.join('\n')}\n`;
}
