/** Pure helpers for GFM task lists used by the checklist block. */
import { normalizeNewlines } from './serialization';

export interface ChecklistItem {
  index: number;
  checked: boolean;
  text: string;
  line: number;
}

const TASK_LINE = /^(\s*(?:[-*+]|\d+\.)\s+)\[([ xX])\]\s+(.*)$/;

export function parseChecklist(markdown: string): ChecklistItem[] {
  return normalizeNewlines(markdown)
    .split('\n')
    .flatMap((line, lineIndex) => {
      const match = TASK_LINE.exec(line);
      if (!match) return [];
      return [{
        index: lineIndex,
        checked: match[2].toLowerCase() === 'x',
        text: match[3],
        line: lineIndex + 1,
      }];
    })
    .map((item, index) => ({ ...item, index }));
}

/** Toggle a checklist item by its ordinal position among all task lines. */
export function toggleChecklistItem(markdown: string, ordinal: number): string {
  const items = parseChecklist(markdown);
  const target = items[ordinal];
  if (!target) return markdown;
  const lines = normalizeNewlines(markdown).split('\n');
  const match = TASK_LINE.exec(lines[target.index]);
  if (!match) return markdown;
  const nextChecked = match[2].toLowerCase() !== 'x';
  lines[target.index] = `${match[1]}[${nextChecked ? 'x' : ' '}] ${match[3]}`;
  return lines.join('\n');
}

export function createChecklistSnippet(items: string[] = ['Confirm repro steps', 'Attach evidence', 'Review with owner']): string {
  return items.map((item) => `- [ ] ${item}`).join('\n');
}
