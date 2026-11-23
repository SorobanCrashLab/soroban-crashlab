/**
 * Small, deterministic Markdown → safe HTML renderer for report exports.
 *
 * Text is escaped before any markup is generated, links are passed through the
 * shared URL sanitizer, and the result is run through `sanitizeReportHtml` as a
 * final defense-in-depth step. No raw author HTML is ever emitted.
 */
import { escapeReportText, safeReportUrl, sanitizeReportHtml } from './sanitize';
import { normalizeNewlines } from './serialization';

const INLINE_PATTERN = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\([^)\n]+\))/g;

function inlineMarkdown(text: string, depth = 0): string {
  if (depth > 3) return escapeReportText(text);
  let result = '';
  let cursor = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const start = match.index ?? 0;
    result += escapeReportText(text.slice(cursor, start));
    const token = match[0];
    if (token.startsWith('`')) {
      result += `<code>${escapeReportText(token.slice(1, -1))}</code>`;
    } else if (token.startsWith('**')) {
      result += `<strong>${inlineMarkdown(token.slice(2, -2), depth + 1)}</strong>`;
    } else if (token.startsWith('*')) {
      result += `<em>${inlineMarkdown(token.slice(1, -1), depth + 1)}</em>`;
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link) {
        const safeUrl = safeReportUrl(link[2]);
        result +=
          safeUrl === '#'
            ? escapeReportText(link[1])
            : `<a href="${escapeReportText(safeUrl)}" rel="noopener noreferrer">${inlineMarkdown(link[1], depth + 1)}</a>`;
      } else {
        result += escapeReportText(token);
      }
    }
    cursor = start + token.length;
  }
  return result + escapeReportText(text.slice(cursor));
}

function isBlockStart(line: string): boolean {
  return (
    /^\s*$/.test(line) ||
    /^```/.test(line) ||
    /^#{1,6}\s/.test(line) ||
    /^\s*(?:[-*+]|\d+\.)\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^\s*(-{3,}|\*{3,})\s*$/.test(line)
  );
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim());
}

export function markdownToSafeHtml(markdown: string): string {
  const lines = normalizeNewlines(markdown).split('\n');
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = /^```([a-zA-Z0-9_-]*)\s*$/.exec(line);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const language = fence[1] ? ` class="language-${escapeReportText(fence[1])}"` : '';
      output.push(`<pre><code${language}>${escapeReportText(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (
      line.includes('|') &&
      index + 1 < lines.length &&
      /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[index + 1]) &&
      lines[index + 1].includes('-')
    ) {
      const head = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      const headHtml = head.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('');
      const rowsHtml = rows
        .map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`)
        .join('');
      output.push(`<table><thead><tr>${headHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`);
      continue;
    }

    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      output.push('<hr>');
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      output.push(`<blockquote>${inlineMarkdown(quote.join(' '))}</blockquote>`);
      continue;
    }

    const listMatch = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[2]);
      const items: string[] = [];
      while (index < lines.length) {
        const current = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(lines[index]);
        if (!current) break;
        let text = current[3];
        const task = /^\[([ xX])\]\s+(.*)$/.exec(text);
        if (task) text = `${task[1].toLowerCase() === 'x' ? '☑' : '☐'} ${task[2]}`;
        items.push(`<li>${inlineMarkdown(text)}</li>`);
        index += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      output.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    if (paragraph.length === 0) {
      paragraph.push(line);
      index += 1;
    }
    output.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
  }

  return sanitizeReportHtml(output.join('\n'));
}
