/**
 * Loading skeleton for the /runs/[id] detail page.
 */
export default function RunDetailLoading() {
  return (
    <div className="px-6 md:px-8 max-w-5xl mx-auto w-full py-14 animate-pulse">
      <div className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xl p-6 md:p-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <div className="h-9 w-44 bg-zinc-200 dark:bg-zinc-800 rounded-xl mb-3" />
            <div className="h-6 w-52 bg-zinc-100 dark:bg-zinc-900 rounded-lg" />
          </div>
          <div className="h-10 w-40 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
        </div>

        {/* Resource fee section */}
        <div className="mb-8 border border-amber-200 dark:border-amber-900/50 rounded-xl p-4 bg-amber-50/60 dark:bg-amber-950/20">
          <div className="h-5 w-36 bg-amber-200 dark:bg-amber-900/50 rounded mb-3" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-zinc-200 dark:border-zinc-700 p-3">
                <div className="h-4 w-12 bg-zinc-200 dark:bg-zinc-700 rounded mb-2" />
                <div className="h-5 w-24 bg-zinc-200 dark:bg-zinc-700 rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Ledger changes section */}
        <div>
          <div className="h-5 w-44 bg-zinc-200 dark:bg-zinc-800 rounded mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4">
                <div className="flex gap-2 mb-3">
                  <div className="h-5 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
                  <div className="h-5 w-28 bg-zinc-100 dark:bg-zinc-900 rounded" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="h-16 bg-zinc-100 dark:bg-zinc-950 rounded-lg" />
                  <div className="h-16 bg-zinc-100 dark:bg-zinc-950 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
