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

/** Strip markup/control characters before storing or rendering diagram text. */
export function safeMermaidText(code: string): string {
  return normalizeNewlines(code)
    .replace(/<[^>]*>/g, '')
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
  // Arrows (`-->`, `->>`) legitimately contain `>`. Detect raw HTML tags in
  // the original source instead of rejecting every angle bracket.
  if (/<\s*\/?\s*[A-Za-z][^>]*>/.test(code)) {
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
      if (/participant|actor/i.test(line)) return `Participant: ${line.replace(/^\s*\w+\s+/, '')}`;
      if (/->|-->|--x|-\)/.test(line)) return `Message: ${line.trim()}`;
      if (/^\s*(activate|deactivate|note|alt|else|end)\b/i.test(line)) return line.trim();
      return line;
    });
  }
  if (/^(flowchart|graph)/.test(lines[0] ?? '')) {
    return lines.map((line) => line.replace(/-->/g, ' leads to ').replace(/---/g, ' connects to ').trim());
  }
  return lines;
}
