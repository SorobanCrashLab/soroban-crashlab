import Link from 'next/link';
import type { ExpensiveFixture } from '../../resource-fee-insight-utils';
import { formatBytes, formatNumber } from '../../run-metrics';

interface ExpensiveFixtureTableProps {
  fixtures: ExpensiveFixture[];
}

function statusSummary(fixture: ExpensiveFixture): string {
  const entries = Object.entries(fixture.statuses);
  if (entries.length === 0) return 'n/a';
  return entries.map(([status, count]) => `${status} ${count}`).join(' · ');
}

export function ExpensiveFixtureTable({ fixtures }: ExpensiveFixtureTableProps) {
  if (fixtures.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Top expensive fixtures
        </h3>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          No expensive fixtures in this campaign yet.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Top expensive fixtures
        </h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Ranked by peak minimum resource fee · click through to the run detail
        </p>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="data-table min-w-full text-sm">
          <caption className="sr-only">
            Most expensive fixtures ranked by peak minimum resource fee
          </caption>
          <thead>
            <tr>
              <th scope="col">Fixture</th>
              <th scope="col">Runs</th>
              <th scope="col">Max fee</th>
              <th scope="col">Avg fee</th>
              <th scope="col">Max CPU</th>
              <th scope="col">Max memory</th>
              <th scope="col">Status</th>
              <th scope="col">Run detail</th>
            </tr>
          </thead>
          <tbody>
            {fixtures.map((fixture) => (
              <tr key={fixture.fixture}>
                <td className="max-w-[16rem] truncate font-mono" title={fixture.fixture}>
                  {fixture.fixture}
                </td>
                <td>{fixture.runCount}</td>
                <td className="font-medium">{fixture.maxFee.toLocaleString()} stroops</td>
                <td>{fixture.avgFee.toLocaleString()} stroops</td>
                <td>{formatNumber(fixture.maxCpu)}</td>
                <td>{formatBytes(fixture.maxMemory)}</td>
                <td className="text-xs text-zinc-600 dark:text-zinc-400">
                  {statusSummary(fixture)}
                  {fixture.expensiveCount > 0 && (
                    <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-950/40 dark:text-red-200">
                      {fixture.expensiveCount} flagged
                    </span>
                  )}
                </td>
                <td>
                  <Link
                    href={fixture.href}
                    className="font-mono text-xs underline decoration-dotted underline-offset-4 hover:text-sky-700 dark:hover:text-sky-300"
                  >
                    View {fixture.representativeRunId}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
