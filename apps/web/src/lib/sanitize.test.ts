import { describe, expect, it } from 'vitest';

import {
  escapeHtml,
  sanitizeHtml,
  sanitizeMarkdown,
  sanitizeSearchParams,
  sanitizeUrl,
  sanitizeUserContent,
} from './sanitize';

describe('sanitizeUrl', () => {
  it.each([
    'https://example.com/docs',
    'http://example.com',
    '/runs/123',
    '#results',
    'mailto:security@example.com',
  ])('preserves safe URL %j', (url) => {
    expect(sanitizeUrl(url)).toBe(url);
  });

  it.each([
    'javascript:alert',
    'data:text/html,unsafe',
    'vbscript:msgbox',
    'JaVaScRiPt:alert',
    'DATA:text/html,unsafe',
    'VbScRiPt:msgbox',
  ])('blocks dangerous URL %j', (url) => {
    expect(sanitizeUrl(url)).toBe('#');
  });

  it.each([
    '  javascript:alert',
    '\tdata:text/html,unsafe',
    '\nvbscript:msgbox',
  ])('blocks dangerous URLs with leading whitespace %j', (url) => {
    expect(sanitizeUrl(url)).toBe('#');
  });

  it('does not block a dangerous protocol name outside the URL prefix', () => {
    const url = 'https://example.com/?next=javascript:alert';
    expect(sanitizeUrl(url)).toBe(url);
  });

  it.each(['', '   '])('preserves benign empty input %j', (url) => {
    expect(sanitizeUrl(url)).toBe(url);
  });
});

describe('sanitizeMarkdown', () => {
  it('preserves safe Markdown links', () => {
    const markdown =
      'Read the [documentation](https://example.com/docs) or [view a run](/runs/123).';
    expect(sanitizeMarkdown(markdown)).toBe(markdown);
  });

  it.each([
    ['javascript', '[click](javascript:alert)', 'click'],
    ['data', '[preview](data:text/html,unsafe)', 'preview'],
    ['vbscript', '[open](vbscript:msgbox)', 'open'],
    ['mixed-case JavaScript', '[click](JaVaScRiPt:alert)', 'click'],
  ])('removes a dangerous %s link while preserving its label', (_, markdown, expected) => {
    expect(sanitizeMarkdown(markdown)).toBe(expected);
  });

  it('removes every dangerous link in the same Markdown string', () => {
    const markdown =
      '[first](javascript:alert) and [second](DATA:text/html,unsafe)';
    expect(sanitizeMarkdown(markdown)).toBe('first and second');
  });

  it('preserves safe Markdown surrounding a dangerous link', () => {
    const markdown =
      '**Warning:** do not [click here](javascript:alert). Continue reading.';
    expect(sanitizeMarkdown(markdown)).toBe(
      '**Warning:** do not click here. Continue reading.',
    );
  });

  it('does not alter plain text containing dangerous protocol names', () => {
    const markdown = 'The string javascript:alert is not a Markdown link.';
    expect(sanitizeMarkdown(markdown)).toBe(markdown);
  });

  it('handles empty Markdown', () => {
    expect(sanitizeMarkdown('')).toBe('');
  });
});

