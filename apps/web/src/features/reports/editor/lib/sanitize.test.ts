import { describe, expect, it } from 'vitest';
import {
  escapeReportText,
  isSafeReportUrl,
  reportPlainText,
  safeReportUrl,
  sanitizeReportHtml,
  sanitizeReportMarkdown,
} from './sanitize';

describe('report sanitization wrappers', () => {
  it('removes dangerous Markdown links while keeping the label', () => {
    expect(sanitizeReportMarkdown('[click](javascript:alert(1))')).toBe('click');
    expect(sanitizeReportMarkdown('[ok](/runs/1)')).toBe('[ok](/runs/1)');
  });

  it('normalizes newlines', () => {
    expect(sanitizeReportMarkdown('a\r\nb')).toBe('a\nb');
  });

  it('blocks unsafe protocols in URLs', () => {
    expect(safeReportUrl('javascript:alert(1)')).toBe('#');
    expect(safeReportUrl('data:text/html;base64,AAA')).toBe('#');
    expect(isSafeReportUrl('/runs/run-001')).toBe(true);
    expect(isSafeReportUrl('vbscript:msgbox(1)')).toBe(false);
  });

  it('escapes text and strips generated HTML hazards', () => {
    expect(escapeReportText('<img src=x onerror="alert(1)">')).toContain('&lt;img');
    const dirty = '<p onclick="steal()">Hello<script>alert(1)</script></p>';
    const clean = sanitizeReportHtml(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onclick');
  });

  it('flattens untrusted values for card labels', () => {
    expect(reportPlainText('  `run`-1\n[link]  ')).toBe('run-1link');
  });
});
