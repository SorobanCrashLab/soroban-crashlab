'use client';

import React from 'react';

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
      >
        {highlighted}
      </pre>
    </div>
  );
};

/**
 * Apply basic syntax highlighting to JSON text without turning payload data into HTML.
 */
function highlightJson(json: string): React.ReactNode {
  try {
    JSON.parse(json);
  } catch {
    return json;
  }

  const tokens: React.ReactNode[] = [];
  let index = 0;
  let tokenIndex = 0;

  while (index < json.length) {
    const character = json[index];

    if (character === '"') {
      const start = index;
      index += 1;
      while (index < json.length) {
        if (json[index] === '\\') {
          index += 2;
        } else if (json[index] === '"') {
          index += 1;
          break;
        } else {
          index += 1;
        }
      }

      const value = json.slice(start, index);
      let nextIndex = index;
      while (/\s/.test(json[nextIndex] ?? '')) {
        nextIndex += 1;
      }
      const type = json[nextIndex] === ':' ? 'key' : 'string';
      tokens.push(
        <span key={`${type}-${tokenIndex}`} style={{ color: type === 'key' ? '#2563eb' : '#15803d' }}>
          {value}
        </span>
      );
      tokenIndex += 1;
      continue;
    }

    const number = json.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    const literal = json.slice(index).match(/^(?:true|false|null)\b/);
    if (number || literal) {
      const value = number?.[0] ?? literal?.[0] ?? '';
      const color = number ? '#d97706' : literal?.[0] === 'null' ? '#dc2626' : '#9333ea';
      tokens.push(
        <span key={`value-${tokenIndex}`} style={{ color }}>
          {value}
        </span>
      );
      tokenIndex += 1;
      index += value.length;
      continue;
    }

    const textStart = index;
    index += 1;
    while (
      index < json.length &&
      json[index] !== '"' &&
      !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.test(json.slice(index)) &&
      !/^(?:true|false|null)\b/.test(json.slice(index))
    ) {
      index += 1;
    }
    tokens.push(json.slice(textStart, index));
  }

  return tokens;
}

export default JsonPreview;
