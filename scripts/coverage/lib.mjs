/**
 * Coverage ratchet helpers (issue #1822).
 *
 * A coverage number with no baseline is a screenshot; with one it is a gate.
 * These helpers turn two coverage reports — the committed baseline and the run
 * under test — into (a) a repo-total delta, (b) per-file regressions and (c) the
 * coverage of the lines a PR actually changed.
 *
 * Pure functions only, so `node --test scripts/coverage/` covers them without
 * running either coverage tool.
 */

/** Normalise a path to forward slashes and strip a leading `./`. */
export function normalizePath(p) {
  if (p === undefined || p === null) return '';
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '');
}

/** Make `file` relative to `root` when it lives under it; otherwise normalise. */
export function relativize(file, root) {
  const target = normalizePath(file);
  const base = normalizePath(root).replace(/\/$/, '');
  if (!base) return target;
  if (target === base) return '';
  return target.startsWith(base + '/') ? target.slice(base.length + 1) : target;
}

const round = (n) => Math.round(n * 100) / 100;

/**
 * Parse an istanbul `coverage-summary.json` (Vitest's `json-summary`
 * reporter). File keys are absolute; they are made relative to `root`.
 */
export function parseIstanbulSummary(json, root = '') {
  const files = {};
  for (const [file, summary] of Object.entries(json)) {
    if (file === 'total') continue;
    files[relativize(file, root)] = round(summary?.lines?.pct ?? 0);
  }
  return { totalPct: round(json?.total?.lines?.pct ?? 0), files };
}

/**
 * Parse `cargo-llvm-cov --json --summary-only` output (the LLVM coverage JSON
 * export format).
 */
export function parseLlvmCovJson(json, root = '') {
  const data = json?.data?.[0] ?? {};
  const files = {};
  for (const entry of data.files ?? []) {
    files[relativize(entry.filename, root)] = round(entry?.summary?.lines?.percent ?? 0);
  }
  return { totalPct: round(data?.totals?.lines?.percent ?? 0), files };
}

/** Dispatch on the report format. */
export function parseCoverageReport(text, format, root = '') {
  if (format === 'lcov') return parseLcovSummary(typeof text === 'string' ? text : String(text), root);
  const json = typeof text === 'string' ? JSON.parse(text) : text;
  return format === 'llvm-cov-json'
    ? parseLlvmCovJson(json, root)
    : parseIstanbulSummary(json, root);
}

/**
 * Build a committed baseline object from a measured report. Files are sorted so
 * regenerating an unchanged report produces an identical diff.
 */
export function buildBaseline(current, { stack, tool, tolerancePct = 1, changedLinesMinimum = 60, generatedAt } = {}) {
  const files = {};
  for (const file of Object.keys(current.files).sort()) files[file] = current.files[file];
  return {
    version: 1,
    stack: stack ?? 'unknown',
    tool: tool ?? 'unknown',
    generatedAt: generatedAt ?? new Date().toISOString().slice(0, 10),
    tolerancePct,
    changedLinesMinimum,
    total: { lines: current.totalPct },
    files,
  };
}

/**
 * Compare the current report against the baseline.
 *
 * - `totalDelta`: current total minus baseline total (percentage points).
 * - `regressions`: files present in both whose coverage dropped by more than
 *   the tolerance.
 * - `newFiles`: files with no baseline entry (new code — reported only).
 */
export function diffCoverage(baseline, current, tolerance = 0) {
  const baseTotal = baseline?.total?.lines ?? 0;
  const baseFiles = baseline?.files ?? {};
  const totalDelta = round(current.totalPct - baseTotal);

  const regressions = [];
  const newFiles = [];
  for (const [file, pct] of Object.entries(current.files)) {
    if (!(file in baseFiles)) {
      newFiles.push({ file, current: pct });
      continue;
    }
    const previous = baseFiles[file];
    if (previous - pct > tolerance) {
      regressions.push({ file, baseline: previous, current: pct, delta: round(pct - previous) });
    }
  }
  regressions.sort((a, b) => a.file.localeCompare(b.file));
  newFiles.sort((a, b) => a.file.localeCompare(b.file));

  return { totalDelta, regressions, newFiles, baselineTotal: baseTotal, currentTotal: current.totalPct };
}

/**
 * Parse an LCOV report into `{ file: { line: hits } }` with paths relative to
 * `root`.
 */
export function parseLcov(text, root = '') {
  const records = {};
  let file = null;
  for (const line of text.split('\n')) {
    if (line.startsWith('SF:')) {
      file = relativize(line.slice(3).trim(), root);
      records[file] ??= {};
    } else if (line.startsWith('DA:') && file) {
      const [lineNo, hits] = line.slice(3).split(',');
      records[file][Number(lineNo)] = Number(hits);
    } else if (line === 'end_of_record') {
      file = null;
    }
  }
  return records;
}

/**
 * Summarise an LCOV report into a report shape (`{ totalPct, files }`) using
 * the `LF`/`LH` records (falling back to counting `DA` records). LCOV is the
 * one format both Vitest and cargo-llvm-cov can emit, so it is the natural
 * common denominator for the ratchet.
 */
