// WIP scaffold for issue #2276. Development-only cache inspector; no visual devtools UI yet.

import { queryCache } from "./queryClient";

export function logCacheSnapshot(): void {
  if (process.env.NODE_ENV !== "development") return;
  // eslint-disable-next-line no-console
  console.debug("[data-layer] cache snapshot", queryCache);
}
