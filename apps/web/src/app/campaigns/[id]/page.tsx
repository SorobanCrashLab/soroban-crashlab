'use client';

/**
 * Campaign detail page with the scrubbable timeline (#1874).
 *
 * The page owns polling/live mode; the scrubber owns the view window and
 * playhead. Scrubbing pauses polling so a live append cannot move the
 * playhead out from under the operator mid-drag.
 */

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import CampaignTimelineScrubber from '@/components/timeline/CampaignTimelineScrubber';
import type { CampaignTimelineResponse, CampaignStatus } from '@/lib/campaigns/campaign-registry';

const LIVE_POLL_MS = 5_000;

type TimelineState =
  | { status: 'loading' }
  | { status: 'error'; message: string; notFound: boolean }
  | { status: 'ready'; data: CampaignTimelineResponse };

const STATUS_STYLES: Record<CampaignStatus, string> = {
  queued: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  running: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  completed: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  cancelled: 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  failed: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
};

async function fetchTimeline(
  campaignId: string,
  signal?: AbortSignal,
): Promise<CampaignTimelineResponse> {
  const response = await fetch(
    `/api/campaigns/${encodeURIComponent(campaignId)}/timeline`,
    { cache: 'no-store', signal },
  );
  if (response.status === 404) {
    throw new NotFoundError('Campaign not found.');
  }
  if (!response.ok) {
    throw new Error('Failed to load campaign timeline.');
  }
  const body = (await response.json()) as { data?: CampaignTimelineResponse };
  if (!body.data) throw new Error('Failed to load campaign timeline.');
  return body.data;
}

class NotFoundError extends Error {}

function formatRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return '0.0%';
  return `${(rate * 100).toFixed(1)}%`;
}

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [state, setState] = useState<TimelineState>({ status: 'loading' });
  const [live, setLive] = useState(true);
  const mountedRef = useRef(true);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await fetchTimeline(id, signal);
        if (mountedRef.current) setState({ status: 'ready', data });
      } catch (error) {
        if (signal?.aborted) return;
        if (!mountedRef.current) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setState({
          status: 'error',
          message:
            error instanceof Error ? error.message : 'Failed to load campaign timeline.',
          notFound: error instanceof NotFoundError,
        });
      }
    },
    [id],
  );

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      mountedRef.current = false;
      controller.abort();
    };
  }, [load]);

  // Live mode re-fetches; turning live off stops the interval, not the page.
  useEffect(() => {
    if (!live || state.status !== 'ready') return;
    const timer = setInterval(() => {
      void load();
    }, LIVE_POLL_MS);
    return () => clearInterval(timer);
  }, [live, load, state.status]);

  const retry = () => {
    setState({ status: 'loading' });
    void load();
  };

  if (state.status === 'loading') {
    return (
      <main
        aria-busy="true"
        aria-label="Campaign timeline"
        data-testid="campaign-timeline-page"
        className="mx-auto w-full max-w-6xl px-4 py-8"
      >
        <div className="h-8 w-64 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-6 h-64 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
        <p className="sr-only">Loading campaign timeline…</p>
      </main>
    );
  }

  if (state.status === 'error') {
    return (
      <main
        data-testid="campaign-timeline-page"
        className="mx-auto w-full max-w-6xl px-4 py-8"
      >
        <Link
          href="/"
          className="text-sm font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
        >
          ← Back to dashboard
        </Link>
        <div
          role="alert"
          data-testid="campaign-timeline-error"
          className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-6 dark:border-rose-900/50 dark:bg-rose-950/20"
        >
          <h1 className="text-lg font-bold text-rose-900 dark:text-rose-200">
            {state.notFound ? 'Campaign not found' : 'Failed to load campaign timeline'}
          </h1>
          <p className="mt-1 text-sm text-rose-800 dark:text-rose-300">{state.message}</p>
          {!state.notFound ? (
            <button
              type="button"
              onClick={retry}
              className="mt-4 rounded-md border border-rose-300 px-3 py-1.5 text-sm font-semibold text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-200 dark:hover:bg-rose-950/40"
            >
              Retry
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  const { campaign, summary } = state.data;
  const title = campaign.name && campaign.name.length > 0 ? campaign.name : `Campaign ${campaign.id}`;
  const statusClass = STATUS_STYLES[campaign.status] ?? STATUS_STYLES.queued;

  return (
    <main
      data-testid="campaign-timeline-page"
      className="mx-auto w-full max-w-6xl px-4 py-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/"
            className="text-sm font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
          >
            ← Back to dashboard
          </Link>
          <h1 className="mt-2 text-2xl font-black text-zinc-900 dark:text-zinc-100">{title}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Created {new Date(campaign.createdAt).toLocaleString()}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${statusClass}`}
        >
          {campaign.status}
        </span>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Seeds executed" value={summary.seeds.toLocaleString()} />
        <SummaryCard label="Failures" value={summary.failures.toLocaleString()} />
        <SummaryCard label="Failure rate" value={formatRate(summary.failureRate)} />
        <SummaryCard label="Distinct signatures" value={summary.distinctSignatures.toLocaleString()} />
      </dl>

      {state.data.sampledPoints === 0 ? (
        <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
          No progress samples have been ingested yet. Milestones appear below as the campaign
          lifecycle advances.
        </p>
      ) : null}

      <div className="mt-6">
        <CampaignTimelineScrubber
          series={state.data}
          live={live}
          onLiveChange={setLive}
          title="Campaign timeline"
        />
      </div>

      <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
        The series is bucketed server-side ({state.data.bucketCount} buckets
        {state.data.downsampled ? ', downsampled' : ''}). Scrubbing pauses live updates; press
        <span className="font-semibold"> Live</span> to resume.
      </p>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{value}</dd>
    </div>
  );
}
