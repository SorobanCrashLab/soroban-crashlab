"use client";

import { usePathname } from "next/navigation";

const MAX_DISPLAY_LENGTH = 200;

export function RequestedNotFoundPath() {
  const pathname = usePathname();
  const displayPath = pathname
    ? pathname.length > MAX_DISPLAY_LENGTH
      ? `${pathname.slice(0, MAX_DISPLAY_LENGTH - 1)}…`
      : pathname
    : "Unknown path";

  return (
    <code
      className="mt-3 block max-w-full overflow-x-auto rounded-lg border px-4 py-3 text-left font-mono text-xs sm:text-sm"
      style={{
        borderColor: "var(--border-color)",
        backgroundColor: "var(--surface)",
        color: "var(--text-secondary)",
      }}
      suppressHydrationWarning
    >
      {displayPath}
    </code>
  );
}
