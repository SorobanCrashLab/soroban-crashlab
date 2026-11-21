/**
 * Minimal YAML subset parser for policy files.
 *
 * Supports what `ops/alert-policies.yml` uses: indentation-based mappings,
 * sequences of mappings, inline `[a, b]` arrays, quoted strings, numbers,
 * booleans and comments. It intentionally does not implement anchors,
 * multi-line scalars or flow mappings — the policy schema is validated with
 * zod immediately after parsing, so unsupported syntax fails loudly.
 */

interface Line {
  indent: number;
  content: string;
}

function stripComment(raw: string): string {
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index];
    if (quote) {
      if (character === quote && raw[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "#") return raw.slice(0, index);
  }
  return raw;
}

function tokenize(source: string): Line[] {
  const lines: Line[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const cleaned = stripComment(raw).trimEnd();
    if (cleaned.trim() === "") continue;
    const indent = cleaned.length - cleaned.trimStart().length;
    lines.push({ indent, content: cleaned.trim() });
  }
  return lines;
}

function findSeparator(text: string): number {
  let quote: '"' | "'" | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote) {
      if (character === quote && text[index - 1] !== "\\") quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === ":" && (index === text.length - 1 || text[index + 1] === " ")) return index;
  }
  return -1;
}

function splitInlineList(text: string): string[] {
  return text
    .slice(1, -1)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseScalar(raw: string): unknown {
  const text = raw.trim();
  if (text === "") return null;
  if (text.startsWith("[") && text.endsWith("]")) return splitInlineList(text).map((item) => parseScalar(item));
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null" || text === "~") return null;
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1).replace(/\\"/g, '"');
  }
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10);
  if (/^-?\d*\.\d+$/.test(text)) return Number.parseFloat(text);
  return text;
}

function parseMap(lines: Line[], start: number, indent: number): { value: Record<string, unknown>; next: number } {
  const result: Record<string, unknown> = {};
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    if (line.indent < indent || (line.indent === indent && line.content.startsWith("- "))) break;
    if (line.indent !== indent) {
      throw new Error(`Unexpected indentation at "${line.content}"`);
    }
    const separator = findSeparator(line.content);
    if (separator < 0) throw new Error(`Expected "key: value" at "${line.content}"`);
    const key = line.content.slice(0, separator).trim();
    const inline = line.content.slice(separator + 1).trim();
    index += 1;
    if (inline !== "") {
      result[key] = parseScalar(inline);
      continue;
    }
    if (index >= lines.length || lines[index].indent <= indent) {
      result[key] = null;
      continue;
    }
    const child = parseBlock(lines, index, lines[index].indent);
    result[key] = child.value;
    index = child.next;
  }
  return { value: result, next: index };
}

function parseSequence(lines: Line[], start: number, indent: number): { value: unknown[]; next: number } {
  const result: unknown[] = [];
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    if (line.indent !== indent || !line.content.startsWith("-")) break;
    const rest = line.content.slice(1).trim();
    index += 1;
    if (rest === "") {
      const child = parseBlock(lines, index, lines[index]?.indent ?? indent + 2);
      result.push(child.value);
      index = child.next;
      continue;
    }
    const separator = findSeparator(rest);
    if (separator < 0) {
      result.push(parseScalar(rest));
      continue;
    }
    // Sequence item that is itself a mapping: parse the first key inline,
    // then absorb following lines at a deeper indentation into that mapping.
    const itemIndent = indent + 2;
    const synthetic: Line[] = [{ indent: itemIndent, content: rest }, ...lines.slice(index)];
    const child = parseMap(synthetic, 0, itemIndent);
    result.push(child.value);
    index += child.next - 1;
  }
  return { value: result, next: index };
}

function parseBlock(lines: Line[], start: number, indent: number): { value: unknown; next: number } {
  if (lines[start]?.content.startsWith("- ")) return parseSequence(lines, start, indent);
  return parseMap(lines, start, indent);
}

export function parseYamlLite(source: string): unknown {
  const lines = tokenize(source);
  if (lines.length === 0) return null;
  return parseBlock(lines, 0, lines[0].indent).value;
}
