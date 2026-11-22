import { describe, it, expect } from 'vitest';
import { scanTextForLiterals, formatReport } from '../../scripts/lib/extract-messages-core.mjs';

describe('scanTextForLiterals', () => {
  it('flags plain JSX text content', () => {
    const source = '<h1>Notification Center</h1>';
    const findings = scanTextForLiterals(source, 'src/app/example.tsx');
    expect(findings.some((f: { text: string }) => f.text === 'Notification Center')).toBe(true);
  });

  it('flags tracked attribute strings', () => {
    const source = '<button aria-label="Close dialog">×</button>';
    const findings = scanTextForLiterals(source, 'src/app/example.tsx');
    expect(findings.some((f: { text: string; kind: string }) => f.text === 'Close dialog' && f.kind === 'attribute:aria-label')).toBe(
      true,
    );
  });

  it('flags plain-string ternary conditional text', () => {
    const source = "{isSaving ? 'Saving...' : 'Save Preferences'}";
    const findings = scanTextForLiterals(source, 'src/app/example.tsx');
    const texts = findings.map((f: { text: string }) => f.text);
    expect(texts).toContain('Saving...');
    expect(texts).toContain('Save Preferences');
  });

  it('does not flag template literals with interpolation (dynamic, not catalogable as-is)', () => {
    const source = 'const label = `Run ${run.id} details`;';
    const findings = scanTextForLiterals(source, 'src/app/example.tsx');
    expect(findings).toEqual([]);
  });

  it('skips test files and files under the i18n directory', () => {
    expect(scanTextForLiterals('<p>Hello world</p>', 'src/app/example.test.tsx')).toEqual([]);
    expect(scanTextForLiterals('<p>Hello world</p>', 'src/i18n/context.tsx')).toEqual([]);
  });

  it('does not flag class-name-like or path-like single tokens', () => {
    const source = '<div className="flex items-center">rounded-lg</div>';
    const findings = scanTextForLiterals(source, 'src/app/example.tsx');
    expect(findings.some((f: { text: string }) => f.text === 'rounded-lg')).toBe(false);
  });
});

describe('formatReport', () => {
  it('reports "no uncataloged strings" when nothing was found', () => {
    expect(formatReport({})).toMatch(/no uncataloged strings/);
  });

  it('summarizes per-file counts and a total', () => {
    const report = formatReport({
      'src/app/a.tsx': [{ text: 'Hi', line: 1, kind: 'jsx-text' }],
      'src/app/b.tsx': [
        { text: 'Hi', line: 1, kind: 'jsx-text' },
        { text: 'Bye', line: 2, kind: 'jsx-text' },
      ],
    });
    expect(report).toContain('src/app/a.tsx: 1');
    expect(report).toContain('src/app/b.tsx: 2');
    expect(report).toContain('Total: 3 uncataloged string(s) across 2 file(s).');
  });
});
