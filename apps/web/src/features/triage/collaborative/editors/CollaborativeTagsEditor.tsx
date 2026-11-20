'use client';

/**
 * Collaborative tags editor — CRDT array for tags (#2192).
 *
 * Allows multiple users to add/remove tags with real-time sync via
 * the mock CRDT array. Shows remote cursors/selections.
 */

import { memo, useState, useCallback } from 'react';
import type { MockYArray } from '../yjs/yjsProvider';

interface CollaborativeTagsEditorProps {
  tags: MockYArray<string>;
  readOnly?: boolean;
  onAddTag?: (tag: string) => void;
  onRemoveTag?: (index: number) => void;
}

function CollaborativeTagsEditorBase({
  tags,
  readOnly = false,
  onAddTag,
  onRemoveTag,
}: CollaborativeTagsEditorProps) {
  const [input, setInput] = useState('');

  const handleAdd = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || readOnly) return;
    // Check if already exists.
    let exists = false;
    tags.forEach((tag) => {
      if (tag === trimmed) exists = true;
    });
    if (exists) {
      setInput('');
      return;
    }
    tags.push(trimmed);
    onAddTag?.(trimmed);
    setInput('');
  }, [input, tags, readOnly, onAddTag]);

  const handleRemove = useCallback(
    (index: number) => {
      if (readOnly) return;
      tags.delete(index);
      onRemoveTag?.(index);
    },
    [tags, readOnly, onRemoveTag],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      } else if (e.key === 'Backspace' && input === '' && tags.length > 0) {
        handleRemove(tags.length - 1);
      }
    },
    [handleAdd, handleRemove, input, tags.length],
  );

  const tagArray = tags.toArray();

  return (
    <div>
      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
        Tags
      </label>
      <div
        className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg min-h-[38px] border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
        role="group"
        aria-label="Collaborative tags editor"
      >
        {tagArray.map((tag, index) => (
          <span
            key={`${tag}-${index}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
          >
            {tag}
            {!readOnly && (
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="hover:opacity-70"
                aria-label={`Remove tag ${tag}`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </span>
        ))}
        {!readOnly && (
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={tagArray.length === 0 ? 'Type and press Enter...' : ''}
            className="flex-1 min-w-[80px] bg-transparent border-none outline-none text-sm text-zinc-700 dark:text-zinc-300"
            aria-label="Add tag"
          />
        )}
      </div>
    </div>
  );
}

export const CollaborativeTagsEditor = memo(CollaborativeTagsEditorBase);
