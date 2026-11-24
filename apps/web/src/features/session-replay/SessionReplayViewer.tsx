'use client';

/**
 * Session replay & journey debugger — single-session view (#2341).
 */

import Link from 'next/link';
import { useState } from 'react';
import { useSessionReplay } from './hooks/useSessionReplay';
import { ErrorPanel } from './player/ErrorPanel';
import { NetworkPanel } from './player/NetworkPanel';
import { ReplayPlayer } from './player/ReplayPlayer';
import { TimelinePanel } from './player/TimelinePanel';
import { formatOffset } from './lib/timeline';
import type { ReplaySession } from './capture/schema';

export interface SessionReplayViewerProps {
  id?: string;
  shareToken?: string | null;
  /** Locally imported bundle (developer mode). */
  session?: ReplaySession;
  onClose?: () => void;
  /** Shown above the player, e.g. an import checksum warning. */
  banner?: string | null;
}

export function SessionReplayViewer({ id, shareToken, session: local, onClose, banner }: SessionReplayViewerProps) {
  const replay = useSessionReplay({ id, shareToken, session: local });
  const [ttl, setTtl] = useState(60);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const session = replay.session;

  return (
    <div className="container-full page-padding fade-in flex flex-col gap-4">
      <header className="flex-between flex-wrap gap-3">
        <div className="min-w-0">
          <p className="text-meta text-sm">
            <Link className="link" href="/support/session-replay">
              Session replay
            </Link>{' '}
            / {session?.id ?? id}
          </p>
          <h1 className="heading-page">Journey debugger</h1>
          {session ? (
            <p className="text-meta mt-1">
              {session.startedAt.slice(0, 19).replace('T', ' ')} UTC · {formatOffset(session.durationMs)} · {session.userAgent} ·{' '}
              {session.viewport.width}×{session.viewport.height} · {session.environment}
              {session.release ? ` · ${session.release}` : ''}
              {session.source === 'demo' ? ' · demo session' : ''}
              {replay.access === 'share' ? ' · opened via share link' : ''}
              {replay.access === 'local' ? ' · local bundle (not uploaded)' : ''}
              {session.droppedEvents > 0 ? ` · ${session.droppedEvents} events dropped` : ''}
            </p>
          ) : null}
        </div>
        {session ? (
          <div className="flex flex-wrap items-center gap-2">
            {replay.access !== 'local' ? (
              <a className="btn-outline text-xs" href={`/api/session-replay?id=${encodeURIComponent(session.id)}&format=bundle${shareToken ? `&share=${encodeURIComponent(shareToken)}` : ''}`}>
                Export bundle
              </a>
            ) : null}
            <button type="button" className="btn-outline text-xs" onClick={replay.downloadBugReport}>
              Bug report (Markdown)
            </button>
            {replay.viewer?.canShare && session.source !== 'demo' ? (
              <span className="flex items-center gap-1">
                <label className="text-sm flex items-center gap-1">
                  Share for
                  <select className="input-field" value={ttl} onChange={(event) => setTtl(Number(event.target.value))}>
                    <option value={15}>15 min</option>
                    <option value={60}>1 hour</option>
                    <option value={1440}>1 day</option>
                    <option value={10080}>7 days</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="btn-outline text-xs"
                  onClick={() =>
                    void replay.share(ttl).then((result) => {
                      if (result) setShareUrl(result.url);
                    })
                  }
                >
                  Create share link
                </button>
              </span>
            ) : null}
            {onClose ? (
              <button type="button" className="btn-ghost text-xs" onClick={onClose}>
                Close
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {banner ? (
        <p className="field-error text-sm" role="alert">
          {banner}
        </p>
      ) : null}
      {shareUrl ? (
        <p className="text-sm break-all" role="status">
          Share link (audited, expires automatically): <code>{shareUrl}</code>
        </p>
      ) : null}
      {replay.loading ? <p className="text-meta">Loading session…</p> : null}
      {replay.error ? (
        <p className="field-error" role="alert">
          {replay.error}. Captured sessions require signing in or a valid share link.
        </p>
      ) : null}

      {session ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div className="flex flex-col gap-4 min-w-0">
            <ReplayPlayer replay={replay} />
            <NetworkPanel replay={replay} />
          </div>
          <div className="flex flex-col gap-4 min-w-0">
            <ErrorPanel replay={replay} />
            <TimelinePanel replay={replay} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
