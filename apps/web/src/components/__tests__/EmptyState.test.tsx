import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { EmptyStateIllustration } from '../EmptyStateIllustration';
import { EmptyState } from '../EmptyState';
import { ListState } from '../ListState';

describe('EmptyStateIllustration', () => {
  it('renders runs illustration variant with accessibility role and SVG structure', () => {
    const html = renderToStaticMarkup(<EmptyStateIllustration variant="runs" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="runs empty state illustration"');
    expect(html).toContain('<svg');
    expect(html).toContain('runs-glow');
  });

  it('renders logs illustration variant with accessibility role and SVG structure', () => {
    const html = renderToStaticMarkup(<EmptyStateIllustration variant="logs" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="logs empty state illustration"');
    expect(html).toContain('<svg');
    expect(html).toContain('logs-glow');
  });

  it('renders artifacts illustration variant with accessibility role and SVG structure', () => {
    const html = renderToStaticMarkup(<EmptyStateIllustration variant="artifacts" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="artifacts empty state illustration"');
    expect(html).toContain('<svg');
    expect(html).toContain('art-glow');
  });

  it('renders generic illustration fallback when variant is omitted', () => {
    const html = renderToStaticMarkup(<EmptyStateIllustration />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="generic empty state illustration"');
    expect(html).toContain('<svg');
    expect(html).toContain('generic-glow');
  });

  it('supports custom size props (sm, md, lg)', () => {
    const smHtml = renderToStaticMarkup(<EmptyStateIllustration variant="runs" size="sm" />);
    expect(smHtml).toContain('width="120"');
    expect(smHtml).toContain('height="96"');

    const mdHtml = renderToStaticMarkup(<EmptyStateIllustration variant="runs" size="md" />);
    expect(mdHtml).toContain('width="180"');
    expect(mdHtml).toContain('height="144"');

    const lgHtml = renderToStaticMarkup(<EmptyStateIllustration variant="runs" size="lg" />);
    expect(lgHtml).toContain('width="240"');
    expect(lgHtml).toContain('height="192"');
  });

  it('supports custom aria-label', () => {
    const html = renderToStaticMarkup(
      <EmptyStateIllustration variant="artifacts" aria-label="Custom artifact empty visual" />
    );
    expect(html).toContain('aria-label="Custom artifact empty visual"');
  });
});

describe('EmptyState component', () => {
  it('renders with title, description, and action CTA', () => {
    const html = renderToStaticMarkup(
      <EmptyState
        type="runs"
        title="Custom Run Title"
        description="Detailed guidance for the user."
        action={<button type="button">Trigger Run</button>}
      />
    );

    expect(html).toContain('Custom Run Title');
    expect(html).toContain('Detailed guidance for the user.');
    expect(html).toContain('Trigger Run');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Custom Run Title"');
    expect(html).toContain('runs empty state illustration');
  });

  it('falls back to default titles per variant when title is not provided', () => {
    const runsHtml = renderToStaticMarkup(<EmptyState type="runs" />);
    expect(runsHtml).toContain('No fuzzing runs found');

    const logsHtml = renderToStaticMarkup(<EmptyState type="logs" />);
    expect(logsHtml).toContain('No log entries found');

    const artifactsHtml = renderToStaticMarkup(<EmptyState type="artifacts" />);
    expect(artifactsHtml).toContain('No artifacts available');

    const genericHtml = renderToStaticMarkup(<EmptyState type="generic" />);
    expect(genericHtml).toContain('No items found');
  });

  it('supports message alias for title', () => {
    const html = renderToStaticMarkup(<EmptyState message="Message as title" />);
    expect(html).toContain('Message as title');
  });

  it('supports compact display mode', () => {
    const html = renderToStaticMarkup(<EmptyState type="artifacts" compact />);
    expect(html).toContain('py-8 px-4');
    expect(html).toContain('width="120"');
  });
});

describe('ListState empty state integration', () => {
  it('renders EmptyState within ListState when state is empty', () => {
    const html = renderToStaticMarkup(
      <ListState
        state="empty"
        type="runs"
        message="No runs matching query"
        description="Reset your filters to view all runs"
        action={<button type="button">Clear</button>}
      />
    );

    expect(html).toContain('No runs matching query');
    expect(html).toContain('Reset your filters to view all runs');
    expect(html).toContain('Clear');
    expect(html).toContain('runs empty state illustration');
  });

  it('renders logs illustration for type="logs"', () => {
    const html = renderToStaticMarkup(
      <ListState
        state="empty"
        type="logs"
        message="Empty logs message"
      />
    );

    expect(html).toContain('Empty logs message');
    expect(html).toContain('logs empty state illustration');
  });

  it('renders artifacts illustration for type="artifacts"', () => {
    const html = renderToStaticMarkup(
      <ListState
        state="empty"
        type="artifacts"
        message="Empty artifacts message"
      />
    );

    expect(html).toContain('Empty artifacts message');
    expect(html).toContain('artifacts empty state illustration');
  });

  it('retains backward compatibility for callers without type prop', () => {
    const html = renderToStaticMarkup(
      <ListState
        state="empty"
        message="Legacy empty message"
      />
    );

    expect(html).toContain('Legacy empty message');
    expect(html).toContain('generic empty state illustration');
  });
});
