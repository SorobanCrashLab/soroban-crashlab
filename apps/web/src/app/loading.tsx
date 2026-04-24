/**
 * Route-level loading UI for the home page.
 * Automatically used by Next.js while HomeContent is rendering.
 */
export default function HomeLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 max-w-5xl mx-auto w-full animate-pulse">
      {/* Hero skeleton */}
      <div className="text-center max-w-3xl mb-16 w-full">
        <div className="h-12 bg-zinc-200 dark:bg-zinc-800 rounded-2xl mb-6 mx-auto w-3/4" />
        <div className="h-5 bg-zinc-200 dark:bg-zinc-800 rounded-xl mb-3 mx-auto w-full" />
        <div className="h-5 bg-zinc-200 dark:bg-zinc-800 rounded-xl mx-auto w-2/3" />
      </div>

      {/* Feature cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full mb-20">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-8 bg-white dark:bg-zinc-950 shadow-sm"
          >
            <div className="h-12 w-12 rounded-lg bg-zinc-200 dark:bg-zinc-800 mb-6" />
            <div className="h-5 bg-zinc-200 dark:bg-zinc-800 rounded-lg mb-3 w-2/3" />
            <div className="h-4 bg-zinc-100 dark:bg-zinc-900 rounded mb-2 w-full" />
            <div className="h-4 bg-zinc-100 dark:bg-zinc-900 rounded w-4/5" />
          </div>
        ))}
      </div>

      {/* Run table skeleton */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-6">
          <div className="h-7 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-lg" />
          <div className="h-7 w-28 bg-zinc-100 dark:bg-zinc-900 rounded-lg" />
        </div>
        <div className="mb-4 flex gap-3">
          <div className="h-9 w-36 bg-zinc-100 dark:bg-zinc-900 rounded-lg" />
          <div className="h-9 w-36 bg-zinc-100 dark:bg-zinc-900 rounded-lg" />
        </div>
        <div className="w-full overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm bg-white dark:bg-zinc-950">
          <div className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 flex gap-8">
            {['w-24', 'w-20', 'w-20', 'w-20'].map((w, i) => (
              <div key={i} className={`h-4 bg-zinc-200 dark:bg-zinc-800 rounded ${w}`} />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-900 flex gap-8 items-center"
            >
              <div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded" />
              <div className="h-5 w-20 bg-zinc-100 dark:bg-zinc-900 rounded-full" />
              <div className="h-4 w-16 bg-zinc-100 dark:bg-zinc-900 rounded" />
              <div className="h-4 w-16 bg-zinc-100 dark:bg-zinc-900 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
