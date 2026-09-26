import type { RunIssueLink } from './types';

interface RunIssueLinkPage53Props {
    issues: RunIssueLink[];
}

export default function RunIssueLinkPage53({ issues }: RunIssueLinkPage53Props) {
    return (
        <section className="mb-8 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 bg-white dark:bg-zinc-950 shadow-sm">
            <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                    <h2 className="text-lg font-semibold">Related Issues</h2>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                        Jump straight from this run to the matching GitHub issues.
                    </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-blue-200 dark:border-blue-900/60 bg-blue-50 dark:bg-blue-950/30 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
                    {issues.length} linked
                </span>
            </div>

            {issues.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                    No related issues are linked to this run yet.
                </div>
            ) : (
                <ul className="space-y-3">
                    {issues.map((issue) => (
                        <li
                            key={issue.href}
                            className="flex flex-col gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 px-4 py-3 md:flex-row md:items-center md:justify-between"
                        >
                            <span className="font-medium text-zinc-900 dark:text-zinc-100">{issue.label}</span>
                            <a
                                href={issue.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 transition hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                            >
                                Open issue
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5h5m0 0v5m0-5L10 14" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14v5H5V5h5" />
                                </svg>
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
