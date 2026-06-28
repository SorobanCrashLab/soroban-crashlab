import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { LedgerStateChange } from '../../types';
import { buildMockRuns } from '../../mockRuns';
import RunIssueLinkPage53 from '../../add-run-issue-link-page-53';
import RunStatusTimeline from '../../RunStatusTimeline';
import DownloadArtifactsButton from './DownloadArtifactsButton';
import ContractStateDiffView from '../../components/ContractStateDiffView';
import AddRunReplayHistoryWithTimestamps from '../../add-run-replay-history-with-timestamps';

interface RunDetailPageProps {
    params: Promise<{ id: string }>;
}

const ledgerChanges: LedgerStateChange[] = [
    {
        id: 'entry-1',
        entryType: 'ContractData',
        changeType: 'created',
        after: '{"key":"allowance:alice:bob","value":"1000"}',
    },
    {
        id: 'entry-2',
        entryType: 'Account',
        changeType: 'updated',
        before: '{"balance":"10000000","seq":"184"}',
        after: '{"balance":"9800000","seq":"185"}',
    },
    {
        id: 'entry-3',
        entryType: 'TrustLine',
        changeType: 'deleted',
        before: '{"asset":"USDC","limit":"500","balance":"0"}',
    },
];

const formatBytes = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
const formatDate = (value?: string): string => (value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) : 'Pending');

export default async function RunDetailPage({ params }: RunDetailPageProps) {
    const { id } = await params;
    const run = buildMockRuns().find((entry) => entry.id === id);

    if (!run) {
        notFound();
    }

    const cpuWarn = run.cpuInstructions >= 900_000;
    const memoryWarn = run.memoryBytes >= 7_000_000;
    const feeWarn = run.minResourceFee >= 3_000;

    return (
        <div className="px-6 md:px-8 max-w-5xl mx-auto w-full py-14">
            <div className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl p-6 md:p-8">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">Run Details</h1>
                        <p className="text-zinc-500 dark:text-zinc-400 font-mono bg-zinc-100 dark:bg-zinc-800 py-2 px-3 rounded-lg inline-block">
                            ID: {run.id}
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <DownloadArtifactsButton run={run} ledgerChanges={ledgerChanges} />
                        <Link
                            href="/"
                            className="inline-flex items-center justify-center h-10 px-4 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition"
                        >
                            Back to Dashboard
                        </Link>
                    </div>
                </div>

                <div className="mb-8">
                    <RunStatusTimeline
                        status={run.status}
                        queuedAt={formatDate(run.queuedAt)}
                        startedAt={formatDate(run.startedAt)}
                        finishedAt={formatDate(run.finishedAt)}
                    />
                </div>

                <RunIssueLinkPage53 issues={run.associatedIssues ?? []} />

                <section className="mb-8 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 bg-amber-50/60 dark:bg-amber-950/20">
                    <h2 className="text-lg font-semibold mb-3">Resource Fee Insight</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div className={`rounded-lg border p-3 ${cpuWarn ? 'border-amber-300 dark:border-amber-800 bg-amber-100/70 dark:bg-amber-900/20' : 'border-zinc-200 dark:border-zinc-700'}`}>
                            <div className="text-zinc-500 dark:text-zinc-400">CPU</div>
                            <div className="font-semibold">{run.cpuInstructions.toLocaleString()}</div>
                        </div>
                        <div className={`rounded-lg border p-3 ${memoryWarn ? 'border-amber-300 dark:border-amber-800 bg-amber-100/70 dark:bg-amber-900/20' : 'border-zinc-200 dark:border-zinc-700'}`}>
                            <div className="text-zinc-500 dark:text-zinc-400">Memory</div>
                            <div className="font-semibold">{formatBytes(run.memoryBytes)}</div>
                        </div>
                        <div className={`rounded-lg border p-3 ${feeWarn ? 'border-amber-300 dark:border-amber-800 bg-amber-100/70 dark:bg-amber-900/20' : 'border-zinc-200 dark:border-zinc-700'}`}>
                            <div className="text-zinc-500 dark:text-zinc-400">Min Resource Fee</div>
                            <div className="font-semibold">{run.minResourceFee.toLocaleString()} stroops</div>
                        </div>
                    </div>
                </section>

                {run.annotations && run.annotations.length > 0 && (
                    <section className="mb-8 border border-indigo-200 dark:border-indigo-900/50 rounded-xl p-6 bg-indigo-50/30 dark:bg-indigo-950/20">
                        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                            <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                            </svg>
                            Run Annotations
                        </h2>
                        {run.annotations && run.annotations.length > 0 ? (
                            <ul className="space-y-3">
                                {run.annotations.map((note, index) => (
                                    <li key={index} className="text-sm text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-950/60 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/40 shadow-sm leading-relaxed">
                                        {note}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="flex flex-col items-center gap-3 py-8 text-center">
                                <div className="p-3 bg-indigo-100/60 dark:bg-indigo-900/30 rounded-full text-indigo-400 dark:text-indigo-500">
                                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                                    </svg>
                                </div>
                                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">No annotations yet</p>
                                <p className="text-xs text-zinc-400 dark:text-zinc-500">Run results will appear here once notes are added</p>
                            </div>
                        )}
                    </section>
                )}

                <section>
                    <h2 className="text-lg font-semibold mb-3">Ledger State Change Diff</h2>
                    <ContractStateDiffView changes={ledgerChanges} />
                </section>

                <div className="mt-6">
                    <AddRunReplayHistoryWithTimestamps sourceRunId={run.id} />
                </div>
            </div>
        </div>
    );
}
