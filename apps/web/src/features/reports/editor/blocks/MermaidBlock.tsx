'use client';

import { memo, useMemo } from 'react';
import {
  mermaidToAccessibleText,
  safeMermaidText,
  validateMermaid,
} from '../lib/mermaid';
import { reportPlainText } from '../lib/sanitize';
import type { MermaidBlockData } from '../lib/types';

interface MermaidBlockProps {
  data: MermaidBlockData;
}

/**
 * Mermaid source is never injected as HTML. Valid diagrams render as a
 * structured text representation; anything suspicious falls back to a plain
 * `<pre><code>` view with diagnostics.
 */
export const MermaidBlock = memo(function MermaidBlock({ data }: MermaidBlockProps) {
  const validation = useMemo(() => validateMermaid(data.code), [data.code]);
  const accessibleLines = useMemo(() => mermaidToAccessibleText(data.code), [data.code]);
  const safeCode = useMemo(() => safeMermaidText(data.code), [data.code]);

  return (
    <figure
      className="my-4 rounded-xl border p-4"
      style={{ borderColor: 'var(--border-color)', background: 'var(--bg)' }}
      aria-label="Mermaid diagram"
    >
      <figcaption className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
        Mermaid diagram · {validation.valid ? 'text render' : 'source fallback'}
      </figcaption>

      {validation.valid ? (
        <ol className="ml-5 list-decimal space-y-1 text-xs" style={{ color: 'var(--text-primary)' }}>
          {accessibleLines.map((line, index) => (
            <li key={`${index}-${line}`} className="font-mono">
              {reportPlainText(line)}
            </li>
          ))}
        </ol>
      ) : (
        <div role="alert" className="mb-3 rounded border p-2 text-xs" style={{ borderColor: '#f04438', color: '#b42318' }}>
          {validation.diagnostics.map((diagnostic) => (
            <div key={diagnostic}>{reportPlainText(diagnostic)}</div>
          ))}
        </div>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs" style={{ color: 'var(--text-secondary)' }}>
          {validation.valid ? 'View source' : 'View safe source'}
        </summary>
        <pre className="mt-2 overflow-x-auto rounded p-3 text-xs" style={{ background: 'var(--surface)' }}>
          <code>{safeCode}</code>
        </pre>
      </details>
      {data.caption && (
        <p className="mt-2 text-xs italic" style={{ color: 'var(--text-secondary)' }}>
          {reportPlainText(data.caption)}
        </p>
      )}
    </figure>
  );
});
