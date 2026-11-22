// WIP scaffold for issue #2281. Real route -> article mapping not implemented yet.
"use client";

import { usePathname } from "next/navigation";

const ROUTE_HINTS: Record<string, string[]> = {
  "/campaigns": ["getting-started"],
  "/triage": ["faq"],
};

export function useHelpContext() {
  const pathname = usePathname();
  const suggestedSlugs = ROUTE_HINTS[pathname] ?? [];
  return { pathname, suggestedSlugs };
}
