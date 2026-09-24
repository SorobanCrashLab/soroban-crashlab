import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import JsonPreview from './JsonPreview';

describe('JsonPreview', () => {
  it('highlights valid JSON without injecting HTML', () => {
    const markup = renderToStaticMarkup(
      <JsonPreview content={'{"name":"<img src=x onerror=alert(1)>","count":42,"enabled":true,"missing":null}'} />
    );

    expect(markup).toContain('color:#2563eb');
    expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(markup).not.toContain('<img');
    expect(markup).not.toContain('onerror="');
  });

  it('renders adversarial text as plain text when JSON is invalid', () => {
    const markup = renderToStaticMarkup(<JsonPreview content={'<script>alert(1)</script>'} />);

    expect(markup).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(markup).not.toContain('<script>');
  });
});