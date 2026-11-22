import Link from 'next/link';
import { buildMockRuns } from '../mockRuns';
import {
  ComparisonTooLargeError,
  compareSides,
  hasNoChanges,
  type ComparisonRow,
} from '@/lib/comparison/delta';
import { toComparisonSide } from '@/lib/comparison/from-run';
import {
  comparisonHref,
  decodeComparisonSearch,
  matchesComparisonFilter,
  type ComparisonSearchState,
} from '@/lib/comparison/url-state';

export const dynamic = 'force-dynamic';

interface ComparePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function DeltaBadge({ delta }: { delta: number }) {
  const tone =
    delta > 0
      ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {delta > 0 ? `+${delta}` : delta}
    </span>
  );
}

function SignatureRow({ row }: { row: ComparisonRow }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b border-gray-100 dark:border-gray-800 py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate font-mono text-xs text-gray-800 dark:text-gray-200" title={row.signature}>
          {row.signature}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {row.failureClass ?? 'unclassified'}
          {row.contract ? ` · ${row.contract}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-gray-600 dark:text-gray-300">
        <span>{row.baseCount}</span>
        <span aria-hidden="true">→</span>
        <span>{row.candidateCount}</span>
        <DeltaBadge delta={row.delta} />
      </div>
    </li>
  );
}

function Bucket({
  title,
  subtitle,
  rows,
  empty,
}: {
  title: string;
  subtitle: string;
  rows: ComparisonRow[];
  empty: string;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {title} <span className="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400">({rows.length})</span>
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
      </header>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500 py-4">{empty}</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <SignatureRow key={row.signature} row={row} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function ComparePage({ searchParams }: ComparePageProps) {
  const params = await searchParams;
  const runs = buildMockRuns();
  const decoded = decodeComparisonSearch(params);
  const state: ComparisonSearchState | null = decoded.ok ? decoded.state : null;

  let pageError: string | null = decoded.ok ? null : decoded.message;
  let tooLarge: ComparisonTooLargeError | null = null;
  let result: ReturnType<typeof compareSides> | null = null;

  if (state) {
    const baseRun = runs.find((run) => run.id === state.base);
    const candidateRun = runs.find((run) => run.id === state.candidate);

    if (!baseRun) {
      pageError = `Run ${state.base} was not found.`;
    } else if (!candidateRun) {
      pageError = `Run ${state.candidate} was not found.`;
    } else {
      const filters = {
        ...(state.failureClass !== undefined ? { failureClass: state.failureClass } : {}),
        ...(state.contract !== undefined ? { contract: state.contract } : {}),
      };
      const base = toComparisonSide(baseRun);
      const candidate = toComparisonSide(candidateRun);

      try {
        result = compareSides(
          { ...base, signatures: base.signatures.filter((sample) => matchesComparisonFilter(sample, filters)) },
          {
            ...candidate,
            signatures: candidate.signatures.filter((sample) => matchesComparisonFilter(sample, filters)),
          },
        );
      } catch (error) {
        if (error instanceof ComparisonTooLargeError) tooLarge = error;
        else throw error;
      }
    }
  }

  const shareHref = state ? comparisonHref(state) : null;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
          Comparison builder
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">
          Compare two fuzz runs
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">
          Grouped by crash signature: what appeared, what disappeared, and which frequencies moved. The
          link in your address bar is the whole comparison, so it can be shared as-is.
        </p>
      </header>

      <form method="get" action="/compare" className="mb-8 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
            Baseline
            <select
              name="base"
              defaultValue={state?.base ?? ''}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
            >
              <option value="">Select a run</option>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.id} ({run.area}, {run.status})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
            Candidate
            <select
              name="candidate"
              defaultValue={state?.candidate ?? ''}
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
            >
              <option value="">Select a run</option>
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.id} ({run.area}, {run.status})
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
            Failure class (optional)
            <input
              name="failureClass"
              defaultValue={state?.failureClass ?? ''}
              placeholder="auth"
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium text-gray-700 dark:text-gray-300">
            Contract filter (optional)
            <input
              name="contract"
              defaultValue={state?.contract ?? ''}
              placeholder="token"
              className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
            />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            Compare
          </button>
          {shareHref && (
            <Link href={shareHref} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 underline">
              reload this comparison
            </Link>
          )}
        </div>
      </form>

      {pageError && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-200"
        >
          {pageError}
        </div>
      )}

      {tooLarge && (
        <div
          role="alert"
          className="mb-6 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-800 dark:text-red-200"
        >
          <p className="font-semibold">That comparison is too large to render.</p>
          <p className="mt-1">{tooLarge.guidance}</p>
          <p className="mt-1 text-xs">
            {tooLarge.signatureCount} signatures, limit {tooLarge.limit}.
          </p>
        </div>
      )}

      {result && (
        <>
          {hasNoChanges(result.delta) && (
            <div className="mb-6 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
              <p className="font-semibold">No signature changes between these runs.</p>
              <p className="mt-1">
                Every signature that appeared in the baseline also appeared, at the same frequency, in the
                candidate. If you expected a fix, check that the candidate used the same seed set.
              </p>
            </div>
          )}

          <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {result.delta.metrics.map((metric) => (
              <div
                key={metric.key}
                className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4"
              >
                <p className="text-xs text-gray-500 dark:text-gray-400">{metric.label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  {metric.base}
                  {metric.unit === '%' ? '%' : ''}
                  <span aria-hidden="true" className="mx-1 text-gray-400">→</span>
                  {metric.candidate}
                  {metric.unit === '%' ? '%' : ''}
                </p>
                <p
                  className={`mt-1 text-xs font-medium ${
                    metric.delta === 0
                      ? 'text-gray-500 dark:text-gray-400'
                      : metric.higherIsBetter === metric.delta > 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {metric.delta > 0 ? '+' : ''}
                  {metric.delta}
                  {metric.unit === 'ms' ? 'ms' : metric.unit === '%' ? 'pp' : ''}
                </p>
              </div>
            ))}
          </section>

          <div className="grid gap-5 lg:grid-cols-3">
            <Bucket
              title="Added"
              subtitle="Only in the candidate"
              rows={result.delta.added}
              empty="The candidate introduced no new signatures."
            />
            <Bucket
              title="Removed"
              subtitle="Only in the baseline — fixed or masked"
              rows={result.delta.removed}
              empty="No baseline signature disappeared."
            />
            <Bucket
              title="Changed"
              subtitle="In both runs, frequency moved"
              rows={result.delta.changed}
              empty="No shared signature changed frequency."
            />
          </div>

          <footer className="mt-8 flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            <span>
              {result.delta.unchanged.length} unchanged of{' '}
              {result.delta.totals.baseSignatures + result.delta.totals.added} signatures
            </span>
            <Link
              href={`/compare?base=${encodeURIComponent(result.candidate.runId)}&candidate=${encodeURIComponent(result.base.runId)}`}
              className="font-medium text-indigo-600 dark:text-indigo-400 underline"
            >
              swap baseline and candidate
            </Link>
            <Link
              href={`/runs/${encodeURIComponent(result.base.runId)}`}
              className="font-medium text-indigo-600 dark:text-indigo-400 underline"
            >
              open baseline run
            </Link>
            <Link
              href={`/runs/${encodeURIComponent(result.candidate.runId)}`}
              className="font-medium text-indigo-600 dark:text-indigo-400 underline"
            >
              open candidate run
            </Link>
          </footer>
        </>
      )}
    </main>
  );
}
