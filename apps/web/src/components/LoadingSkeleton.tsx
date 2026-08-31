export function LoadingSpinner({ label = "Loading..." }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-3">
      <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#0A66C2', borderTopColor: 'transparent' }} />
      <span className="text-meta">{label}</span>
    </div>
  );
}

export function DashboardSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      {/* Tag filter skeleton */}
      <div className="flex gap-2 mb-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-6 w-16 rounded-full" />
        ))}
      </div>

      {/* Recent runs table skeleton */}
      <div className="card table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th><div className="h-4 w-16 bg-zinc-200 dark:bg-zinc-800 rounded" /></th>
              <th><div className="h-4 w-12 bg-zinc-200 dark:bg-zinc-800 rounded" /></th>
              <th><div className="h-4 w-10 bg-zinc-200 dark:bg-zinc-800 rounded" /></th>
              <th><div className="h-4 w-16 bg-zinc-200 dark:bg-zinc-800 rounded" /></th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr key={i}>
                <td><div className="h-4 w-20 bg-zinc-200 dark:bg-zinc-800 rounded" /></td>
                <td><div className="h-5 w-16 bg-zinc-100 dark:bg-zinc-900 rounded-full" /></td>
                <td><div className="h-4 w-12 bg-zinc-100 dark:bg-zinc-900 rounded" /></td>
                <td><div className="h-4 w-20 bg-zinc-100 dark:bg-zinc-900 rounded" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AnalyticsCardsSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div role="status" aria-live="polite" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="card card-padding">
          <div className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800 rounded mb-3 sm:mb-4" />
          <div className="space-y-1.5 sm:space-y-2">
            {Array.from({ length: 3 }).map((_, j) => (
              <div key={j} className="flex justify-between items-center py-0.5 sm:py-1">
                <div className="h-3 w-12 bg-zinc-200 dark:bg-zinc-800 rounded" />
                <div className="h-4 w-6 bg-zinc-100 dark:bg-zinc-900 rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TrendsChartSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      {/* Filters skeleton */}
      <div className="h-10 w-64 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />

      {/* Chart area skeleton */}
      <div className="h-80 bg-zinc-100 dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800">
        <div className="p-4 space-y-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-end gap-2 h-12">
              <div className="w-12 bg-zinc-200 dark:bg-zinc-800 rounded h-full" />
              <div className="flex-1 flex gap-1 items-end">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div
                    key={j}
                    className="flex-1 bg-zinc-200 dark:bg-zinc-800 rounded"
                    style={{ height: `${20 + Math.random() * 60}%` }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg">
            <div className="h-8 w-12 bg-zinc-200 dark:bg-zinc-800 rounded mb-1" />
            <div className="h-3 w-20 bg-zinc-100 dark:bg-zinc-900 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CalendarSkeleton({ weeks = 20 }: { weeks?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-6">
      {/* Stats skeleton */}
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card card-padding">
            <div className="h-6 w-12 bg-zinc-200 dark:bg-zinc-800 rounded mb-1" />
            <div className="h-3 w-16 bg-zinc-100 dark:bg-zinc-900 rounded" />
          </div>
        ))}
      </div>

      {/* Calendar grid skeleton */}
      <div className="card card-padding overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="flex gap-[3px]">
            <div className="flex flex-col gap-[3px] mr-1 pt-0">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-[14px] w-8 bg-zinc-200 dark:bg-zinc-800 rounded" />
              ))}
            </div>
            <div className="flex gap-[3px]">
              {Array.from({ length: weeks }).map((_, i) => (
                <div key={i} className="flex flex-col gap-[3px]">
                  {Array.from({ length: 7 }).map((_, j) => (
                    <div key={j} className="w-[14px] h-[14px] rounded bg-zinc-200 dark:bg-zinc-800" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GenericPageSkeleton({
  variant = "cards",
  rows = 6,
}: {
  variant?: "cards" | "table" | "list" | "form";
  rows?: number;
}) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading page content" className="space-y-6">
      {/* Page header skeleton */}
      <div className="flex-between mb-2">
        <div className="skeleton h-7 w-48" />
        <div className="skeleton h-9 w-28" />
      </div>

      {variant === "cards" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="card card-padding">
              <div className="skeleton h-4 w-2/3 mb-3" />
              <div className="skeleton h-3 w-full mb-2" />
              <div className="skeleton h-3 w-4/5" />
            </div>
          ))}
        </div>
      )}

      {variant === "table" && (
        <div className="card table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                {Array.from({ length: 4 }).map((_, i) => (
                  <th key={i}><div className="skeleton h-4 w-16" /></th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 4 }).map((_, j) => (
                    <td key={j}><div className="skeleton h-4 w-20" /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {variant === "list" && (
        <div className="card divide-y divide-zinc-100 dark:divide-zinc-900">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex-between p-4">
              <div className="skeleton h-4 w-1/3" />
              <div className="skeleton h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {variant === "form" && (
        <div className="card card-padding space-y-4">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i}>
              <div className="skeleton h-3 w-24 mb-2" />
              <div className="skeleton h-9 w-full" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}