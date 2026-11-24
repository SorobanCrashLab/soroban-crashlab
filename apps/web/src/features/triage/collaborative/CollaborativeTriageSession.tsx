'use client';

/**
 * Collaborative triage session — main provider + UI (#2192).
 *
 * Wraps the run detail page with collaborative features: presence bar,
 * collaborative editors (tags, notes, issue links), conflict resolution,
 * and cursor tracking. Uses the mock Yjs provider for CRDT sync.
 */

import { memo } from 'react';
import type { FuzzingRun } from '@/app/types';
import { useCollaborativeTriage } from './hooks/useCollaborativeTriage';
import { useOptimisticLock } from './hooks/useOptimisticLock';
import { PresenceBar } from './presence/PresenceBar';
import { CollaborativeTagsEditor } from './editors/CollaborativeTagsEditor';
import { CollaborativeNotesEditor } from './editors/CollaborativeNotesEditor';
import { CollaborativeIssueLinks, type IssueLink } from './editors/CollaborativeIssueLinks';
import { ConflictResolutionBanner } from './editors/ConflictResolutionBanner';
import type { MockYMap } from './yjs/yjsProvider';

interface CollaborativeTriageSessionProps {
  runId: string;
  run: Pick<FuzzingRun, 'id' | 'tags'>;
  userRole?: 'analyst' | 'maintainer';
  user?: { id: string; name: string };
}

function CollaborativeTriageSessionBase({
  runId,
  run: _run,
  userRole = 'analyst',
  user = { id: 'anonymous', name: 'Anonymous' },
}: CollaborativeTriageSessionProps) {
  const {
    connected,
    localState,
    remoteStates,
    tags,
    notes,
    issueLinks,
    conflict,
    addTag,
    removeTag,
    updateNotes,
    addIssueLink,
    removeIssueLink,
    resolveConflict,
  } = useCollaborativeTriage(runId, user);

  const canWrite = userRole === 'maintainer' || userRole === 'analyst';
  const { hasLock, lockHolder, takeOwnership, releaseLock } = useOptimisticLock(runId, canWrite);

  return (
    <div className="space-y-4">
      {/* Presence bar */}
      <PresenceBar localState={localState} remoteStates={remoteStates} />

      {/* Connection status */}
      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            connected ? 'bg-green-500' : 'bg-zinc-400'
          }`}
          aria-hidden="true"
        />
        {connected ? 'Connected for collaborative editing' : 'Connecting...'}
      </div>

      {/* Optimistic locking */}
      {canWrite && (
        <div className="flex items-center gap-2">
          {hasLock ? (
            <>
              <span className="text-xs text-green-600 dark:text-green-400">
                You have edit ownership (5 min)
              </span>
              <button
                type="button"
                onClick={releaseLock}
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline"
              >
                Release
              </button>
            </>
          ) : lockHolder ? (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {lockHolder} has edit ownership
            </span>
          ) : (
            <button
              type="button"
              onClick={takeOwnership}
              className="text-xs px-3 py-1.5 rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Take Ownership
            </button>
          )}
        </div>
      )}

      {/* Conflict resolution */}
      <ConflictResolutionBanner
        conflict={conflict}
        onAccept={() => resolveConflict('accept')}
        onMerge={() => resolveConflict('merge')}
        onDismiss={() => resolveConflict('dismiss')}
      />

      {/* Collaborative editors */}
      <div className="space-y-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        {tags && (
          <CollaborativeTagsEditor
            tags={tags}
            readOnly={!canWrite}
            onAddTag={(tag) => addTag(tag)}
            onRemoveTag={(index) => removeTag(index)}
          />
        )}
        {notes && (
          <CollaborativeNotesEditor
            notes={notes}
            readOnly={!canWrite}
            onChange={(text) => updateNotes(text)}
          />
        )}
        {issueLinks && (
          <CollaborativeIssueLinks
            issueLinks={issueLinks as unknown as import("./yjs/yjsProvider").MockYMap<IssueLink>}
            readOnly={!canWrite}
            onAdd={(link) => addIssueLink(link.id, link)}
            onRemove={(id) => removeIssueLink(id)}
          />
        )}
      </div>
    </div>
  );
}

export const CollaborativeTriageSession = memo(CollaborativeTriageSessionBase);
