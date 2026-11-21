// WIP scaffold for issue #2281 (In-App Help Center). Not wired to the real content index
// or search API yet — see docs/help/ for current status.
"use client";

import { useState } from "react";
import { HelpSearch } from "./HelpSearch";
import { ArticleViewer } from "./ArticleViewer";
import type { HelpArticle } from "./contentIndex";

export function HelpCenter({ articles }: { articles: HelpArticle[] }) {
  const [selected, setSelected] = useState<HelpArticle | null>(null);

  return (
    <div role="region" aria-label="Help center">
      <HelpSearch articles={articles} onSelect={setSelected} />
      {selected ? <ArticleViewer article={selected} content={selected.excerpt} /> : null}
    </div>
  );
}
