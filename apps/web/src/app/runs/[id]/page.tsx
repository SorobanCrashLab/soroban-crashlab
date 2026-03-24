import Link from 'next/link';

interface RunDetailPageProps {
    params: Promise<{ id: string }>;
}

/**
 * Minimal placeholder for the run detail page to verify navigation.
 */
export default async function RunDetailPage({ params }: RunDetailPageProps) {
    const { id } = await params;

    return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] px-8 max-w-5xl mx-auto w-full py-20">
            <div className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl p-12 text-center">
                <div className="h-16 w-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                </div>
                <h1 className="text-3xl font-bold mb-4">Run Details</h1>
                <p className="text-zinc-500 dark:text-zinc-400 mb-8 font-mono bg-zinc-100 dark:bg-zinc-800 py-2 px-4 rounded-lg inline-block">
                    ID: {id}
                </p>
                <p className="text-zinc-600 dark:text-zinc-300 leading-relaxed mb-10">
                    This is a placeholder for the full execution trace and invariant violation report for run <strong>{id}</strong>.
                    The full detail view implementation is tracked as a separate issue.
                </p>
                <Link
                    href="/"
                    className="inline-flex items-center justify-center h-12 px-8 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 transition"
                >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Dashboard
                </Link>
            </div>
        </div>
    );
}
