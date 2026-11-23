'use client';

import { memo, useEffect, useRef, useState } from 'react';
import {
  evidenceSourceUrl,
  mockEntityResolver,
  resolveEvidence,
  type EntityResolver,
} from '../lib/embeds';
import { reportPlainText } from '../lib/sanitize';
import type { EntitySnapshot, EvidenceRef } from '../lib/types';

interface EvidenceEmbedProps {
  reference: EvidenceRef;
  resolver?: EntityResolver;
  onPin?: (snapshot: EntitySnapshot) => void;
  onUnpin?: () => void;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * Compact entity card. Resolution is deferred until the card scrolls into
 * view, which keeps reports with hundreds of embeds cheap to preview.
 */
export const EvidenceEmbed = memo(function EvidenceEmbed({
  reference,
  resolver = mockEntityResolver,
  onPin,
  onUnpin,
}: EvidenceEmbedProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [snapshot, setSnapshot] = useState<EntitySnapshot | null>(reference.snapshot ?? null);
  const [loading, setLoading] = useState(!reference.snapshot);
  const [error, setError] = useState('');

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    setError('');
    resolveEvidence(reference, resolver)
      .then((resolved) => {
        if (!active) return;
        setSnapshot(resolved);
        if (!resolved) setError('Entity could not be resolved.');
      })
      .catch(() => {
        if (active) setError('Entity could not be resolved.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
    // Depend on stable identity fields; `reference` can be a fresh parse result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference.entityId, reference.id, reference.mode, reference.type, resolver, visible]);

  const source = snapshot ? evidenceSourceUrl(snapshot) : null;

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={`Evidence ${reference.type} ${reference.entityId}`}
      className="my-4 rounded-xl border px-4 py-3"
      style={{ borderColor: 'var(--border-color)', background: 'var(--bg)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
          {reportPlainText(reference.type)} · {reference.mode === 'pinned' ? 'Pinned snapshot' : 'Live reference'}
        </span>
        <span className="chip text-xs">{reportPlainText(reference.entityId)}</span>
      </div>

      {loading ? (
        <p role="status" className="mt-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Loading evidence…
        </p>
      ) : error || !snapshot ? (
        <p role="alert" className="mt-2 text-sm" style={{ color: '#b42318' }}>
          {error || 'Evidence unavailable.'}
        </p>
      ) : (
        <>
          <h4 className="mt-2 text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {reportPlainText(snapshot.title)}
          </h4>
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <div>
              <dt className="sr-only">Status</dt>
              <dd>Status: {reportPlainText(snapshot.status)}</dd>
            </div>
            <div>
              <dt className="sr-only">Timestamp</dt>
              <dd>Captured: {formatTimestamp(snapshot.timestamp)}</dd>
            </div>
          </dl>
          {snapshot.summary && (
            <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {reportPlainText(snapshot.summary)}
            </p>
          )}
          {source && (
            <a className="link mt-2 inline-block text-xs" href={source} rel="noopener noreferrer" target="_blank">
              View source
            </a>
          )}
          {reference.mode === 'live' && onPin && snapshot && (
            <button type="button" className="btn-ghost ml-3 text-xs" onClick={() => onPin(snapshot)}>
              Pin snapshot
            </button>
          )}
          {reference.mode === 'pinned' && onUnpin && (
            <button type="button" className="btn-ghost ml-3 text-xs" onClick={onUnpin}>
              Use live
            </button>
          )}
        </>
      )}
    </div>
  );
});
