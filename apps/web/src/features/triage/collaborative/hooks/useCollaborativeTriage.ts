'use client';

/**
 * Main hook for collaborative triage (#2192).
 *
 * Manages the Yjs provider lifecycle, integrates presence, editors,
 * cursors, and handles offline/online sync.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { YjsProvider, type MockYDoc, type MockYArray, type MockYText, type MockYMap } from '../yjs/yjsProvider';
import { getTriageDocSchema } from '../yjs/docSchema';
import { AwarenessManager, type PresenceState } from '../yjs/awareness';
import { loadDoc, persistDoc } from '../yjs/persistence';
import type { ConflictInfo } from '../editors/ConflictResolutionBanner';

export interface CollaborativeTriageState {
  connected: boolean;
  localState: PresenceState | null;
  remoteStates: Map<string, PresenceState>;
  tags: MockYArray<string> | null;
  notes: MockYText | null;
  issueLinks: MockYMap<unknown> | null;
  conflict: ConflictInfo | null;
  addTag: (tag: string) => void;
  removeTag: (index: number) => void;
  updateNotes: (text: string) => void;
  addIssueLink: (id: string, link: unknown) => void;
  removeIssueLink: (id: string) => void;
  resolveConflict: (action: 'accept' | 'merge' | 'dismiss') => void;
}

export function useCollaborativeTriage(
  runId: string,
  user?: { id: string; name: string },
): CollaborativeTriageState {
  const [connected, setConnected] = useState(false);
  const [localState, setLocalState] = useState<PresenceState | null>(null);
  const [remoteStates, setRemoteStates] = useState<Map<string, PresenceState>>(new Map());
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const providerRef = useRef<YjsProvider | null>(null);
  const awarenessRef = useRef<AwarenessManager | null>(null);
  const [tags, setTags] = useState<MockYArray<string> | null>(null);
  const [notes, setNotes] = useState<MockYText | null>(null);
  const [issueLinks, setIssueLinks] = useState<MockYMap<unknown> | null>(null);

  useEffect(() => {
    const provider = new YjsProvider(runId);
    providerRef.current = provider;
    const awareness = new AwarenessManager();
    awarenessRef.current = awareness;

    // Load persisted doc for offline support.
    void loadDoc(runId).then((stored) => {
      if (stored) {
        // Apply persisted state to doc.
      }
    });

    const doc = provider.getDoc();
    const schema = getTriageDocSchema(doc);
    setTags(schema.tags);
    setNotes(schema.notes);
    setIssueLinks(schema.issueLinks);

    // Set up awareness.
    awareness.setLocalState({
      userId: user?.id ?? 'anonymous',
      userName: user?.name ?? 'Anonymous',
      status: 'viewing',
      color: '#3b82f6',
      lastActive: Date.now(),
    });

    const unsubStates = awareness.onStatesChange(() => {
      setLocalState(awareness.getLocalState());
      setRemoteStates(awareness.getRemoteStates());
    });

    // Connect.
    provider.connect();
    const unsubConn = doc.onStateChange(() => {
      setConnected(provider.getConnectionState() === 'connected');
    });

    // Periodically persist the doc (simulates y-indexeddb sync).
    const persistTimer = setInterval(() => {
      void persistDoc(runId, { tags: schema.tags.toArray(), notes: schema.notes.toString() });
    }, 5000);

    return () => {
      unsubStates();
      unsubConn();
      clearInterval(persistTimer);
      awareness.destroy();
      provider.disconnect();
      providerRef.current = null;
      awarenessRef.current = null;
    };
  }, [runId, user?.id, user?.name]);

  const addTag = useCallback((tag: string) => {
    if (tags) tags.push(tag);
  }, [tags]);

  const removeTag = useCallback((index: number) => {
    if (tags) tags.delete(index);
  }, [tags]);

  const updateNotes = useCallback((text: string) => {
    if (!notes) return;
    const current = notes.toString();
    notes.delete(0, current.length);
    notes.insert(0, text);
  }, [notes]);

  const addIssueLink = useCallback((id: string, link: unknown) => {
    if (issueLinks) issueLinks.set(id, link);
  }, [issueLinks]);

  const removeIssueLink = useCallback((id: string) => {
    if (issueLinks) issueLinks.delete(id);
  }, [issueLinks]);

  const resolveConflict = useCallback((action: 'accept' | 'merge' | 'dismiss') => {
    setConflict(null);
  }, []);

  return {
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
  };
}
