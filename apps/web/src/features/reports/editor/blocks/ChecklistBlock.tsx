'use client';

import { memo, useMemo } from 'react';
import { parseChecklist } from '../lib/checklist';
import { reportPlainText } from '../lib/sanitize';

interface ChecklistBlockProps {
  markdown: string;
  onToggle?: (ordinal: number) => void;
}

/** Accessible GFM task list used by the `/checklist` block and preview. */
export const ChecklistBlock = memo(function ChecklistBlock({ markdown, onToggle }: ChecklistBlockProps) {
  const items = useMemo(() => parseChecklist(markdown), [markdown]);
  if (items.length === 0) return null;

  return (
    <ul className="my-4 space-y-2 rounded-xl border p-4" style={{ borderColor: 'var(--border-color)' }} aria-label="Report checklist">
      {items.map((item) => (
        <li key={`${item.line}-${item.text}`} className="flex items-start gap-3 text-sm">
          <input
            id={`check-${item.line}`}
            type="checkbox"
            checked={item.checked}
            disabled={!onToggle}
            onChange={() => onToggle?.(item.index)}
            aria-label={reportPlainText(item.text)}
            className="mt-1 h-4 w-4"
          />
          <label htmlFor={`check-${item.line}`} style={{ color: 'var(--text-primary)' }}>
            {reportPlainText(item.text)}
          </label>
        </li>
      ))}
    </ul>
  );
});
