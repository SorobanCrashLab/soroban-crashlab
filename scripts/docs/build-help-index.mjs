#!/usr/bin/env node
/**
 * WIP scaffold for issue #2281 (In-App Help Center).
 *
 * Builds a flat JSON index of docs/*.md for the help search. This is a minimal first pass:
 * no version awareness, no nested docs/help/ taxonomy mapping, and no article-slug
 * collision handling yet. Not wired into the build pipeline.
 *
 *   node scripts/docs/build-help-index.mjs > apps/web/src/features/help/generated-index.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DOCS_DIR = path.join(ROOT, "docs");

function slugify(filename) {
  return filename.replace(/\.md$/, "").toLowerCase();
}

function buildIndex() {
  const entries = fs.readdirSync(DOCS_DIR, { withFileTypes: true });
  const articles = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const fullPath = path.join(DOCS_DIR, entry.name);
    const content = fs.readFileSync(fullPath, "utf8");
    const titleMatch = content.match(/^#\s+(.+)$/m);
    articles.push({
      slug: slugify(entry.name),
      title: titleMatch ? titleMatch[1].trim() : entry.name,
      category: "general",
      excerpt: content.slice(0, 200).replace(/\s+/g, " ").trim(),
    });
  }

  return articles;
}

const index = buildIndex();
process.stdout.write(JSON.stringify(index, null, 2));
