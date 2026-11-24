// WIP scaffold for issue #2281. Client-side search index loading not wired up yet.
"use client";

import { useState } from "react";
import type { HelpArticle } from "./contentIndex";
import { searchArticles } from "./contentIndex";

export function HelpSearch({
  articles,
  onSelect,
}: {
  articles: HelpArticle[];
  onSelect: (article: HelpArticle) => void;
}) {
  const [query, setQuery] = useState("");
  const results = searchArticles(articles, query);

  return (
    <div role="search" aria-label="Help search">
      <input
        aria-label="Search help articles"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul>
        {results.map((article) => (
          <li key={article.slug}>
            <button type="button" onClick={() => onSelect(article)}>
              {article.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
