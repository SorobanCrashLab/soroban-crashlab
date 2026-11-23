'use client';

import { memo } from 'react';
import type { DiffLine } from '../lib/diff';

interface DiffViewProps {
  diff: DiffLine[];
}

const ROW_STYLE: Record<DiffLine['type'], { background: string; sign: string; label: string }> = {
  context: { background: 'transparent', sign: ' ', label: 'unchanged' },
  add: { background: 'rgba(7, 148, 85, 0.12)', sign: '+', label: 'added' },
  remove: { background: 'rgba(180, 35, 24, 0.12)', sign: '-', label: 'removed' },
};

/** Read-only, keyboard-scrollable diff table for two revisions. */
export const DiffView = memo(function DiffView({ diff }: DiffViewProps) {
  return (
    <div className="overflow-auto rounded-xl border" style={{ borderColor: 'var(--border-color)' }} role="region" aria-label="Revision diff" tabIndex={0}>
      <table className="w-full border-collapse font-mono text-xs">
        <caption className="sr-only">Line-by-line diff between selected revisions</caption>
        <thead>
          <tr>
            <th scope="col" className="w-12 p-2 text-left">Old</th>
            <th scope="col" className="w-12 p-2 text-left">New</th>
            <th scope="col" className="w-6 p-2 text-left"><span className="sr-only">Change</span></th>
            <th scope="col" className="p-2 text-left">Content</th>
          </tr>
        </thead>
        <tbody>
          {diff.map((line, index) => {
            const style = ROW_STYLE[line.type];
            return (
              <tr key={`${line.type}-${index}-${line.text}`} style={{ background: style.background }}>
                <td className="p-1 text-right" style={{ color: 'var(--text-secondary)' }}>{line.leftLine ?? ''}</td>
                <td className="p-1 text-right" style={{ color: 'var(--text-secondary)' }}>{line.rightLine ?? ''}</td>
                <td className="p-1"><span className="sr-only">{style.label}</span>{style.sign}</td>
                <td className="whitespace-pre-wrap p-1">{line.text || ' '}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
