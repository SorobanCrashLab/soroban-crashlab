import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { FuzzingRun, LedgerStateChange } from '../../types';
import RunTimeline from './RunTimeline';

export const dynamic = 'force-dynamic';

interface RunDetail extends FuzzingRun {
    ledgerChanges?: LedgerStateChange[];
}

interface RunDetailPageProps {
    params: Promise<{ id: string }>;
}

const formatDate = (value?: string): string => value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) : 'Pending';

async function fetchRun(id: string): Promise<RunDetail | null> {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const res = await fetch(`${base}/api/runs/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Failed to fetch run ${id}`);
    return res.json() as Promise<RunDetail>;
}

export default async function RunDetailPage({ params }: RunDetailPageProps) {
    const { id } = await params;
    const run = await fetchRun(id);

    if (!run) notFound();

    const ledgerChanges = run.ledgerChanges ?? [];

    return (
        <div className="container-full px-6 py-6 fade-in">
            <div className="card card-padding">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <Link href="/runs" className="link text-sm">← Back to Runs</Link>
                        </div>
                        <h1 className="heading-page">Run Details</h1>
                        <p className="code-text mt-1" style={{ color: '#666666' }}>ID: {run.id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`badge badge-${run.status}`}>{run.status}</span>
                        <Link href="/" className="btn-outline text-sm">Dashboard</Link>
                    </div>
                </div>

                <div className="mb-6">
                    <RunTimeline
                        status={run.status}
                        queuedAt={formatDate(run.queuedAt)}
                        startedAt={formatDate(run.startedAt)}
                        finishedAt={formatDate(run.finishedAt)}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                    {[
                        { label: 'CPU Instructions', value: run.cpuInstructions.toLocaleString(), warn: run.cpuInstructions >= 900_000 },
                        { label: 'Memory', value: `${(run.memoryBytes / (1024 * 1024)).toFixed(1)} MB`, warn: run.memoryBytes >= 7_000_000 },
                        { label: 'Min Resource Fee', value: `${run.minResourceFee.toLocaleString()} stroops`, warn: run.minResourceFee >= 3_000 },
                    ].map((metric) => (
                        <div key={metric.label} className={`card card-padding ${metric.warn ? '' : ''}`} style={metric.warn ? { borderLeft: '4px solid #C37D16' } : {}}>
                            <div className="text-meta text-sm">{metric.label}</div>
                            <div className="font-semibold text-lg mt-1">{metric.value}</div>
                            {metric.warn && <div className="text-xs mt-1" style={{ color: '#C37D16' }}>Above threshold</div>}
                        </div>
                    ))}
                </div>

                {run.crashDetail && (
                    <div className="card card-padding mb-6" style={{ borderLeft: '4px solid #CC1016' }}>
                        <h2 className="font-semibold mb-3" style={{ color: '#CC1016' }}>Crash Details</h2>
                        <div className="space-y-2">
                            <div><span className="text-meta">Category:</span> <span className="font-medium">{run.crashDetail.failureCategory}</span></div>
                            <div><span className="text-meta">Signature:</span> <span className="code-text">{run.crashDetail.signature}</span></div>
                            {run.crashDetail.signatureHash && (
                                <div><span className="text-meta">Hash:</span> <span className="code-text">{run.crashDetail.signatureHash}</span></div>
                            )}
                        </div>
                    </div>
                )}

                {ledgerChanges.length > 0 && (
                    <div className="card card-padding">
                        <h2 className="font-semibold mb-4">Ledger State Changes</h2>
                        <div className="space-y-3">
                            {ledgerChanges.map((change) => (
                                <div key={change.id} className="list-item" style={{ padding: '12px 0' }}>
                                    <div className="flex-1">
                                        <div className="font-medium">{change.entryType}</div>
                                        <div className="text-meta text-xs mt-1">
                                            {change.changeType} &middot; {change.id}
                                            {change.before && <span> &middot; Before: {change.before}</span>}
                                            {change.after && <span> &middot; After: {change.after}</span>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
