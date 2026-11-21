// WIP scaffold for issue #2274. TODO: wire to /api/share-links instead of local-only state.
"use client";

import { useState } from "react";
import type { ShareTokenRecord } from "@/lib/sharing/tokenService";

export function useShareLinks() {
  const [links, setLinks] = useState<ShareTokenRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  return { links, setLinks, isLoading, setIsLoading };
}
