/** Slash command parsing used by the Markdown editor. */

export type SlashCommandName =
  | 'evidence'
  | 'mermaid'
  | 'callout'
  | 'table'
  | 'checklist'
  | 'template';

export interface SlashCommand {
  command: SlashCommandName;
  args: string[];
  raw: string;
}

export const SLASH_COMMANDS: ReadonlyArray<{
  name: SlashCommandName;
  hint: string;
  usage: string;
}> = [
  { name: 'evidence', hint: 'Embed a run, crash, trace, log, diff, chart or artifact', usage: '/evidence run run-001' },
  { name: 'mermaid', hint: 'Insert a Mermaid diagram block', usage: '/mermaid flowchart' },
  { name: 'callout', hint: 'Insert an info/warning/success/danger callout', usage: '/callout warning' },
  { name: 'table', hint: 'Insert a Markdown table', usage: '/table' },
  { name: 'checklist', hint: 'Insert a GFM task list', usage: '/checklist' },
  { name: 'template', hint: 'Apply a report template', usage: '/template postmortem' },
];

const KNOWN = new Set<string>(SLASH_COMMANDS.map((item) => item.name));

/** Split arguments while respecting double/single quoted values. */
function splitArgs(input: string): string[] {
  const result: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    result.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return result;
}

/**
 * Parse a slash command from a single line. Leading whitespace is allowed;
 * anything that is not a known command returns `null`.
 */
export function parseSlashCommand(line: string): SlashCommand | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('/')) return null;
  const [token, ...rest] = trimmed.split(/\s+/);
  const name = token.slice(1).toLowerCase();
  if (!KNOWN.has(name)) return null;
  return {
    command: name as SlashCommandName,
    args: splitArgs(rest.join(' ')),
    raw: trimmed,
  };
}

/** True while the current line still looks like an in-progress command. */
export function isSlashCommandPrefix(line: string): boolean {
  const trimmed = line.trim();
  return /^\/[a-z]*$/i.test(trimmed) || parseSlashCommand(trimmed) !== null;
}

export function getSlashCommand(name: SlashCommandName) {
  return SLASH_COMMANDS.find((item) => item.name === name);
}
