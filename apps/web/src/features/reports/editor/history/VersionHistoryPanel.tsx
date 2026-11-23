'use client';

import { memo, useEffect, useState } from 'react';
import { formatRevisionLabel } from '../lib/revision';
import type { ReportRevision } from '../lib/types';

interface VersionHistoryPanelProps {
  revisions: readonly ReportRevision[];
  currentRevision: number;
  onSaveVersion: (message: string) => void;
  onRestore: (revision: number) => void;
  onCompare: (left: number, right: number) => void;
}

export const VersionHistoryPanel = memo(function VersionHistoryPanel({
  revisions,
  currentRevision,
  onSaveVersion,
  onRestore,
  onCompare,
}: VersionHistoryPanelProps) {
  const [message, setMessage] = useState('');
  const newest = revisions.length > 0 ? revisions[revisions.length - 1].revision : 0;
  const older = revisions.length > 1 ? revisions[revisions.length - 2].revision : newest;
  const [left, setLeft] = useState(older);
  const [right, setRight] = useState(newest);

  useEffect(() => {
    setLeft(older);
    setRight(newest);
  }, [newest, older]);

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSaveVersion(message.trim() || 'Manual version');
          setMessage('');
        }}
      >
        <label className="input-label" htmlFor="version-message">Save a named version</label>
        <input
          id="version-message"
          className="input-field"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="e.g. reviewed postmortem"
          maxLength={300}
        />
        <button type="submit" className="btn-outline w-fit text-xs">Save version</button>
      </form>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="input-label" htmlFor="compare-left">Compare from</label>
          <select id="compare-left" className="input-field" value={left} onChange={(event) => setLeft(Number(event.target.value))}>
            {revisions.map((revision) => (
              <option key={revision.revision} value={revision.revision}>r{revision.revision}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="input-label" htmlFor="compare-right">Compare to</label>
          <select id="compare-right" className="input-field" value={right} onChange={(event) => setRight(Number(event.target.value))}>
            {revisions.map((revision) => (
              <option key={revision.revision} value={revision.revision}>r{revision.revision}</option>
            ))}
          </select>
        </div>
        <button type="button" className="btn-ghost text-xs" onClick={() => onCompare(left, right)} disabled={revisions.length === 0}>
          Compare
        </button>
      </div>

      <ul className="space-y-2" role="list" aria-label="Version history">
        {[...revisions].reverse().map((revision) => (
          <li key={revision.revision} className="rounded-lg border p-3 text-xs" style={{ borderColor: 'var(--border-color)' }}>
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>
              {formatRevisionLabel(revision)}
              {revision.revision === currentRevision && <span className="chip ml-2">current</span>}
            </p>
            <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
              {new Date(revision.createdAt).toISOString().slice(0, 16).replace('T', ' ')} UTC
            </p>
            <button
              type="button"
              className="btn-ghost mt-2 text-xs"
              onClick={() => onRestore(revision.revision)}
              disabled={revision.revision === currentRevision}
            >
              Restore r{revision.revision}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
});
