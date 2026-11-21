'use client';

/**
 * Collaborative issue links editor — CRDT map (issue links) (#2192).
 *
 * Allows multiple users to add/remove issue links with real-time sync
 * via the mock CRDT map.
 */

import { memo, useState, useCallback, useEffect } from 'react';
import type { MockYMap } from '../yjs/yjsProvider';

export interface IssueLink {
  id: string;
  label: string;
  href: string;
}

interface CollaborativeIssueLinksProps {
  issueLinks: MockYMap<IssueLink>;
  readOnly?: boolean;
  onAdd?: (link: IssueLink) => void;
  onRemove?: (id: string) => void;
}

function CollaborativeIssueLinksBase({
  issueLinks,
  readOnly = false,
  onAdd,
  onRemove,
}: CollaborativeIssueLinksProps) {
  const [links, setLinks] = useState<IssueLink[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newHref, setNewHref] = useState('');

  // Subscribe to CRDT map changes.
  useEffect(() => {
    const unsub = issueLinks.observe(() => {
      const arr: IssueLink[] = [];
      issueLinks.forEach((v) => {
        if (v) arr.push(v as IssueLink);
      });
      setLinks(arr);
    });
    // Initial load.
    const initial: IssueLink[] = [];
    issueLinks.forEach((v) => {
      if (v) initial.push(v as IssueLink);
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional state sync in this hook
    setLinks(initial);
    return unsub;
  }, [issueLinks]);

  const handleAdd = useCallback(() => {
    if (!newLabel.trim() || !newHref.trim() || readOnly) return;
    const id = `issue-${Date.now()}`;
    const link: IssueLink = { id, label: newLabel.trim(), href: newHref.trim() };
    issueLinks.set(id, link);
    onAdd?.(link);
    setNewLabel('');
    setNewHref('');
  }, [newLabel, newHref, issueLinks, readOnly, onAdd]);

  const handleRemove = useCallback(
    (id: string) => {
      if (readOnly) return;
      issueLinks.delete(id);
      onRemove?.(id);
    },
    [issueLinks, readOnly, onRemove],
  );

  return (
    <div>
      <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5 block">
        Issue Links
      </label>
      <div className="space-y-2">
        {links.map((link) => (
          <div
            key={link.id}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-50 dark:bg-zinc-900/30 border border-zinc-200 dark:border-zinc-800"
          >
            <a
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex-1"
            >
              {link.label}
            </a>
            {!readOnly && (
              <button
                type="button"
                onClick={() => handleRemove(link.id)}
                className="p-1 text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                aria-label={`Remove issue link ${link.label}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <div className="flex gap-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Issue label..."
              className="flex-1 px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm"
              aria-label="New issue label"
            />
            <input
              type="text"
              value={newHref}
              onChange={(e) => setNewHref(e.target.value)}
              placeholder="https://..."
              className="flex-1 px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm"
              aria-label="New issue URL"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newLabel.trim() || !newHref.trim()}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export const CollaborativeIssueLinks = memo(CollaborativeIssueLinksBase);
