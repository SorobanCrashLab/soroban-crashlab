import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isTerminalJobStatus } from '@/lib/replay/job-state';
import { replayJobStore } from '@/lib/replay/job-store';
import { REPLAY_RUNNER_INFO } from '@/lib/replay/runners';
import { replayIssueHref, replayOutcomeLabel, replayRunHref } from '@/lib/replay/result';
import ReplayJobLive from './ReplayJobLive';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Succeeded',
  mismatch: 'Completed — not reproduced',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const STATUS_TONE: Record<string, string> = {
  queued: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  running: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
  succeeded: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  mismatch: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  failed: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
};

const LEVEL_TONE: Record<string, string> = {
  info: 'text-gray-600 dark:text-gray-400',
  warn: 'text-amber-700 dark:text-amber-300',
  error: 'text-rose-700 dark:text-rose-300',
};

export default async function ReplayResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = replayJobStore.get(id);

  if (!job) notFound();

  const terminal = isTerminalJobStatus(job.status);
  const latest = job.events.at(-1);
  const percent = latest?.percent ?? 0;
  const result = job.result;
  const runner = REPLAY_RUNNER_INFO[job.runner];

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-10">
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            Replay report
          </p>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_TONE[job.status] ?? STATUS_TONE.queued}`}
          >
            {STATUS_LABEL[job.status] ?? job.status}
          </span>
          {!terminal && <ReplayJobLive jobId={job.id} initialPercent={percent} />}
        </div>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
          {result ? replayOutcomeLabel(result) : job.failure ? job.failure.title : 'Replay in progress'}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400">
          {result
            ? `Signature ${result.outcome === 'match' ? 'matched' : 'did not match'} the crash recorded by the source run.`
            : job.failure
              ? job.failure.message
              : 'The runner is working through the bundle. This page updates as phases complete.'}
        </p>
      </header>

      <section className="mb-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        <div className="grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-gray-500 dark:text-gray-400">Source run</p>
            <Link
              href={replayRunHref(job.sourceRunId)}
              className="font-mono font-semibold text-indigo-600 dark:text-indigo-400 underline"
            >
              {job.sourceRunId}
            </Link>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">Runner</p>
            <p className="font-semibold text-gray-900 dark:text-gray-100">{runner.label}</p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">Requested by</p>
            <p className="font-semibold text-gray-900 dark:text-gray-100">{job.requestedBy}</p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400">Started</p>
            <p className="font-semibold text-gray-900 dark:text-gray-100">
              {new Date(job.createdAt).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{latest?.message ?? 'Awaiting runner'}</span>
            <span className="tabular-nums">{percent}%</span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="Replay progress"
          >
            <div
              className={`h-full rounded-full ${job.status === 'failed' ? 'bg-rose-500' : 'bg-indigo-500'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </section>

      {job.environmentCheck && (
        <section className="mb-6 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 text-sm">
          <p className="font-semibold text-gray-900 dark:text-gray-100">Environment fingerprint</p>
          <p className="mt-1 text-gray-600 dark:text-gray-400">{job.environmentCheck.summary}</p>
          {job.environmentCheck.mismatches.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {job.environmentCheck.mismatches.map((mismatch) => (
                <li key={mismatch.field} className="font-mono text-amber-800 dark:text-amber-300">
                  {mismatch.field}: {mismatch.expected} → {mismatch.actual}
                </li>
              ))}
            </ul>
          )}
          {job.environmentCheck.status === 'mismatch' && job.environmentCheck.acknowledged && (
            <p className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
              Ran with an explicitly acknowledged override.
            </p>
          )}
        </section>
      )}

      {job.failure && (
        <section className="mb-6 rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-950/20 px-4 py-3 text-sm text-rose-800 dark:text-rose-200">
          <p className="font-semibold">{job.failure.title}</p>
          <p className="mt-1">{job.failure.message}</p>
          <p className="mt-2 text-xs">{job.failure.guidance}</p>
          <p className="mt-2 text-xs font-semibold">
            {job.failure.retryable ? 'Retrying may succeed.' : 'Retrying will not help until this is addressed.'}
          </p>
        </section>
      )}

      {result && (
        <section className="mb-6 flex flex-wrap gap-3">
          <Link
            href={`/compare?base=${encodeURIComponent(job.sourceRunId)}&candidate=${encodeURIComponent(result.replayRunId)}`}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Compare source and replay
          </Link>
          <Link
            href={replayRunHref(result.replayRunId)}
            className="rounded-xl border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-semibold text-gray-800 dark:text-gray-200"
          >
            Open replay run
          </Link>
          {result.outcome === 'mismatch' && (
            <a
              href={replayIssueHref(result)}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-amber-300 dark:border-amber-800 px-4 py-2 text-sm font-semibold text-amber-800 dark:text-amber-300"
            >
              Report this result
            </a>
          )}
        </section>
      )}

      {result && (
        <details className="mb-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-gray-900 dark:text-gray-100">
            Diagnostics
          </summary>
          <dl className="mt-3 space-y-2 text-xs">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Command</dt>
              <dd className="font-mono break-all text-gray-900 dark:text-gray-100">
                {result.diagnostics.command} {result.diagnostics.args.join(' ')}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Exit code / duration</dt>
              <dd className="font-mono text-gray-900 dark:text-gray-100">
                {result.diagnostics.exitCode} · {result.diagnostics.durationMs}ms
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">stdout</dt>
              <dd>
                <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-gray-50 dark:bg-gray-950 p-3 text-xs">
                  {result.diagnostics.stdout || '(empty)'}
                </pre>
              </dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">stderr</dt>
              <dd>
                <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-gray-50 dark:bg-gray-950 p-3 text-xs">
                  {result.diagnostics.stderr || '(empty)'}
                </pre>
              </dd>
            </div>
          </dl>
        </details>
      )}

      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Timeline</h2>
        <ol className="mt-3 space-y-2">
          {job.events.map((event) => (
            <li key={event.seq} className="flex items-baseline gap-3 text-xs">
              <span className="w-10 shrink-0 font-mono text-gray-400 dark:text-gray-500">#{event.seq}</span>
              <span className="w-14 shrink-0 text-gray-500 dark:text-gray-400">{event.phase}</span>
              <span className={`flex-1 ${LEVEL_TONE[event.level] ?? LEVEL_TONE.info}`}>{event.message}</span>
              <span className="w-10 shrink-0 text-right tabular-nums text-gray-500 dark:text-gray-400">
                {event.percent}%
              </span>
            </li>
          ))}
        </ol>
        {job.events.length === 0 && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">No progress events recorded.</p>
        )}
      </section>

      <footer className="mt-8 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
        <Link href={`/runs/${encodeURIComponent(job.sourceRunId)}`} className="underline">
          back to source run
        </Link>
        <span>
          Job <span className="font-mono">{job.id}</span>
        </span>
      </footer>
    </main>
  );
}
