// WIP scaffold for issue #2281. Renders raw Markdown as text; sanitized Markdown-to-HTML
// rendering is not implemented yet — do not render this as innerHTML.
"use client";

import type { HelpArticle } from "./contentIndex";

export function ArticleViewer({
  article,
  content,
}: {
  article: HelpArticle;
  content: string;
}) {
  return (
    <article aria-label={article.title}>
      <h2>{article.title}</h2>
      <pre className="article-viewer__raw">{content}</pre>
    </article>
  );
}
