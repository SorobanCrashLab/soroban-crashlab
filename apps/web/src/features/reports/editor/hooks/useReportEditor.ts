'use client';

/**
 * Editor state machine: hydration → local edits → debounced draft → API save,
 * with offline queueing and compare-and-swap revision handling.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { safeStorage } from '@/lib/local-storage';
import {
  pinEvidence as pinEvidenceRef,
  resolveAllEvidence,
  unpinEvidence as unpinEvidenceRef,
  type EntityResolver,
} from '../lib/embeds';
import { toggleChecklistItem } from '../lib/checklist';
import { insertBlockAt, replaceBlockData } from '../lib/markdown-blocks';
import { mentionHandles } from '../lib/mentions';
import {
  appendRevision,
  compareRevisions,
  createRevision,
  type RevisionComparison,
} from '../lib/revision';
import { ReportDocumentSchema, ReportRecordSchema } from '../lib/schema';
import {
  canonicalizeDocument,
  documentFingerprint,
  serializeDocument,
} from '../lib/serialization';
import type {
  EntitySnapshot,
  QueuedSave,
  ReportComment,
  ReportDocument,
  ReportDraft,
  ReportRecord,
  ReportSavePayload,
} from '../lib/types';
import { applyTemplate, type TemplateApplicationMode } from '../templates';

export type EditorStatus =
  | 'loading'
  | 'ready'
  | 'saving'
  | 'saved'
  | 'offline'
  | 'conflict'
  | 'error';

export interface EditorConflict {
  reason: string;
  current: ReportRecord;
  candidate: ReportDocument;
}

export interface UseReportEditorOptions {
  reportId: string;
  debounceMs?: number;
  resolver?: EntityResolver;
  fetchImpl?: typeof fetch;
}

type SavePayload = ReportSavePayload;

type SaveResponse =
  | { ok: true; record: ReportRecord }
  | { ok: false; kind: 'conflict'; conflict: EditorConflict }
  | { ok: false; kind: 'error'; message: string };

const defaultFetch: typeof fetch = (input, init) => fetch(input, init);

export function draftStorageKey(reportId: string): string {
  return `crashlab.report.draft.v1.${reportId}`;
}

export function saveQueueStorageKey(reportId: string): string {
  return `crashlab.report.save-queue.v1.${reportId}`;
}

function emptyRecord(reportId: string): ReportRecord {
  const document: ReportDocument = {
    schemaVersion: 1,
    id: reportId,
    title: 'Untitled technical report',
    markdown: '',
    revision: 0,
    updatedAt: new Date(0).toISOString(),
    embeds: {},
    comments: [],
  };
  return { document, revisions: [] };
}

function readQueue(reportId: string): QueuedSave[] {
  const value = safeStorage.getJson<QueuedSave[]>(saveQueueStorageKey(reportId));
  return Array.isArray(value) ? value : [];
}

function payloadFromDocument(
  reportId: string,
  baseRevision: number,
  document: ReportDocument,
): SavePayload {
  return {
    id: reportId,
    baseRevision,
    patch: {
      title: document.title,
      markdown: document.markdown,
      embeds: document.embeds,
      comments: document.comments,
    },
  };
}

export function useReportEditor({
  reportId,
  debounceMs = 700,
  resolver,
  fetchImpl = defaultFetch,
}: UseReportEditorOptions) {
  const [record, setRecord] = useState<ReportRecord>(() => emptyRecord(reportId));
  const [baseRevision, setBaseRevision] = useState(0);
  const [status, setStatus] = useState<EditorStatus>('loading');
  const [message, setMessage] = useState('Loading report…');
  const [announcement, setAnnouncement] = useState('');
  const [conflict, setConflict] = useState<EditorConflict | null>(null);
  const [queueCount, setQueueCount] = useState(() => readQueue(reportId).length);
  const [hydrated, setHydrated] = useState(false);

  const recordRef = useRef(record);
  const baseRef = useRef(baseRevision);
  const skipFirstAutosave = useRef(true);

  // Keep imperative snapshots in sync without touching refs during render.
  useEffect(() => { recordRef.current = record; }, [record]);
  useEffect(() => { baseRef.current = baseRevision; }, [baseRevision]);

  const applyServerRecord = useCallback((next: ReportRecord, savedMessage: string) => {
    setRecord(next);
    recordRef.current = next;
    setBaseRevision(next.document.revision);
    baseRef.current = next.document.revision;
    setConflict(null);
    setStatus('saved');
    setMessage(savedMessage);
    setAnnouncement(savedMessage);
    safeStorage.setJson(draftStorageKey(reportId), {
      version: 1,
      document: next.document,
      baseRevision: next.document.revision,
      savedAt: new Date().toISOString(),
    } satisfies ReportDraft);
  }, [reportId]);

  const sendSave = useCallback(async (payload: SavePayload): Promise<SaveResponse> => {
    try {
      const isCreate = payload.baseRevision === 0 && !payload.restoreRevision;
      const response = await fetchImpl(isCreate ? '/api/reports' : '/api/reports', {
        method: isCreate ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          isCreate
            ? {
                id: payload.id,
                title: payload.patch.title,
                markdown: payload.patch.markdown,
                embeds: payload.patch.embeds,
                comments: payload.patch.comments,
                author: '@editor',
              }
            : { ...payload, author: '@editor' },
        ),
      });

      const json: unknown = await response.json().catch(() => null);
      if (response.status === 409) {
        const body = json as { current?: unknown; error?: { details?: { reason?: string }; message?: string } };
        const parsedCurrent = ReportRecordSchema.safeParse(body.current);
        const candidate = canonicalizeDocument({
          ...(payload.patch.title !== undefined
            ? { ...recordRef.current.document, ...payload.patch }
            : recordRef.current.document),
          revision: payload.baseRevision,
        });
        return {
          ok: false,
          kind: 'conflict',
          conflict: {
            reason: body.error?.details?.reason ?? body.error?.message ?? 'revision-conflict',
            current: parsedCurrent.success ? parsedCurrent.data : recordRef.current,
            candidate,
          },
        };
      }
      if (!response.ok) {
        return {
          ok: false,
          kind: 'error',
          message: (json as { error?: { message?: string } })?.error?.message ?? `Save failed (${response.status})`,
        };
      }
      const body = json as { report?: unknown } | null;
      const parsed = ReportRecordSchema.safeParse(body?.report ?? json);
      if (!parsed.success) return { ok: false, kind: 'error', message: 'Save returned an invalid report' };
      return { ok: true, record: parsed.data };
    } catch (error) {
      return {
        ok: false,
        kind: 'error',
        message: error instanceof Error ? error.message : 'Network error while saving',
      };
    }
  }, [fetchImpl]);

  const saveNow = useCallback(
    async (
      document: ReportDocument = recordRef.current.document,
      options: { force?: boolean; message?: string; restoreRevision?: number } = {},
    ): Promise<boolean> => {
      if (options.restoreRevision === undefined) {
        setStatus('saving');
        setMessage('Saving…');
      }
      const payload: SavePayload = options.restoreRevision
        ? {
            id: reportId,
            baseRevision: baseRef.current,
            patch: {},
            restoreRevision: options.restoreRevision,
            force: options.force,
          }
        : payloadFromDocument(reportId, baseRef.current, document);
      payload.revisionMessage = options.message;
      payload.force = options.force;

      const result = await sendSave(payload);
      if (result.ok) {
        applyServerRecord(result.record, `Saved revision r${result.record.document.revision}.`);
        return true;
      }
      if (result.kind === 'conflict') {
        setConflict(result.conflict);
        setStatus('conflict');
        setMessage('A newer revision exists. Review the conflict before saving.');
        setAnnouncement('Save conflict. A newer revision exists.');
        return false;
      }
      setStatus(navigator.onLine === false ? 'offline' : 'error');
      setMessage(result.message);
      setAnnouncement(result.message);
      return false;
    },
    [applyServerRecord, reportId, sendSave],
  );

  const enqueue = useCallback((document: ReportDocument) => {
    const queue = readQueue(reportId);
    const entry: QueuedSave = {
      id: `save-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      baseRevision: baseRef.current,
      payload: payloadFromDocument(reportId, baseRef.current, document),
      queuedAt: new Date().toISOString(),
    };
    const next = [...queue, entry];
    safeStorage.setJson(saveQueueStorageKey(reportId), next);
    setQueueCount(next.length);
  }, [reportId]);

  const flushQueue = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    let queue = readQueue(reportId);
    setQueueCount(queue.length);
    if (queue.length === 0) return;
    setStatus('saving');
    setMessage(`Flushing ${queue.length} queued save${queue.length === 1 ? '' : 's'}…`);
    const remaining: QueuedSave[] = [];
    for (const entry of queue) {
      const result = await sendSave(entry.payload);
      if (!result.ok) {
        remaining.push(entry);
        if (result.kind === 'conflict') {
          setConflict(result.conflict);
          setStatus('conflict');
          setMessage('Queued save conflicted with a newer revision.');
          continue;
        }
        setStatus(navigator.onLine === false ? 'offline' : 'error');
        setMessage(result.message);
        continue;
      }
      applyServerRecord(result.record, `Flushed queued save; now at r${result.record.document.revision}.`);
    }
    queue = remaining;
    safeStorage.setJson(saveQueueStorageKey(reportId), queue);
    setQueueCount(queue.length);
  }, [applyServerRecord, reportId, sendSave]);

  // Initial hydration: server record first, then a newer local draft if the
  // revision still matches. A draft from an older revision becomes a conflict.
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      setStatus('loading');
      setMessage('Loading report…');
      try {
        let response = await fetchImpl(`/api/reports?id=${encodeURIComponent(reportId)}`);
        if (response.status === 404) {
          const empty = emptyRecord(reportId);
          response = await fetchImpl('/api/reports', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              id: reportId,
              title: empty.document.title,
              markdown: empty.document.markdown,
              embeds: {},
              comments: [],
              author: '@editor',
            }),
          });
        }
        if (!response.ok) throw new Error(`Failed to load report (${response.status})`);
        const json: unknown = await response.json();
        const parsed = ReportRecordSchema.safeParse(json);
        if (!parsed.success) throw new Error('Report response failed validation');
        if (cancelled) return;

        const server = parsed.data;
        setRecord(server);
        recordRef.current = server;
        setBaseRevision(server.document.revision);
        baseRef.current = server.document.revision;

        const draft = safeStorage.getJson<ReportDraft>(draftStorageKey(reportId));
        const parsedDraft =
          draft?.version === 1 ? ReportDocumentSchema.safeParse(draft.document) : null;
        if (parsedDraft?.success && parsedDraft.data) {
          const local = canonicalizeDocument(parsedDraft.data);
          if (local.revision === server.document.revision &&
              documentFingerprint(local) !== documentFingerprint(server.document)) {
            setRecord({ ...server, document: local });
            recordRef.current = { ...server, document: local };
            setMessage('Restored unsaved draft from this browser.');
            setAnnouncement('Restored unsaved draft from this browser.');
          } else if (local.revision < server.document.revision) {
            setConflict({
              reason: 'local-draft-behind-server',
              current: server,
              candidate: local,
            });
          }
        }

        setStatus('ready');
        setMessage((previous) => previous || 'Report ready.');
        setHydrated(true);
      } catch (error) {
        if (cancelled) return;
        const fallback = safeStorage.getJson<ReportDraft>(draftStorageKey(reportId));
        if (fallback?.version === 1) {
          const parsedFallback = ReportDocumentSchema.safeParse(fallback.document);
          if (parsedFallback.success) {
            const local = canonicalizeDocument(parsedFallback.data);
            setRecord({ document: local, revisions: [] });
            recordRef.current = { document: local, revisions: [] };
            setBaseRevision(fallback.baseRevision);
            baseRef.current = fallback.baseRevision;
          }
        }
        setStatus('error');
        setMessage(error instanceof Error ? error.message : 'Unable to load report');
        setHydrated(true);
      }
    }
    void hydrate();
    return () => { cancelled = true; };
  }, [fetchImpl, reportId]);

  // Debounced local draft + API autosave.
  useEffect(() => {
    if (!hydrated) return;
    if (skipFirstAutosave.current) {
      skipFirstAutosave.current = false;
      return;
    }
    const document = record.document;
    const timer = window.setTimeout(() => {
      safeStorage.setJson(draftStorageKey(reportId), {
        version: 1,
        document,
        baseRevision: baseRef.current,
        savedAt: new Date().toISOString(),
      } satisfies ReportDraft);

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        enqueue(document);
        setStatus('offline');
        setMessage('Offline — change saved locally and queued for sync.');
        setAnnouncement('Offline. Your changes are saved locally and queued.');
        return;
      }
      void saveNow(document);
    }, debounceMs);
    return () => window.clearTimeout(timer);
  }, [debounceMs, enqueue, hydrated, record.document, reportId, saveNow]);

  useEffect(() => {
    const onOnline = () => {
      setMessage('Back online — syncing queued changes.');
      setAnnouncement('Back online. Syncing queued changes.');
      void flushQueue();
    };
    const onOffline = () => {
      setStatus('offline');
      setMessage('Offline — changes will be queued locally.');
      setAnnouncement('You are offline. Changes will be queued locally.');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flushQueue]);

  // Flush async so the initial sync does not call setState during render/effect body.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.onLine) return;
    const timer = window.setTimeout(() => void flushQueue(), 0);
    return () => window.clearTimeout(timer);
  }, [flushQueue]);

  const updateDocument = useCallback((updater: (document: ReportDocument) => ReportDocument) => {
    setRecord((previous) => ({
      ...previous,
      document: canonicalizeDocument(updater(previous.document)),
    }));
  }, []);

  const setTitle = useCallback((title: string) => {
    updateDocument((document) => ({ ...document, title }));
  }, [updateDocument]);

  const setMarkdown = useCallback((markdown: string) => {
    updateDocument((document) => ({ ...document, markdown }));
  }, [updateDocument]);

  const insertAt = useCallback((snippet: string, caret: number) => {
    updateDocument((document) => {
      const result = insertBlockAt(document.markdown, caret, snippet);
      return { ...document, markdown: result.markdown };
    });
    setAnnouncement('Block inserted.');
  }, [updateDocument]);

  const replaceWithTemplate = useCallback((templateId: string, mode: TemplateApplicationMode = 'replace') => {
    updateDocument((document) => ({
      ...document,
      markdown: applyTemplate(templateId, document.markdown, {
        mode,
        variables: {
          title: document.title,
          incident_id: document.id,
          author: '@you',
        },
      }),
    }));
    setAnnouncement(`Template ${templateId} applied.`);
  }, [updateDocument]);

  const setEvidenceMode = useCallback((id: string, snapshot?: EntitySnapshot) => {
    updateDocument((document) => {
      const reference = document.embeds[id];
      if (!reference) return document;
      const next =
        snapshot && reference.mode === 'live'
          ? pinEvidenceRef(reference, snapshot)
          : unpinEvidenceRef(reference);
      if (next.mode === 'live' && reference.mode === 'live') return document;
      return {
        ...document,
        markdown: replaceBlockData(document.markdown, id, next),
        embeds: { ...document.embeds, [id]: next },
      };
    });
    setAnnouncement(snapshot ? 'Evidence pinned to a snapshot.' : 'Evidence switched to live reference.');
  }, [updateDocument]);

  const toggleChecklist = useCallback((ordinal: number) => {
    updateDocument((document) => ({ ...document, markdown: toggleChecklistItem(document.markdown, ordinal) }));
  }, [updateDocument]);

  const addComment = useCallback((anchor: string, body: string, author = '@you') => {
    const comment: ReportComment = {
      id: `comment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      anchor,
      author,
      body,
      createdAt: new Date().toISOString(),
      resolved: false,
      mentions: mentionHandles(body),
    };
    // Mention delivery is intentionally a hook: a future API can consume
    // `buildMentionPayload(comment.id, body)` here without changing the UI.
    updateDocument((document) => ({ ...document, comments: [...document.comments, comment] }));
    setAnnouncement(`Comment added. ${comment.mentions.length} mention(s) linked.`);
    return comment;
  }, [updateDocument]);

  const resolveComment = useCallback((commentId: string) => {
    updateDocument((document) => ({
      ...document,
      comments: document.comments.map((comment) =>
        comment.id === commentId ? { ...comment, resolved: true } : comment,
      ),
    }));
    setAnnouncement('Comment resolved.');
  }, [updateDocument]);

  const saveVersion = useCallback((versionMessage: string) => {
    return saveNow(recordRef.current.document, { message: versionMessage || 'Manual version' });
  }, [saveNow]);

  const restoreRevision = useCallback((revision: number) => {
    return saveNow(recordRef.current.document, { restoreRevision: revision });
  }, [saveNow]);

  const acceptRemote = useCallback(() => {
    if (!conflict) return;
    setRecord(conflict.current);
    recordRef.current = conflict.current;
    setBaseRevision(conflict.current.document.revision);
    baseRef.current = conflict.current.document.revision;
    setConflict(null);
    setStatus('ready');
    setMessage('Loaded the newer remote revision.');
    setAnnouncement('Loaded the newer remote revision.');
    safeStorage.removeItem(draftStorageKey(reportId));
  }, [conflict, reportId]);

  const overwriteWithLocal = useCallback(() => saveNow(recordRef.current.document, { force: true }), [saveNow]);

  const compare = useCallback((left: number, right: number): RevisionComparison => {
    return compareRevisions(record, left, right);
  }, [record]);

  const resolveSnapshots = useCallback(async () => {
    return resolveAllEvidence(recordRef.current.document, resolver);
  }, [resolver]);

  const documentJson = useMemoSerialize(record.document);

  return {
    reportId,
    record,
    document: record.document,
    revisions: record.revisions,
    baseRevision,
    status,
    message,
    announcement,
    announce: setAnnouncement,
    conflict,
    queueCount,
    hydrated,
    documentJson,
    fingerprint: documentFingerprint(record.document),
    setTitle,
    setMarkdown,
    insertAt,
    setEvidenceMode,
    replaceWithTemplate,
    toggleChecklist,
    addComment,
    resolveComment,
    saveNow,
    saveVersion,
    restoreRevision,
    acceptRemote,
    overwriteWithLocal,
    compare,
    resolveSnapshots,
    updateDocument,
    appendRevision,
    createRevision,
  };
}

/** Serialization is exposed for the debug/details panel and diff tooling. */
function useMemoSerialize(document: ReportDocument): string {
  return useMemo(() => serializeDocument(document), [document]);
}
