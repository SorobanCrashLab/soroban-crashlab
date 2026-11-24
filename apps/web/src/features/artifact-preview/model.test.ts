import { describe, expect, it } from 'vitest';
import {
  buildSandboxDocument,
  checksum,
  detectContentType,
  escapeHtml,
  evaluateAccess,
  evaluateDownload,
  redact,
  summarizeForForensics,
  type Artifact,
  type PreviewPolicy,
} from './model';

const artifact = (overrides: Partial<Artifact> = {}): Artifact => ({
  id: 'a1',
  name: 'report.log',
  mimeType: 'text/plain',
  sizeBytes: 32,
  content: 'ok',
  sha256: 'abc',
  scanStatus: 'clean',
  quarantined: false,
  sensitive: false,
  ...overrides,
});

const policy: PreviewPolicy = {
  allowDownload: true,
  allowCopy: true,
  requireCleanScan: true,
  requireCanViewSensitive: true,
};
const permissions = { canViewSensitive: true, canDownload: true };

describe('detectContentType', () => {
  it('routes by mime type, extension and content heuristics', () => {
    expect(detectContentType('x.png', 'image/png', '')).toBe('image');
    expect(detectContentType('x.pdf', '', '')).toBe('pdf');
    expect(detectContentType('data.json', '', '{}')).toBe('json');
    expect(detectContentType('page.html', 'text/html', '')).toBe('html');
    expect(detectContentType('bundle.zip', '', '')).toBe('archive');
    expect(detectContentType('x.wasm', '', '')).toBe('binary');
    expect(detectContentType('app.log', 'text/plain', '2026-01-01 INFO hello')).toBe('log');
    expect(detectContentType('notes.txt', 'text/plain', 'hello')).toBe('text');
  });
});

describe('escapeHtml', () => {
  it('escapes all metacharacters so artifact content is inert', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });
});

describe('buildSandboxDocument', () => {
  it('never emits executable script tags and sets a strict CSP', () => {
    const hostile = artifact({ name: '<img src=x onerror=alert(1)>', content: '</div><script>alert(1)</script>' });
    const doc = buildSandboxDocument(hostile, 'text', hostile.content);
    expect(doc).not.toContain('<script>');
    expect(doc).not.toContain('<img src=x');
    expect(doc).toContain('Content-Security-Policy');
    expect(doc).toContain('&lt;script&gt;');
  });
});

describe('redact', () => {
  it('masks tokens and emails deterministically with counts', () => {
    const result = redact('mail alice@example.com with api_keyABC12345 now');
    expect(result.text).not.toContain('alice@example.com');
    expect(result.text).not.toContain('api_keyABC12345');
    expect(result.findings.map((finding) => finding.ruleId)).toEqual(['api-key', 'email']);
    expect(redact(result.text).text).toBe(result.text);
  });

  it('leaves clean text unchanged', () => {
    const result = redact('nothing sensitive here');
    expect(result.text).toBe('nothing sensitive here');
    expect(result.findings).toEqual([]);
  });

  it('supports custom rules', () => {
    const result = redact('pin 1234', [{
      id: 'pin', pattern: /\d{4}/g, replacement: '[PIN]', label: 'PIN',
    }]);
    expect(result.text).toBe('pin [PIN]');
    expect(result.findings[0]).toMatchObject({ ruleId: 'pin', count: 1 });
  });
});

describe('summarizeForForensics', () => {
  it('reports lines, offsets, encoding and a stable checksum', () => {
    const summary = summarizeForForensics('alpha\nbeta');
    expect(summary.lines).toBe(2);
    expect(summary.offsets).toEqual([
      { line: 1, startByte: 0, endByte: 4 },
      { line: 2, startByte: 6, endByte: 9 },
    ]);
    expect(summary.encoding).toBe('ascii');
    expect(summary.checksum).toBe(checksum('alpha\nbeta'));
    expect(summarizeForForensics('alpha\nbeta').checksum).toBe(summary.checksum);
  });

  it('uses a declared integrity checksum when provided', () => {
    expect(summarizeForForensics('x', 'declared').checksum).toBe('declared');
  });
});

describe('access policy', () => {
  it('allows clean, unquarantined artifacts', () => {
    expect(evaluateAccess(artifact(), policy, permissions).allowed).toBe(true);
  });

  it('blocks quarantine, unscanned and sensitive artifacts', () => {
    expect(evaluateAccess(artifact({ quarantined: true }), policy, permissions).reasons)
      .toContain('Artifact is quarantined');
    expect(evaluateAccess(artifact({ scanStatus: 'unknown' }), policy, permissions).reasons)
      .toContain('Artifact has no clean scan result');
    expect(evaluateAccess(artifact({ sensitive: true }), policy, { ...permissions, canViewSensitive: false }).reasons)
      .toContain('Sensitive artifact requires elevated permission');
  });

  it('gates downloads separately from previews', () => {
    expect(evaluateDownload(artifact(), policy, { ...permissions, canDownload: false }).allowed).toBe(false);
    expect(evaluateDownload(artifact({ scanStatus: 'infected' }), policy, permissions).allowed).toBe(false);
    expect(evaluateDownload(artifact(), { ...policy, allowDownload: false }, permissions).allowed).toBe(false);
  });
});
