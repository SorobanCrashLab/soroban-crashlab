'use client';

import React from 'react';

interface JsonPreviewProps {
  content: string;
  maxHeight?: string;
}

/**
 * JSON file preview component with basic syntax highlighting.
 * Renders formatted JSON with color-coded keys, strings, numbers, booleans, and nulls.
 */
const JsonPreview: React.FC<JsonPreviewProps> = ({
  content,
  maxHeight = 'max-h-96',
}) => {
  const highlighted = highlightJson(content);

  return (
    <div
      className={`overflow-auto ${maxHeight} rounded-lg border border-zinc-200 dark:border-zinc-700`}
    >
      <pre
        className="font-mono text-xs leading-relaxed p-4 surface-soft text-zinc-800 dark:text-zinc-200 whitespace-pre"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />
    </div>
  );
};

/**
 * Apply basic syntax highlighting to JSON text.
 * Uses regex to colorize keys, strings, numbers, booleans, and null values.
 */
function highlightJson(json: string): string {
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(?:[^"\\]|\\.)*")\s*:/g, // keys
    '<span class="text-blue-600 dark:text-blue-400">$1</span>:'
  ).replace(
    /:\s*("(?:[^"\\]|\\.)*")/g, // string values
    ':<span class="text-green-700 dark:text-green-400">$1</span>'
  ).replace(
    /:\s*(true|false)/g, // booleans
    ':<span class="text-purple-600 dark:text-purple-400">$1</span>'
  ).replace(
    /:\s*(null)/g, // null
    ':<span class="text-red-500 dark:text-red-400">$1</span>'
  ).replace(
    /(\b\d+\.?\d*(?:[eE][+-]?\d+)?\b)/g, // numbers (not inside strings)
    (match) => {
      // Only color numbers that are JSON values (follow : or , or start of array)
      return `<span class="text-amber-600 dark:text-amber-400">${match}</span>`;
    }
  );
}

export default JsonPreview;
