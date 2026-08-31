'use client';

import React from 'react';

interface TextPreviewProps {
  content: string;
  maxHeight?: string;
  maxLines?: number;
}

/**
 * Plain text file preview component.
 * Displays text content in a monospaced pre block with line wrapping.
 * Supports truncating long content.
 */
const TextPreview: React.FC<TextPreviewProps> = ({
  content,
  maxHeight = 'max-h-96',
  maxLines,
}) => {
  const lines = content.split('\n');
  const truncatedLines = maxLines ? lines.slice(0, maxLines) : lines;
  const isTruncated = maxLines ? lines.length > maxLines : false;

  return (
    <div
      className={`overflow-auto ${maxHeight} rounded-lg border border-zinc-200 dark:border-zinc-700`}
    >
      <pre className="font-mono text-xs leading-relaxed p-4 surface-soft text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-all">
        {truncatedLines.join('\n')}
      </pre>
      {isTruncated && (
        <div className="px-4 py-2 text-xs text-muted bg-zinc-100 dark:bg-zinc-800 border-t border-zinc-200 dark:border-zinc-700">
          Showing {maxLines} of {lines.length} lines ({content.length} bytes)
        </div>
      )}
    </div>
  );
};

export default TextPreview;
