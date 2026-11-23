/**
 * Markdown-first block directives. Rich blocks are stored as fenced code
 * blocks with a reserved language, so the document remains valid Markdown and
 * can be edited as plain text without any hidden binary representation.
 *
 * ```report-evidence
 * {"id":"evidence-1","type":"run","entityId":"run-001","mode":"live"}
 * ```
 */
import {
  CalloutBlockDataSchema,
  EvidenceRefSchema,
  MermaidBlockDataSchema,
} from './schema';
import { normalizeNewlines, stableStringify } from './serialization';
import type { CalloutBlockData, EvidenceRef, MermaidBlockData } from './types';

export const EVIDENCE_FENCE = 'report-evidence';
export const MERMAID_FENCE = 'report-mermaid';
export const CALLOUT_FENCE = 'report-callout';

export type ReportBlockKind = 'text' | 'evidence' | 'mermaid' | 'callout' | 'invalid';

export interface ReportBlock {
  kind: ReportBlockKind;
  id?: string;
  source: string;
  data?: EvidenceRef | MermaidBlockData | CalloutBlockData;
  error?: string;
}

const OPENING_FENCE = /^```(report-evidence|report-mermaid|report-callout)\s*$/;
const CLOSING_FENCE = /^```\s*$/;

function parsePayload(
  fence: string,
  payload: string,
): { data?: ReportBlock['data']; error?: string } {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (fence === EVIDENCE_FENCE) return { data: EvidenceRefSchema.parse(parsed) };
    if (fence === MERMAID_FENCE) return { data: MermaidBlockDataSchema.parse(parsed) };
    return { data: CalloutBlockDataSchema.parse(parsed) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid block payload' };
  }
}

/** Split Markdown into text and rich blocks without losing any source text. */
export function parseBlocks(markdown: string): ReportBlock[] {
  const lines = normalizeNewlines(markdown).split('\n');
  const blocks: ReportBlock[] = [];
  let textLines: string[] = [];

  const flushText = () => {
    if (textLines.length === 0) return;
    blocks.push({ kind: 'text', source: textLines.join('\n') });
    textLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const opening = OPENING_FENCE.exec(lines[index]);
    if (!opening) {
      textLines.push(lines[index]);
      continue;
    }

    const fence = opening[1];
    const start = index;
    const payloadLines: string[] = [];
    index += 1;
    while (index < lines.length && !CLOSING_FENCE.test(lines[index])) {
      payloadLines.push(lines[index]);
      index += 1;
    }
    const closed = index < lines.length;
    const source = lines.slice(start, Math.min(index + 1, lines.length)).join('\n');
    flushText();

    if (!closed) {
      blocks.push({ kind: 'invalid', source, error: 'Unclosed directive block' });
      continue;
    }
    const { data, error } = parsePayload(fence, payloadLines.join('\n'));
    blocks.push({
      kind: error ? 'invalid' : (fence.replace('report-', '') as ReportBlockKind),
      id: data?.id,
      source,
      data,
      error,
    });
  }

  flushText();
  return blocks;
}

/**
 * Reassemble Markdown from parsed blocks. Blank lines belong to the boundary
 * between blocks, so account for newlines already captured at the end of a
 * text block or the start of the next one instead of blindly adding `\n\n`.
 */
export function blocksToMarkdown(blocks: ReportBlock[]): string {
  if (blocks.length === 0) return '';
  return normalizeNewlines(
    blocks.reduce((result, block, index) => {
      if (index === 0) return block.source;
      const trailing = (result.match(/\n+$/) ?? [''])[0].length;
      const leading = (block.source.match(/^\n+/) ?? [''])[0].length;
      const separator = '\n'.repeat(Math.max(0, 2 - trailing - leading));
      return `${result}${separator}${block.source}`;
    }, ''),
  );
}

function directive(fence: string, data: unknown): string {
  return `\`\`\`${fence}\n${stableStringify(data)}\n\`\`\``;
}

export function createEvidenceBlock(ref: EvidenceRef): ReportBlock {
  return { kind: 'evidence', id: ref.id, data: ref, source: directive(EVIDENCE_FENCE, ref) };
}

export function createMermaidBlock(data: MermaidBlockData): ReportBlock {
  return { kind: 'mermaid', id: data.id, data, source: directive(MERMAID_FENCE, data) };
}

export function createCalloutBlock(data: CalloutBlockData): ReportBlock {
  return { kind: 'callout', id: data.id, data, source: directive(CALLOUT_FENCE, data) };
}

/** Replace a directive block's payload, preserving all surrounding Markdown. */
export function replaceBlockData(
  markdown: string,
  id: string,
  data: EvidenceRef | MermaidBlockData | CalloutBlockData,
): string {
  const blocks = parseBlocks(markdown).map((block) => {
    if (block.id !== id) return block;
    if ('entityId' in data) return createEvidenceBlock(data);
    if ('code' in data) return createMermaidBlock(data);
    return createCalloutBlock(data);
  });
  return blocksToMarkdown(blocks);
}

export interface InsertResult {
  markdown: string;
  caret: number;
}

/** Insert a block snippet at a caret position with blank-line separators. */
export function insertBlockAt(
  markdown: string,
  caret: number,
  snippet: string,
): InsertResult {
  const normalized = normalizeNewlines(markdown);
  const position = Math.max(0, Math.min(caret, normalized.length));
  const before = normalized.slice(0, position);
  const after = normalized.slice(position);
  const prefix = before.length === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const suffix = after.length === 0 || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const next = `${before}${prefix}${snippet}${suffix}${after}`;
  return { markdown: next, caret: before.length + prefix.length + snippet.length };
}

/** Replace the whole document with a template/other Markdown body. */
export function replaceMarkdown(_markdown: string, next: string): InsertResult {
  const normalized = normalizeNewlines(next);
  return { markdown: normalized, caret: normalized.length };
}
