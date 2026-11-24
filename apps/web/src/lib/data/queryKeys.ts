// WIP scaffold for issue #2276 (Unified State & Data Fetching Architecture).

export const queryKeys = {
  runs: {
    all: () => ["runs"] as const,
    detail: (id: string) => ["runs", id] as const,
  },
  campaigns: {
    all: () => ["campaigns"] as const,
    detail: (id: string) => ["campaigns", id] as const,
  },
  crashes: {
    all: () => ["crashes"] as const,
    detail: (id: string) => ["crashes", id] as const,
  },
  integrations: {
    all: () => ["integrations"] as const,
  },
  settings: {
    all: () => ["settings"] as const,
  },
} as const;

export type QueryKey = readonly unknown[];
