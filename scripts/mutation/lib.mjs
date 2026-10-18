/**
 * Pure helpers for the mutation-testing gate (issue #1821).
 *
 * A mutation report lists every mutant the fuzzer produced and whether the test
 * suite killed it. Survivors are mutants the suite failed to kill: each one is
 * a line of behaviour that no test pins down. Line coverage cannot see them,
 * which is why the gate compares survivors against a committed baseline instead
 * of trusting a coverage percentage.
 *
 * The parsing and diffing logic lives here, separate from the CLI, so it can be
 * covered by `node --test scripts/mutation/` without touching the filesystem.
 */

/** Normalise a reported path to forward slashes without a leading `./`. */
export function normalizePath(p) {
  if (p === undefined || p === null) return '';
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * True when `file` equals one of the critical patterns or lives under one.
 * Patterns are paths such as `contracts/crashlab-core/src/taxonomy.rs`, so a
 * report that reports only a basename still matches the tail.
 */
export function isCritical(file, patterns) {
  const target = normalizePath(file);
  if (!target) return false;
  return patterns.some((raw) => {
    const pattern = normalizePath(raw);
    // Reports may be repo-relative (baseline patterns) or package-relative
    // (cargo-mutants writes `src/taxonomy.rs`). Match either as a path tail.
    return target === pattern || target.endsWith('/' + pattern) || pattern.endsWith('/' + target);
  });
}

const survivorKey = (survivor) => `${normalizePath(survivor.file)}::${survivor.mutant}`;

/** Deterministic ordering so re-runs never churn the report. */
export function sortSurvivors(survivors) {
  return [...survivors].sort((a, b) => survivorKey(a).localeCompare(survivorKey(b)));
}

/**
 * Extract surviving mutants from a `cargo-mutants --json` report.
 *
 * cargo-mutants wraps each result in a `scenario` enum (`Mutant` or
 * `Baseline`) and summarises it with `Caught`, `Missed`, `Timeout`, `Unviable`
 * or `Success`. Only `Missed` (a mutant the tests let through) counts as a
 * survivor.
 */
export function parseCargoMutants(json) {
  const outcomes = Array.isArray(json)
    ? json
    : Array.isArray(json?.outcomes)
      ? json.outcomes
      : [];

  const survivors = [];
  for (const outcome of outcomes) {
    const summary = String(outcome?.summary ?? '').toLowerCase();
    if (summary !== 'missed' && summary !== 'survived') continue;
    const scenario = outcome?.scenario?.Mutant ?? outcome?.scenario ?? {};
    survivors.push({
      file: normalizePath(scenario.file ?? outcome?.file),
      mutant: String(scenario.name ?? outcome?.name ?? 'unknown'),
    });
  }
  return sortSurvivors(survivors);
}

/**
 * Extract surviving mutants from a StrykerJS JSON report. `Survived` and
 * `NoCoverage` mutants are both unkilled behaviour; both count.
 */
export function parseStryker(json) {
  const survivors = [];
  const files = json?.files ?? {};
  for (const [file, report] of Object.entries(files)) {
    for (const mutant of report?.mutants ?? []) {
      const status = String(mutant?.status ?? '').toLowerCase();
      if (status !== 'survived' && status !== 'nocoverage' && status !== 'no coverage') continue;
      survivors.push({
        file: normalizePath(file),
        mutant: String(mutant?.mutatorName ?? mutant?.id ?? 'unknown'),
      });
    }
  }
  return sortSurvivors(survivors);
}

/** Parse a report file's contents for the requested tool. */
export function parseReport(text, format = 'cargo-mutants') {
  const json = typeof text === 'string' ? JSON.parse(text) : text;
  return format === 'stryker' ? parseStryker(json) : parseCargoMutants(json);
}

/**
 * Compare the survivors a run produced against the committed baseline.
 *
 * - `added`: new survivors (a regression — no test covers this behaviour yet).
 * - `removed`: baseline survivors this run killed (prune them from the baseline).
 * - `unchanged`: survivors already justified in the baseline.
 */
export function diffSurvivors(baseline, current) {
  const base = new Set(baseline.map(survivorKey));
  const currentKeys = new Set(current.map(survivorKey));
  return {
    added: current.filter((s) => !base.has(survivorKey(s))),
    removed: baseline.filter((s) => !currentKeys.has(survivorKey(s))),
    unchanged: current.filter((s) => base.has(survivorKey(s))),
  };
}

/** New survivors in critical modules — the ones that actually fail the gate. */
export function criticalNewSurvivors(added, criticalPatterns) {
  return added.filter((s) => isCritical(s.file, criticalPatterns));
}

/** Render a deterministic, human-readable diff for the CI log. */
export function renderReport({ added, removed, unchanged, criticalPatterns = [] }) {
  const lines = [];
  lines.push(
    `survivors: ${added.length + unchanged.length} (baseline ${unchanged.length}, new ${added.length})`,
  );

  if (unchanged.length > 0) {
    lines.push(`unchanged baseline survivors (${unchanged.length}):`);
    for (const s of unchanged) lines.push(`  = ${survivorKey(s)}`);
  }

  if (added.length === 0) {
    lines.push('no new survivors');
  } else {
    lines.push(`NEW survivors (${added.length}):`);
    for (const s of added) {
      const flag = isCritical(s.file, criticalPatterns) ? ' [critical]' : '';
      lines.push(`  + ${survivorKey(s)}${flag}`);
    }
  }

  if (removed.length > 0) {
    lines.push(`killed since baseline — prune from baseline (${removed.length}):`);
    for (const s of removed) lines.push(`  - ${survivorKey(s)}`);
  }

  return lines.join('\n');
}
