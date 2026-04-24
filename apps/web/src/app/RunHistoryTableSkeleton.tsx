/**
 * Animated skeleton that mirrors RunHistoryTable's layout.
 * Shown while run data is being fetched.
 */
export default function RunHistoryTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="w-full overflow-hidden border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm bg-white dark:bg-zinc-950 animate-pulse">
      {/* Header row */}
      <div className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 grid grid-cols-4 gap-4">
        {['w-16', 'w-14', 'w-20', 'w-20'].map((w, i) => (
          <div key={i} className={`h-4 bg-zinc-200 dark:bg-zinc-700 rounded ${w} ${i >= 2 ? 'ml-auto' : ''}`} />
        ))}
      </div>

      {/* Data rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="px-6 py-4 border-b last:border-b-0 border-zinc-100 dark:border-zinc-900 grid grid-cols-4 gap-4 items-center"
        >
          {/* Run ID */}
          <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-28" />
          {/* Status badge */}
          <div className="h-5 bg-zinc-100 dark:bg-zinc-900 rounded-full w-20" />
          {/* Duration */}
          <div className="h-4 bg-zinc-100 dark:bg-zinc-900 rounded w-14 ml-auto" />
          {/* Seed count */}
          <div className="h-4 bg-zinc-100 dark:bg-zinc-900 rounded w-16 ml-auto" />
        </div>
      ))}
    </div>
  );
}
