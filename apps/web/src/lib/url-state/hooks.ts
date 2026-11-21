// WIP scaffold for issue #2277. No debouncing of URL writes yet, and push/replace is
// always "replace" — push-on-significant-change is not implemented.
"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { decodeRouteView, encodeRouteView } from "./codec";
import type { RouteViewSchema } from "./schema";

export function useRouteViewState<T extends Record<string, unknown>>(
  routeId: string,
  config: RouteViewSchema<T>,
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<T>(() =>
    decodeRouteView(routeId, config, searchParams.toString()),
  );

  useEffect(() => {
    setState(decodeRouteView(routeId, config, searchParams.toString()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const updateState = useCallback(
    (next: T) => {
      setState(next);
      const encoded = encodeRouteView(routeId, config, next);
      router.replace(`${pathname}?${encoded}`, { scroll: false });
    },
    [router, pathname, routeId, config],
  );

  return { state, setState: updateState };
}
