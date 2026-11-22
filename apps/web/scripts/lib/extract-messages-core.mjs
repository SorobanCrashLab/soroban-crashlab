/**
 * Heuristic scanner for hardcoded English string literals in JSX source,
 * shared by the CLI (`scripts/extract-messages.mjs`) and its test
 * (`src/i18n/extractor.test.ts`). Phase-1 / CI-warning mode: tuned for
 * precision over recall — misses can be iterated on, false positives kill
 * the habit of running it.
 */

const TRACKED_ATTRIBUTES = ['aria-label', 'placeholder', 'title'];

/** True for strings that look like human-readable prose worth cataloging. */
function looksLikeProse(value) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;
  if (!/[A-Za-z]/.test(trimmed)) return false;
  // Skip CSS class lists, URLs, identifiers — single tokens without a space
  // that read like class names or paths. The separator/lowercase condition
  // keeps sentence-cased words with trailing punctuation ("Saving...") on the
  // prose side: those are user-visible copy, not identifiers.
  const looksLikeIdentifier =
    /^[a-z0-9-_./:#]+$/i.test(trimmed) &&
    !trimmed.includes(' ') &&
    (/[-_/:#]/.test(trimmed) || trimmed === trimmed.toLowerCase());
  if (looksLikeIdentifier) return false;
  return true;
}

/**
 * Scans a single file's source text for literals that likely need cataloging.
 * Returns `{ text, line, kind }` entries. Intentionally skips:
 *  - template literals containing `${...}` interpolation (dynamic, can't catalog as-is)
 *  - literals already wrapped in a `t(...)` call
 */
export function scanTextForLiterals(source, filePath) {
  if (/\.test\.[tj]sx?$/.test(filePath) || filePath.includes(`${'/'}i18n${'/'}`)) {
    return [];
  }

  const findings = [];
  const lines = source.split('\n');

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    // JSX text content between tags, e.g. `>Notification Center<`
    for (const match of line.matchAll(/>([^<>{}\n]{2,})</g)) {
      const text = match[1].trim();
      if (looksLikeProse(text)) {
        findings.push({ text, line: lineNumber, kind: 'jsx-text' });
      }
    }

    // Tracked attribute string literals, e.g. aria-label="Close dialog"
    for (const attr of TRACKED_ATTRIBUTES) {
      const attrPattern = new RegExp(`${attr}=["']([^"']+)["']`, 'g');
      for (const match of line.matchAll(attrPattern)) {
        if (looksLikeProse(match[1])) {
          findings.push({ text: match[1], line: lineNumber, kind: `attribute:${attr}` });
        }
      }
    }

    // Conditional (ternary) text made of two plain string literals, e.g.
    // `cond ? 'Saved' : 'Failed'` — both branches are candidates.
    for (const match of line.matchAll(/\?\s*['"]([^'"]+)['"]\s*:\s*['"]([^'"]+)['"]/g)) {
      if (looksLikeProse(match[1])) findings.push({ text: match[1], line: lineNumber, kind: 'ternary' });
      if (looksLikeProse(match[2])) findings.push({ text: match[2], line: lineNumber, kind: 'ternary' });
    }
  });

  return findings;
}

/** Renders a per-file uncataloged-string count summary for CI/console output. */
export function formatReport(resultsByFile) {
  const files = Object.keys(resultsByFile).filter((file) => resultsByFile[file].length > 0);
  if (files.length === 0) {
    return 'i18n extraction: no uncataloged strings found.';
  }

  const lines = ['i18n extraction (phase 1, non-blocking): uncataloged strings found', ''];
  let total = 0;
  for (const file of files.sort()) {
    const count = resultsByFile[file].length;
    total += count;
    lines.push(`  ${file}: ${count}`);
  }
  lines.push('', `Total: ${total} uncataloged string(s) across ${files.length} file(s).`);
  return lines.join('\n');
}
