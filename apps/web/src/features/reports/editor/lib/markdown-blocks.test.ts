import { describe, expect, it } from 'vitest';
import {
  blocksToMarkdown,
  createCalloutBlock,
  createEvidenceBlock,
  createMermaidBlock,
  insertBlockAt,
  parseBlocks,
  replaceBlockData,
} from './markdown-blocks';
import { createEvidenceRef } from './embeds';

describe('Markdown block directives', () => {
  it('round-trips text and rich blocks without losing source', () => {
    const evidence = createEvidenceBlock(createEvidenceRef('run', 'run-001', { id: 'ev-1' }));
    const markdown = `# Report\n\nSome text.\n\n${evidence.source}\n\nTail.`;
    const blocks = parseBlocks(markdown);
    expect(blocks.map((block) => block.kind)).toEqual(['text', 'evidence', 'text']);
    expect(blocks[1].id).toBe('ev-1');
    expect(blocksToMarkdown(blocks)).toBe(markdown);
  });

  it('keeps invalid directives visible as errors', () => {
    const blocks = parseBlocks('```report-callout\nnot json\n```');
    expect(blocks[0].kind).toBe('invalid');
    expect(blocks[0].error).toBeTruthy();
  });

  it('flags unclosed directives', () => {
    expect(parseBlocks('```report-mermaid\nflowchart TD')[0].error).toBe('Unclosed directive block');
  });

  it('inserts blocks with blank-line separators and reports the caret', () => {
    const result = insertBlockAt('intro', 5, 'body');
    expect(result.markdown).toBe('intro\n\nbody');
    expect(result.caret).toBe(11);
  });

  it('replaces only the targeted block payload', () => {
    const first = createEvidenceRef('run', 'run-001', { id: 'ev-1' });
    const second = createEvidenceRef('run', 'run-002', { id: 'ev-2' });
    const markdown = `A\n\n${createEvidenceBlock(first).source}\n\nB`;
    const updated = replaceBlockData(markdown, 'ev-1', { ...second, id: 'ev-1' });
    const blocks = parseBlocks(updated);
    expect(blocks[1].data).toMatchObject({ id: 'ev-1', entityId: 'run-002' });
    expect(updated).toContain('A\n\n');
    expect(updated).toContain('\n\nB');
  });

  it('creates deterministic Mermaid and callout sources', () => {
    expect(createMermaidBlock({ id: 'm1', code: 'flowchart TD\n A-->B' }).source).toBe(
      '```report-mermaid\n{"code":"flowchart TD\\n A-->B","id":"m1"}\n```',
    );
    expect(createCalloutBlock({ id: 'c1', variant: 'warning', title: 'Heads up', body: 'Check logs' }).source)
      .toContain('"variant":"warning"');
  });
});
