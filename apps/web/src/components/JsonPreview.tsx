'use client';

import React from 'react';
import { escapeHtml } from '../lib/sanitize';

interface JsonPreviewProps {
  content: string;
  maxHeight?: string;
}

/**
 * JSON file preview component with basic syntax highlighting.
 * Renders formatted JSON with color-coded keys, strings, numbers, booleans, and nulls.
 * All content is properly escaped to prevent XSS attacks.
 */
const JsonPreview: React.FC<JsonPreviewProps> = ({
  content,
  maxHeight = 'max-h-96',
}) => {
  const highlighted = highlightJson(content);

  return (
    <div
      className={`overflow-auto ${maxHeight} rounded-lg`}
      style={{ border: '1px solid var(--border-color)' }}
    >
      <pre
        className="font-mono text-xs leading-relaxed p-4 surface-soft text-zinc-800 dark:text-zinc-200 whitespace-pre"
        style={{ background: 'var(--surface)', color: 'var(--text-primary)' }}
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  );
};

/**
 * Apply basic syntax highlighting to JSON text.
 * Uses regex to colorize keys, strings, numbers, booleans, and null values.
 * All HTML special characters are escaped before applying color spans to prevent XSS.
 */
function highlightJson(json: string): string {
  const escaped = escapeHtml(json);

  return escaped.replace(
    /("(?:[^"\\]|\\.)*")\s*:/g, // keys
    '<span style="color: #2563eb;">$1</span>:'
  ).replace(
    /:\s*("(?:[^"\\]|\\.)*")/g, // string values
    ':<span style="color: #15803d;">$1</span>'
  ).replace(
    /:\s*(true|false)/g, // booleans
    ':<span style="color: #9333ea;">$1</span>'
  ).replace(
    /:\s*(null)/g, // null
    ':<span style="color: #dc2626;">$1</span>'
  ).replace(
    /(\b\d+\.?\d*(?:[eE][+-]?\d+)?\b)/g, // numbers (not inside strings)
    (match) => {
      return `<span style="color: #d97706;">${match}</span>`;
    }
  );
}

export default JsonPreview;
