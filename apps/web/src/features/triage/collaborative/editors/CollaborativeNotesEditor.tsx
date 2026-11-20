'use client';

/**
 * Collaborative notes editor — CRDT rich text (notes) (#2192).
 *
 * Simulates rich text editing with real-time sync via mock CRDT text.
 * Shows remote cursors in the text area.
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import type { MockYText } from '../yjs/yjsProvider';

interface CollaborativeNotesEditorProps {
  notes: MockYText;
  readOnly?: boolean;
  onChange?: (text: string) => void;
}

function CollaborativeNotesEditorBase({
  notes,
  readOnly = false,
  onChange,
}: CollaborativeNotesEditorProps) {
  const [text, setText] = useState(notes.toString());
  const lastLengthRef = useRef(notes.length);

  // Subscribe to CRDT text changes.
  useEffect(() => {
    const unsub = notes.observe(() => {
      setText(notes.toString());
    });
    return unsub;
  }, [notes]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value;
      const oldText = notes.toString();

      // Compute the diff and apply as CRDT operations.
      if (newText.length > lastLengthRef.current) {
        // Insertion: find the insertion point.
        let i = 0;
        while (i < oldText.length && i < newText.length && oldText[i] === newText[i]) i++;
        notes.insert(i, newText.slice(i));
      } else if (newText.length < lastLengthRef.current) {
        // Deletion: find the deletion point.
        let i = 0;
        while (i < newText.length && oldText[i] === newText[i]) i++;
        notes.delete(i, oldText.length - newText.length);
      } else {
        // Replace all (simpler approach for complex edits).
        notes.delete(0, oldText.length);
        notes.insert(0, newText);
      }

      lastLengthRef.current = newText.length;
      setText(newText);
      onChange?.(newText);
    },
    [notes, onChange],
  );

  return (
    <div>
      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
        Notes
      </label>
      <textarea
        value={text}
        onChange={readOnly ? undefined : handleChange}
        readOnly={readOnly}
        rows={4}
        placeholder="Add notes about this run... Other collaborators will see your changes in real-time."
        className="w-full px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        aria-label="Collaborative notes editor"
      />
    </div>
  );
}

export const CollaborativeNotesEditor = memo(CollaborativeNotesEditorBase);
