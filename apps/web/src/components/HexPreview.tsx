'use client';

import React from 'react';

interface HexPreviewProps {
  hexDump: string;
  maxHeight?: string;
}

/**
 * Hex dump preview component for binary file content.
 * Displays a traditional hexdump with addresses, hex bytes, and ASCII representation.
 */
const HexPreview: React.FC<HexPreviewProps> = ({
  hexDump,
  maxHeight = 'max-h-96',
}) => {
  const lines = hexDump.split('\n');
  const isTruncated = lines.length > 1 && lines[lines.length - 1]?.startsWith('...');

  return (
    <div
      className={`overflow-auto ${maxHeight} rounded-lg font-mono`}
      style={{ border: '1px solid var(--border-color)' }}
    >
      <pre className="text-xs leading-relaxed p-4 whitespace-pre"
           style={{ background: '#0c0c0c', color: '#4ade80' }}>
        {hexDump}
      </pre>
      {isTruncated && (
        <div className="px-4 py-2 text-xs text-muted bg-zinc-800 dark:bg-zinc-900 border-t border-zinc-700">
          Hex dump truncated — showing first portion of the file
        </div>
      )}
    </div>
  );
};

export default HexPreview;
