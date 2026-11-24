'use client';

/**
 * Session replay index (#2341): session list, journey funnels and paths,
 * this browser's consent / developer-mode controls, and local bundle import
 * (developer mode reproduction bundles never leave the browser).
 */

import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { downloadTextFile } from '@/app/utils/browser-download';
import { AccessibleTabs } from '@/components/AccessibleTabs';
import type { ReplaySession, ReplaySessionSummary } from './capture/schema';
import { buildBundle, parseBundle } from './lib/bundle';
import type { JourneyReport } from './lib/journey';
import { formatOffset } from './lib/timeline';
import { privacySnapshot, readReplayConfig, subscribePrivacy, writeConsent, writeDeveloperMode } from './privacy/consent';
import { SessionReplayViewer } from './SessionReplayViewer';

interface ListPayload {
  viewer: { role: string; canViewCaptured: boolean };
  sessions: ReplaySessionSummary[];
  retentionDays: number;
}

function useJson<T>(url: string) {
  const [state, setState] = useState<{ data: T | null; error: string | null; done: boolean }>({ data: null, error: null, done: false });
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { data?: T; error?: string };
        if (!cancelled) setState({ data: body.data ?? null, error: response.ok ? null : body.error ?? `Request failed (${response.status})`, done: true });
      })
      .catch((error: Error) => {
        if (!cancelled) setState({ data: null, error: error.message, done: true });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return state;
}

function PrivacyControls() {
  const snapshot = useSyncExternalStore(subscribePrivacy, privacySnapshot, () => 'unset|0');
  const [consent, devMode] = snapshot.split('|');
  const config = readReplayConfig();
  const [status, setStatus] = useState<string | null>(null);

  const exportCurrent = async () => {
    const host = await import('./capture/host');
    const session = host.activeSession();
    if (!session) {
      const { decision } = host.captureStatus();
      setStatus(decision.record ? 'Capture is starting; try again in a moment.' : `Not recording (${decision.reason}). Reload after enabling developer mode and consent.`);
      return;
    }
    downloadTextFile(JSON.stringify(buildBundle(session), null, 2), `replay-${session.id}.json`);
    setStatus(`Exported ${session.events.length} events from this tab.`);
  };

  return (
    <section className="card card-padding flex flex-col gap-2" aria-label="Privacy and capture controls">
      <h2 className="text-sm-semibold">This browser</h2>
      <p className="text-sm">
        Deployment capture: <strong>{config.enabled ? `on (sampling ${Math.round(config.sampleRate * 100)}%)` : 'off'}</strong> · consent:{' '}
        <strong>{consent}</strong> · developer mode: <strong>{devMode === '1' ? 'on' : 'off'}</strong>
      </p>
      <p className="text-meta text-xs">
        Nothing is recorded without consent. Inputs are masked, sensitive elements and query values are redacted, and Global Privacy Control / Do-Not-Track
        always disable capture. Replay pages themselves are never recorded.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-outline text-xs" onClick={() => writeConsent(consent === 'granted' ? 'denied' : 'granted')}>
          {consent === 'granted' ? 'Withdraw consent' : 'Allow session replay'}
        </button>
        <button type="button" className="btn-outline text-xs" onClick={() => writeDeveloperMode(devMode !== '1')}>
          {devMode === '1' ? 'Disable developer mode' : 'Enable developer mode'}
        </button>
        <button type="button" className="btn-outline text-xs" onClick={() => void exportCurrent()}>
          Export this tab’s recording
        </button>
      </div>
      <p className="text-meta text-xs">Developer mode records this tab locally (after a reload) so you can attach a bundle to a bug report; it only uploads if deployment capture is on.</p>
      {status ? (
        <p className="text-sm" role="status">
          {status}
        </p>
      ) : null}
    </section>
  );
}

function Journeys({ report }: { report: JourneyReport | null }) {
  if (!report) return <p className="text-meta">Loading journeys…</p>;
  return (
    <div className="flex flex-col gap-4">
      <p className="text-meta text-sm">Computed over {report.sessions} visible session(s).</p>
      {report.funnels.map((funnel) => (
        <section key={funnel.id} className="card card-padding" aria-label={`${funnel.name} funnel`}>
          <h3 className="text-sm-semibold">
            {funnel.name} <span className="text-meta">· {funnel.entered} entered · {funnel.completed} completed</span>
          </h3>
          <ol className="flex flex-col gap-1 mt-2">
            {funnel.steps.map((step, index) => (
              <li key={step.label} className="text-sm">
                <div className="flex-between">
                  <span>
                    {index + 1}. {step.label}
                  </span>
                  <span className="text-meta">
                    {step.sessions} · {step.conversion}%{index > 0 && step.dropOff > 0 ? ` · −${step.dropOff}` : ''}
                  </span>
                </div>
                <div className="h-2 rounded bg-token-border" aria-hidden="true">
                  <div className="h-2 rounded bg-blue-500" style={{ width: `${step.conversion}%` }} />
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <section className="card card-padding" aria-label="Top paths">
        <h3 className="text-sm-semibold">Top paths</h3>
        <ol className="text-sm mt-1 flex flex-col gap-1">
          {report.paths.map((entry) => (
            <li key={entry.path.join('>')}>
              <code>{entry.path.join(' → ')}</code> <span className="text-meta">· {entry.sessions}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export function SessionReplayIndex() {
  const list = useJson<ListPayload>('/api/session-replay');
  const journeys = useJson<{ report: JourneyReport }>('/api/session-replay?view=journeys');
  const [tab, setTab] = useState<'sessions' | 'journeys'>('sessions');
  const [imported, setImported] = useState<ReplaySession | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  if (imported) return <SessionReplayViewer session={imported} banner={importMessage} onClose={() => setImported(null)} />;

  return (
    <div className="container-full page-padding fade-in flex flex-col gap-4">
      <header>
        <h1 className="heading-page">Session replay &amp; journey debugger</h1>
        <p className="text-meta mt-1">
          Privacy-aware replays of UI events, navigation, network and errors, correlated with backend request ids.
          {list.data ? ` Captured sessions are kept ${list.data.retentionDays} days.` : ''}
        </p>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <AccessibleTabs
          label="Session replay views"
          selected={tab}
          onSelect={setTab}
          tabs={[
            { id: 'sessions', label: 'Sessions', badge: list.data?.sessions.length },
            { id: 'journeys', label: 'Journeys' },
          ]}
        >
          {tab === 'sessions' ? (
            <section aria-label="Sessions" aria-busy={!list.done}>
              {list.error ? <p className="field-error">{list.error}</p> : null}
              {list.data && !list.data.viewer.canViewCaptured ? (
                <p className="text-meta text-sm mb-2">Signed out: only demo sessions are listed. Sign in to see captured sessions.</p>
              ) : null}
              <div className="table-responsive overflow-auto">
                <table className="data-table text-sm">
                  <thead>
                    <tr>
                      <th scope="col" className="text-left">Session</th>
                      <th scope="col" className="text-left">Started (UTC)</th>
                      <th scope="col" className="text-right">Duration</th>
                      <th scope="col" className="text-left">Path</th>
                      <th scope="col" className="text-right">Errors</th>
                      <th scope="col" className="text-right">Failed requests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(list.data?.sessions ?? []).map((session) => (
                      <tr key={session.id}>
                        <td>
                          <Link className="link" href={`/support/session-replay/${encodeURIComponent(session.id)}`}>
                            {session.id}
                          </Link>
                          {session.source === 'demo' ? <span className="ds-badge ds-badge-neutral ml-1">demo</span> : null}
                          {session.incidentIds.map((id) => (
                            <span key={id} className="ds-badge ds-badge-info ml-1">
                              {id}
                            </span>
                          ))}
                        </td>
                        <td className="whitespace-nowrap">{session.startedAt.slice(0, 16).replace('T', ' ')}</td>
                        <td className="text-right">{formatOffset(session.durationMs)}</td>
                        <td className="max-w-[20rem] truncate" title={session.routes.join(' → ')}>
                          {session.routes.join(' → ')}
                        </td>
                        <td className={`text-right ${session.errorCount > 0 ? 'field-error' : ''}`}>{session.errorCount}</td>
                        <td className={`text-right ${session.failedRequests > 0 ? 'field-error' : ''}`}>{session.failedRequests}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : (
            <Journeys report={journeys.data?.report ?? null} />
          )}
        </AccessibleTabs>

        <div className="flex flex-col gap-4">
          <PrivacyControls />
          <section className="card card-padding flex flex-col gap-2" aria-label="Open a reproduction bundle">
            <h2 className="text-sm-semibold">Open a reproduction bundle</h2>
            <p className="text-meta text-xs">The file is validated and replayed locally; nothing is uploaded.</p>
            <input
              type="file"
              accept="application/json,.json"
              aria-label="Replay bundle file"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void file.text().then((text) => {
                  const parsed = parseBundle(text);
                  if (!parsed.ok) {
                    setImportMessage(`Invalid bundle: ${parsed.errors.join('; ')}`);
                    return;
                  }
                  setImportMessage(parsed.checksumValid ? null : 'Warning: bundle checksum does not match — it was modified after export.');
                  setImported(parsed.bundle.session);
                });
              }}
            />
            {importMessage ? (
              <p className="text-sm field-error" role="alert">
                {importMessage}
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
