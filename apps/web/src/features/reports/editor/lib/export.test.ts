import { describe, expect, it } from 'vitest';
import {
  buildExportMarkdown,
  exportHtml,
  exportMarkdown,
  exportPdfHtml,
} from './export';
import { createEvidenceBlock, createCalloutBlock, createMermaidBlock } from './markdown-blocks';
import { createEvidenceRef } from './embeds';
import type { EntitySnapshot, ReportDocument } from './types';

const snapshot: EntitySnapshot = {
  id: 'run-001',
  type: 'run',
  title: 'Run with token=abc123',
  status: 'failed',
  timestamp: '2026-11-21T10:00:00Z',
  sourceUrl: 'javascript:alert(1)',
  summary: 'Authorization: Bearer supersecret123456',
  fields: { seed: '0x2f', note: 'password=hunter2' },
};

function document(markdown: string): ReportDocument {
  return {
    schemaVersion: 1,
    id: 'report-1',
    title: 'Report with api_key=xyz123',
    markdown,
    revision: 2,
    updatedAt: '2026-11-21T10:00:00Z',
    embeds: {},
    comments: [],
  };
}

describe('report export', () => {
  it('resolves evidence snapshots into self-contained Markdown', () => {
    const ref = createEvidenceRef('run', 'run-001', { id: 'ev-1' });
    const markdown = `Intro\n\n${createEvidenceBlock({ ...ref, mode: 'pinned', snapshot }).source}\n\nOutro`;
    const result = buildExportMarkdown(document(markdown));
    expect(result).toContain('**Evidence · run — Run with [REDACTED]');
    expect(result).toContain('- Captured: 2026-11-21 10:00');
    expect(result).toContain('| seed | 0x2f |');
    expect(result).toContain('Outro');
    expect(result).not.toContain('report-evidence');
    expect(result).not.toContain('supersecret123456');
    expect(result).not.toContain('javascript:');
  });

  it('uses exported snapshots for live references', () => {
    const ref = createEvidenceRef('trace', 'trace-9a4', { id: 'ev-live' });
    const markdown = createEvidenceBlock(ref).source;
    const result = buildExportMarkdown(document(markdown), {
      snapshots: { 'ev-live': { ...snapshot, id: 'trace-9a4', type: 'trace', sourceUrl: '/traces/trace-9a4' } },
    });
    expect(result).toContain('[view source](/traces/trace-9a4)');
  });

  it('renders callouts and diagrams without raw HTML', () => {
    const markdown = [
      createCalloutBlock({ id: 'c1', variant: 'warning', title: 'Careful', body: 'Check logs' }).source,
      createMermaidBlock({ id: 'm1', code: 'flowchart TD\n  A --> B' }).source,
    ].join('\n\n');
    const exported = buildExportMarkdown(document(markdown));
    expect(exported).toContain('**WARNING — Careful**');
    expect(exported).toContain('```mermaid');
    expect(exported).not.toContain('<script');
  });

  it('falls back to safe source for invalid diagrams', () => {
    const markdown = createMermaidBlock({ id: 'm2', code: '<script>alert(1)</script>' }).source;
    const exported = buildExportMarkdown(document(markdown));
    expect(exported).toContain('Diagram unavailable');
    expect(exported).not.toContain('<script>');
  });

  it('escapes content in HTML export and sanitizes links', () => {
    const markdown = `Text <script>alert(1)</script>\n\n[bad](javascript:alert(1))`;
    const html = exportHtml(document(markdown));
    expect(html).toContain('<!doctype html>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('href="javascript:');
  });

  it('produces PDF-ready print CSS and a deterministic title', () => {
    const html = exportPdfHtml(document('# Body'));
    expect(html).toContain('@page');
    expect(html).toContain('@media print');
    expect(html).toContain('Report with [REDACTED]');
    expect(exportMarkdown(document('# Body'))).toBe('# Report with [REDACTED]\n\n# Body\n');
  });
});
