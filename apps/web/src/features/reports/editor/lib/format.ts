/** Text transformations behind the Markdown formatting toolbar. */
import { createChecklistSnippet } from './checklist';
import { normalizeNewlines } from './serialization';

export type FormatAction =
  | 'bold'
  | 'italic'
  | 'code'
  | 'link'
  | 'heading'
  | 'list'
  | 'quote'
  | 'table'
  | 'code-block'
  | 'checklist';

export interface SelectionResult {
  text: string;
  start: number;
  end: number;
}

const WRAPPERS: Partial<Record<FormatAction, [string, string, string]>> = {
  bold: ['**', '**', 'bold text'],
  italic: ['*', '*', 'italic text'],
  code: ['`', '`', 'code'],
  link: ['[', '](https://example.com)', 'link text'],
};

const LINE_PREFIXES: Partial<Record<FormatAction, string>> = {
  heading: '## ',
  list: '- ',
  quote: '> ',
};

/** Wrap the current selection (or a placeholder) with inline Markdown. */
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string,
): SelectionResult {
  const normalized = normalizeNewlines(text);
  const from = Math.max(0, Math.min(start, normalized.length));
  const to = Math.max(from, Math.min(end, normalized.length));
  const selected = normalized.slice(from, to) || placeholder;
  const next = `${normalized.slice(0, from)}${before}${selected}${after}${normalized.slice(to)}`;
  return {
    text: next,
    start: from + before.length,
    end: from + before.length + selected.length,
  };
}

/** Prefix every line touched by the selection; used for headings/lists/quotes. */
export function prefixSelectedLines(
  text: string,
  start: number,
  end: number,
  prefix: string,
): SelectionResult {
  const normalized = normalizeNewlines(text);
  const from = Math.max(0, Math.min(start, normalized.length));
  const to = Math.max(from, Math.min(end, normalized.length));
  const lineStart = normalized.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
  const nextBreak = normalized.indexOf('\n', to === from ? from : to - 1);
  const lineEnd = nextBreak === -1 ? normalized.length : nextBreak;
  const block = normalized.slice(lineStart, lineEnd);
  const lines = block.split('\n').map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`));
  const replacement = lines.join('\n');
  return {
    text: `${normalized.slice(0, lineStart)}${replacement}${normalized.slice(lineEnd)}`,
    start: lineStart,
    end: lineStart + replacement.length,
  };
}

export const TABLE_SNIPPET = `| Component | Result | Notes |
| --- | --- | --- |
| Contract | pass | deterministic |
| RPC | fail | timeout |`;

export const CODE_BLOCK_SNIPPET = `\`\`\`text
Paste log excerpt here
\`\`\``;

/** Apply a toolbar action at the current selection. */
export function applyFormat(
  text: string,
  start: number,
  end: number,
  action: FormatAction,
): SelectionResult {
  if (action === 'table' || action === 'code-block' || action === 'checklist') {
    const snippet = action === 'table'
      ? TABLE_SNIPPET
      : action === 'code-block'
        ? CODE_BLOCK_SNIPPET
        : createChecklistSnippet();
    const normalized = normalizeNewlines(text);
    const position = Math.max(0, Math.min(start, normalized.length));
    const separator = position > 0 && !normalized.slice(0, position).endsWith('\n') ? '\n\n' : '';
    const next = `${normalized.slice(0, position)}${separator}${snippet}${normalized.slice(position)}`;
    const insertedAt = position + separator.length;
    return { text: next, start: insertedAt, end: insertedAt + snippet.length };
  }

  const wrapper = WRAPPERS[action];
  if (wrapper) return wrapSelection(text, start, end, wrapper[0], wrapper[1], wrapper[2]);

  const prefix = LINE_PREFIXES[action];
  if (prefix) return prefixSelectedLines(text, start, end, prefix);

  return { text, start, end };
}

export const FORMAT_SHORTCUTS: ReadonlyArray<{ action: FormatAction; keys: string; label: string }> = [
  { action: 'bold', keys: 'Ctrl+B', label: 'Bold' },
  { action: 'italic', keys: 'Ctrl+I', label: 'Italic' },
  { action: 'link', keys: 'Ctrl+K', label: 'Link' },
  { action: 'code', keys: 'Ctrl+E', label: 'Code' },
  { action: 'heading', keys: 'Ctrl+Shift+H', label: 'Heading' },
  { action: 'list', keys: 'Ctrl+Shift+L', label: 'List' },
  { action: 'quote', keys: 'Ctrl+Shift+Q', label: 'Quote' },
  { action: 'table', keys: 'Ctrl+Shift+T', label: 'Table' },
  { action: 'code-block', keys: 'Ctrl+Shift+C', label: 'Code block' },
];
