export default function CampaignDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl animate-pulse px-6 py-14 md:px-8">
      <div className="mb-6 h-5 w-48 rounded bg-zinc-200 dark:bg-zinc-800" />
      <div className="mb-8 space-y-3">
        <div className="h-9 w-80 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        <div className="h-4 w-full max-w-2xl rounded bg-zinc-100 dark:bg-zinc-900" />
      </div>
      <div className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="h-7 w-64 rounded bg-zinc-200 dark:bg-zinc-800" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 rounded-xl border border-zinc-200 bg-zinc-100/60 dark:border-zinc-800 dark:bg-zinc-900/30" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-52 rounded-xl border border-zinc-200 bg-zinc-100/60 dark:border-zinc-800 dark:bg-zinc-900/30" />
          ))}
        </div>
        <div className="h-40 rounded-xl border border-zinc-200 bg-zinc-100/60 dark:border-zinc-800 dark:bg-zinc-900/30" />
        <div className="h-56 rounded-xl border border-zinc-200 bg-zinc-100/60 dark:border-zinc-800 dark:bg-zinc-900/30" />
      </div>
    </div>
  );
}
