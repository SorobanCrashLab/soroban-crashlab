// WIP scaffold for issue #2281 (In-App Help Center). Reads the build-time index generated
// by scripts/docs/build-help-index.mjs; version awareness and offline caching are pending.

export interface HelpArticle {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
}

export function searchArticles(articles: HelpArticle[], query: string): HelpArticle[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return articles;
  return articles.filter(
    (article) =>
      article.title.toLowerCase().includes(normalized) ||
      article.excerpt.toLowerCase().includes(normalized),
  );
}