describe('sanitizeSearchParams', () => {
  it('copies safe search parameters unchanged', () => {
    const input = new URLSearchParams({
      network: 'testnet',
      run: 'run-123',
      redirect: 'https://example.com/results',
    });
    const result = sanitizeSearchParams(input);
    expect(result.get('network')).toBe('testnet');
    expect(result.get('run')).toBe('run-123');
    expect(result.get('redirect')).toBe('https://example.com/results');
  });

  it('sanitizes dangerous parameter values', () => {
    const input = new URLSearchParams();
    input.append('javascript', 'javascript:alert');
    input.append('data', 'data:text/html,unsafe');
    input.append('vbscript', 'vbscript:msgbox');
    const result = sanitizeSearchParams(input);
    expect(result.get('javascript')).toBe('#');
    expect(result.get('data')).toBe('#');
    expect(result.get('vbscript')).toBe('#');
  });

  it('preserves duplicate keys and their insertion order', () => {
    const input = new URLSearchParams();
    input.append('tag', 'first');
    input.append('tag', 'javascript:alert');
    input.append('tag', 'third');
    const result = sanitizeSearchParams(input);
    expect(result.getAll('tag')).toEqual(['first', '#', 'third']);
  });

  it('does not mutate the original search parameters', () => {
    const input = new URLSearchParams();
    input.append('redirect', 'javascript:alert');
    input.append('network', 'testnet');
    const original = input.toString();
    const result = sanitizeSearchParams(input);
    expect(input.toString()).toBe(original);
    expect(input.get('redirect')).toBe('javascript:alert');
    expect(result).not.toBe(input);
  });

  it('returns an empty result for empty search parameters', () => {
    const result = sanitizeSearchParams(new URLSearchParams());
    expect(result.toString()).toBe('');
  });
});

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  it('escapes less-than signs', () => {
    expect(escapeHtml('a < b')).toBe('a &lt; b');
  });

  it('escapes greater-than signs', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"test"')).toBe('&quot;test&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#x27;s');
  });

  it('escapes forward slashes', () => {
    expect(escapeHtml('path/to/file')).toBe('path&#x2F;to&#x2F;file');
  });

  it('escapes backticks', () => {
    expect(escapeHtml('`code`')).toBe('&#x60;code&#x60;');
  });

  it('escapes equals sign', () => {
    expect(escapeHtml('key=value')).toBe('key=value');
  });

  it('escapes all dangerous characters in a script tag', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
    );
  });

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });
});

describe('sanitizeHtml', () => {
  it('removes script tags and their contents', () => {
    const html = '<p>Safe</p><script>alert("xss")</script><p>Also safe</p>';
    expect(sanitizeHtml(html)).toBe('<p>Safe</p><p>Also safe</p>');
  });

  it('removes onclick event handlers', () => {
    const html = '<button onclick="alert(\'xss\')">Click</button>';
    expect(sanitizeHtml(html)).toBe('<button>Click</button>');
  });

  it('removes onerror event handlers', () => {
    const html = '<img src="x" onerror="alert(\'xss\')">';
    expect(sanitizeHtml(html)).not.toContain('onerror');
  });

  it('removes javascript: URLs from href attributes', () => {
    const html = '<a href="javascript:alert(\'xss\')">Click</a>';
    expect(sanitizeHtml(html)).not.toContain('javascript:');
  });

  it('removes iframe tags', () => {
    const html = '<p>Safe</p><iframe src="https://evil.com"></iframe>';
    expect(sanitizeHtml(html)).toBe('<p>Safe</p>');
  });

  it('removes object tags', () => {
    const html = '<object data="evil.swf"></object>';
    expect(sanitizeHtml(html)).toBe('');
  });

  it('removes embed tags', () => {
    const html = '<embed src="evil.swf">';
    expect(sanitizeHtml(html)).toBe('');
  });

  it('removes form tags', () => {
    const html = '<form action="https://evil.com"><input></form>';
    expect(sanitizeHtml(html)).toBe('');
  });

  it('preserves safe HTML elements', () => {
    const html = '<p>Hello <strong>world</strong></p>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('preserves safe links', () => {
    const html = '<a href="https://example.com">Link</a>';
    expect(sanitizeHtml(html)).toBe(html);
  });
});

describe('sanitizeUserContent', () => {
  it('escapes HTML in user-generated content', () => {
    const content = '<script>alert("xss")</script>';
    expect(sanitizeUserContent(content)).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;'
    );
  });

  it('handles plain text without special characters', () => {
    const content = 'Hello, this is safe text!';
    expect(sanitizeUserContent(content)).toBe(content);
  });

  it('handles empty input', () => {
    expect(sanitizeUserContent('')).toBe('');
  });
});