export function parseLcovSummary(text, root = '') {
  const files = {};
  let totalFound = 0;
  let totalHit = 0;
  let file = null;
  let found = null;
  let hit = null;
  let daFound = 0;
  let daHit = 0;

  const flush = () => {
    if (!file) return;
    const lines = found ?? daFound;
    const covered = hit ?? daHit;
    if (lines > 0) {
      files[file] = round((covered / lines) * 100);
      totalFound += lines;
      totalHit += covered;
    }
  };

  for (const line of text.split('\n')) {
    if (line.startsWith('SF:')) {
      flush();
      file = relativize(line.slice(3).trim(), root);
      found = null;
      hit = null;
      daFound = 0;
      daHit = 0;
    } else if (line.startsWith('LF:')) {
      found = Number(line.slice(3));
    } else if (line.startsWith('LH:')) {
      hit = Number(line.slice(3));
    } else if (line.startsWith('DA:') && file) {
      daFound += 1;
      if (Number(line.slice(3).split(',')[1]) > 0) daHit += 1;
    } else if (line === 'end_of_record') {
      flush();
      file = null;
    }
  }
  flush();

  return { totalPct: totalFound === 0 ? 0 : round((totalHit / totalFound) * 100), files };
}

/**
 * Parse a unified diff (`git diff --unified=0`) into `{ path: Set<newLine> }`
 * for the added/context line numbers on the new side.
 */
export function parseUnifiedDiffLines(diffText) {
  const changed = {};
  let file = null;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ ')) {
      const target = line.slice(4).trim();
      file = target === '/dev/null' ? null : normalizePath(target.replace(/^[ab]\//, ''));
      if (file) changed[file] ??= new Set();
    } else if (line.startsWith('@@') && file) {
      const match = /\+(\d+)(?:,(\d+))?/.exec(line);
      if (!match) continue;
      const start = Number(match[1]);
      const count = match[2] === undefined ? 1 : Number(match[2]);
      for (let i = 0; i < count; i += 1) changed[file].add(start + i);
    }
  }
  return changed;
}

/**
 * Coverage of the lines a PR changed. Lines absent from the LCOV report are not
 * instrumented (comments, type-only declarations) and are excluded from the
 * denominator.
 */
export function changedLinesCoverage(lcov, changedLines) {
  let covered = 0;
  let instrumented = 0;
  const uncovered = [];
  for (const [file, lines] of Object.entries(changedLines)) {
    const hits = lcov[file];
    if (!hits) continue;
    for (const line of lines) {
      if (!(line in hits)) continue;
      instrumented += 1;
      if (hits[line] > 0) covered += 1;
      else uncovered.push({ file, line });
    }
  }
  uncovered.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return {
    covered,
    instrumented,
    pct: instrumented === 0 ? 100 : round((covered / instrumented) * 100),
    uncovered,
  };
}

/** Render a deterministic, human-readable ratchet report. */
export function renderReport({ label, diff, tolerance, changed }) {
  const lines = [];
  lines.push(`[${label}] total: ${diff.currentTotal}% (baseline ${diff.baselineTotal}%, delta ${diff.totalDelta >= 0 ? '+' : ''}${diff.totalDelta}pp)`);

  if (diff.regressions.length === 0) {
    lines.push('no per-file regressions');
  } else {
    lines.push(`per-file regressions (>${tolerance}pp drop):`);
    for (const r of diff.regressions) {
      lines.push(`  - ${r.file}: ${r.current}% (baseline ${r.baseline}%, ${r.delta}pp)`);
    }
  }

  if (diff.newFiles.length > 0) {
    lines.push(`new files with no baseline (${diff.newFiles.length}):`);
    for (const n of diff.newFiles) lines.push(`  + ${n.file}: ${n.current}%`);
  }

  if (changed) {
    lines.push(`changed-lines: ${changed.pct}% (${changed.covered}/${changed.instrumented} instrumented lines)`);
    if (changed.uncovered.length > 0) {
      lines.push(`  uncovered changed lines (${changed.uncovered.length}):`);
      for (const u of changed.uncovered) lines.push(`    ! ${u.file}:${u.line}`);
    }
  }

  return lines.join('\n');
}

/**
 * Decide whether the run passes the ratchet. Unchanged from the report-only
 * behaviour: the caller decides what to do with `ok === false`.
 */
export function evaluateRatchet({ diff, changed, tolerance, changedLinesMinimum }) {
  const reasons = [];
  if (diff.totalDelta < -tolerance) {
    reasons.push(`repo total dropped ${diff.totalDelta}pp (tolerance ${tolerance}pp)`);
  }
  if (diff.regressions.length > 0) {
    reasons.push(`${diff.regressions.length} file(s) dropped more than ${tolerance}pp`);
  }
  if (changed && changed.pct + 0.001 < changedLinesMinimum) {
    reasons.push(`changed-lines coverage ${changed.pct}% below ${changedLinesMinimum}%`);
  }
  return { ok: reasons.length === 0, reasons };
}
