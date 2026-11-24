'use client';

/**
 * Network panel (#2341): requests up to the playback position with status,
 * timing and the backend correlation ids that link into logs/traces
 * (#014/#075). Bodies and headers are never captured.
 */

import Link from 'next/link';
import type { SessionReplayState } from '../hooks/useSessionReplay';
import { formatOffset, requestLogsHref, traceLogsHref } from '../lib/timeline';

export function NetworkPanel({ replay }: { replay: SessionReplayState }) {
  const state = replay.state;
  if (!state) return null;
  const requests = [...state.network, ...state.inFlight.map((request) => ({ ...request, pending: true }))];
  return (
    <section className="card card-padding min-w-0" aria-label="Network">
      <h2 className="text-sm-semibold mb-2">
        Network <span className="text-meta">({state.network.length} done{state.inFlight.length > 0 ? `, ${state.inFlight.length} in flight` : ''})</span>
      </h2>
      {requests.length === 0 ? <p className="text-meta">No requests yet at this point.</p> : null}
      <div className="table-responsive overflow-auto max-h-80">
        <table className="data-table text-xs">
          <thead>
            <tr>
              <th scope="col" className="text-left">At</th>
              <th scope="col" className="text-left">Request</th>
              <th scope="col" className="text-right">Status</th>
              <th scope="col" className="text-right">Time</th>
              <th scope="col" className="text-left">Correlation</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => {
              const pending = 'pending' in request;
              return (
                <tr key={request.id} className={!pending && !request.ok ? 'field-error' : undefined}>
                  <td>
                    <button type="button" className="link font-mono" onClick={() => replay.seek(request.t)}>
                      {formatOffset(request.t - request.durationMs)}
                    </button>
                  </td>
                  <td className="max-w-[16rem] truncate" title={`${request.method} ${request.url}`}>
                    {request.method} {request.url}
                  </td>
                  <td className="text-right">{pending ? '…' : request.status === 0 ? 'failed' : request.status}</td>
                  <td className="text-right">{Math.round(request.durationMs)} ms</td>
                  <td className="whitespace-nowrap">
                    {request.requestId ? (
                      <Link className="link" href={requestLogsHref(request.requestId)}>
                        {request.requestId}
                      </Link>
                    ) : (
                      '—'
                    )}
                    {request.traceId ? (
                      <>
                        {' · '}
                        <Link className="link" href={traceLogsHref(request.traceId)}>
                          trace
                        </Link>
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
