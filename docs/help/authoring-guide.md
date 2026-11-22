# Help Article Authoring Guide (WIP)

Tracks issue #2281. This is a minimal placeholder, not a finished authoring standard.

Until the content pipeline is more than a flat `docs/*.md` scan (see
`scripts/docs/build-help-index.mjs`), authors should:

- Start every article with a single `# Title` heading — the index builder extracts it.
- Keep the first ~200 characters descriptive; they're used as the search excerpt until a
  dedicated frontmatter/summary field exists.
- Avoid embedding raw HTML or scripts — the in-app viewer (`ArticleViewer.tsx`) currently
  renders content as plain text, not sanitized HTML, so Markdown formatting will not render
  yet either.

Open items: frontmatter schema (category, version, audience), image handling, and a real
sanitized Markdown renderer. See [taxonomy.md](./taxonomy.md) for category status.
