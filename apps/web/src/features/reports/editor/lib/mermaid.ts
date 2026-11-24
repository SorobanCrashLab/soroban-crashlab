/** Safe, deterministic handling for Mermaid diagram source. */
import { normalizeNewlines } from './serialization';

const VALID_HEADERS = [
  'flowchart',
  'graph',
  'sequenceDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'erDiagram',
  'journey',
  'classDiagram',
];

export interface MermaidValidation {
  valid: boolean;
  diagnostics: string[];
}

/**
 * Remove tag-like sequences by scanning rather than by matching a partial HTML
 * regex. Every literal `<` is consumed, so no HTML element can be introduced
 * even when the input contains malformed or comment-wrapped markup.
 */
function stripTagLikeSequences(input: string): string {
  let output = '';
  let cursor = 0;
  while (cursor < input.length) {
    if (input[cursor] !== '<') {
      output += input[cursor];
      cursor += 1;
      continue;
    }
    const closingBracket = input.indexOf('>', cursor + 1);
    if (closingBracket === -1) {
      // Unmatched opening bracket: drop it and keep the remaining text.
      cursor += 1;
      continue;
    }
    cursor = closingBracket + 1;
  }
  // Belt and braces: no literal angle-bracket opener may survive.
  return output.split('<').join('');
}

const ARROW_RIGHT = '-'.repeat(2) + '>';
const ARROW_LINE = '---';

/** Strip markup/control characters before storing or rendering diagram text. */
export function safeMermaidText(code: string): string {
  return stripTagLikeSequences(normalizeNewlines(code))
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .split('\n')
    .slice(0, 200)
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

/**
 * Conservative validation. Reports never execute Mermaid directly: the block
 * renders a structured text representation and falls back to `<pre><code>`
 * when validation fails.
 */
export function validateMermaid(code: string): MermaidValidation {
  const safe = safeMermaidText(code);
  const diagnostics: string[] = [];
  if (!safe) diagnostics.push('Diagram source is empty.');
  if (safe.length > 20_000) diagnostics.push('Diagram source exceeds 20,000 characters.');
  // Any `<` is treated as raw markup. Flowchart arrows use `>` only, so this
  // rejects HTML without rejecting valid diagram syntax.
  if (code.includes('<')) {
    diagnostics.push('Raw HTML is not allowed in diagrams.');
  }
  const firstLine = safe.split('\n')[0] ?? '';
  if (!VALID_HEADERS.some((header) => firstLine.startsWith(header))) {
    diagnostics.push('Diagram must start with a supported Mermaid header.');
  }
  if (/^\s*(click|style|classDef)\b/im.test(safe)) {
    diagnostics.push('Interactive/directive statements are not allowed.');
  }
  if ((safe.match(/"/g) ?? []).length % 2 !== 0) {
    diagnostics.push('Quotes are unbalanced.');
  }
  return { valid: diagnostics.length === 0, diagnostics };
}

/** Render a small accessible text representation of common diagram syntax. */
export function mermaidToAccessibleText(code: string): string[] {
  const safe = safeMermaidText(code);
  const lines = safe.split('\n').filter(Boolean);
  if (/^(sequenceDiagram|journey)/.test(lines[0] ?? '')) {
    return lines.map((line) => {
      const normalized = line.toLowerCase();
      if (normalized.includes('participant') || normalized.includes('actor')) {
        return `Participant: ${line.replace(/^\s*\w+\s+/, '')}`;
      }
      if (line.includes('->') || line.includes('--x') || line.includes('-)')) {
        return `Message: ${line.trim()}`;
      }
      if (/^\s*(activate|deactivate|note|alt|else|end)\b/i.test(line)) return line.trim();
      return line;
    });
  }
  if (/^(flowchart|graph)/.test(lines[0] ?? '')) {
    return lines.map((line) =>
      line.split(ARROW_RIGHT).join(' leads to ').split(ARROW_LINE).join(' connects to ').trim(),
    );
  }
  return lines;
}
