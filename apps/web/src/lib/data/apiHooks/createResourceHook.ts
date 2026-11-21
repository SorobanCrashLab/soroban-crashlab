// WIP scaffold for issue #2276. Shared fetch-and-cache logic used by the per-domain hooks
// in this folder; not a real query library (no retry policy, request dedup, or background
// refetch).
"use client";

import { useEffect, useState } from "react";
import { queryCache } from "../queryClient";
import type { QueryKey } from "../queryKeys";

export function createResourceHook(basePath: string) {
  return function useResource(id: string) {
    const key: QueryKey = [basePath, id];
    const [data, setData] = useState<unknown>(() => queryCache.get(key)?.data);
    const [isLoading, setIsLoading] = useState(!data);

    useEffect(() => {
      let active = true;
      setIsLoading(true);
      fetch(`${basePath}/${id}`)
        .then((response) => response.json())
        .then((result) => {
          if (!active) return;
          queryCache.set(key, result);
          setData(result);
        })
        .finally(() => {
          if (active) setIsLoading(false);
        });
      return () => {
        active = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    return { data, isLoading };
  };
}
